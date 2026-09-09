#!/usr/bin/env node
// SIEMBRA `public.persona_tarifa` CON EL $/HORA QUE HOY SÓLO VIVE EN LA PLANILLA DEL DUEÑO.
//
//   node orquestador/scripts/persona-tarifa-sembrar.mjs             → muestra qué insertaría
//   node orquestador/scripts/persona-tarifa-sembrar.mjs --aplicar   → inserta
//   node orquestador/scripts/persona-tarifa-sembrar.mjs --desde 2026-09-01
//
// ═══ POR QUÉ HACE FALTA ═══
//
// El módulo de Liquidación de la web multiplica horas por plata. Las horas ya están en Postgres
// (`registros_hh`, `asistencia_dia`); la plata no está en ningún lado: el $/hora de cada persona lo
// escribe el dueño en su planilla JORNALES y el Flujo de Caja lo replica en la pestaña oculta
// `_J_OBREROS` (columna 22 del bloque de la quincena). `personas.retribucion_pactada` NO sirve —es
// lo que dice la constancia de ARCA, congelada al alta, y no tiene GRANT de lectura para nadie—.
//
// ═══ SÓLO LECTURA SOBRE EL SHEET, Y ESO NO ES UNA PRECAUCIÓN DECORATIVA ═══
//
// Este script se puede correr desde un worktree porque no escribe una celda: un generador corrido
// desde un worktree ya borró la pestaña Proveedores entera. Acá el Sheet es fuente y nada más; lo
// que se escribe es Postgres.
//
// ═══ IDEMPOTENTE POR VALOR, NO POR EXISTENCIA ═══
//
// Si la tarifa vigente de la persona YA es la misma, no se inserta nada. Si cambió, entra una fila
// nueva con `desde` — nunca un UPDATE: pisar el valor viejo haría que recalcular una quincena de
// marzo la liquide a la tarifa de septiembre, en silencio.

import { makeGoogleClient } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { query, closePool } from '../lib/db.mjs'
import { detectarQuincenas } from '../lib/nomina-sync.mjs'
import { claveNombre, plantelDelEspejo } from '../lib/desvinculacion-plantel.mjs'
import { CUIL_POR_PERSONA_DE_PLANILLA, SUELDO_NETO_OFICINA } from '../lib/nomina-banco-recibo.mjs'

/** El Flujo de Caja. `_J_OBREROS` es el espejo de la pestaña «Obreros 26» de JORNALES. */
const FLUJO_ID = '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const HOJA = '_J_OBREROS'
const RANGO = `'${HOJA}'!A1:AC990`
export const ORIGEN = 'sheet:_J_OBREROS'
/** Oficina no cobra por hora: cobra un neto mensual acordado, y ese acuerdo no está en `_J_OBREROS`. */
export const ORIGEN_OFICINA = 'acuerdo:SUELDO_NETO_OFICINA'

const APLICAR = process.argv.includes('--aplicar')

/**
 * DESDE CUÁNDO RIGE LA TARIFA SEMBRADA.
 *
 * Por defecto, el primer día de la quincena EN CURSO: es la única fecha que se puede afirmar sin
 * inventar historia. La planilla trae UNA columna de tarifa por bloque, así que sembrar «desde
 * siempre» diría que el aumento de agosto rige desde enero — y reliquidaría el año.
 */
export function desdePorDefecto(hoy = new Date()) {
  const d = hoy.getUTCDate() <= 15 ? 1 : 16
  return `${hoy.getUTCFullYear()}-${String(hoy.getUTCMonth() + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/** El puente nombre de planilla → CUIL, con la clave normalizada de `claveNombre`. */
export const CUIL_POR_CLAVE = new Map(
  Object.entries(CUIL_POR_PERSONA_DE_PLANILLA).map(([nombre, cuil]) => [claveNombre(nombre), cuil]),
)

/**
 * NÚCLEO PURO: qué habría que insertar, dado el plantel del espejo y lo que la base ya tiene.
 *
 * @param {Array<{clave:string,nombre:string,jornalPactado:number}>} plantel
 * @param {Map<string,{persona_id:string,nombre:string}>} personaPorCuil
 * @param {Map<string,number>} vigentePorPersona  persona_id → valor_hora vigente hoy
 * @returns {{insertar:Array, iguales:Array, sinTarifa:Array, sinPersona:Array}}
 */
export function planDeSembrado(plantel, personaPorCuil, vigentePorPersona) {
  const insertar = []
  const iguales = []
  const sinTarifa = []
  const sinPersona = []
  for (const p of plantel) {
    const valor = Number(p.jornalPactado)
    // SIN $/HORA EN LA PLANILLA NO SE INVENTA UNO. Una tarifa en cero liquidaría a esa persona en
    // $ 0 con la misma cara que un importe correcto.
    if (!Number.isFinite(valor) || valor <= 0) { sinTarifa.push(p.nombre); continue }
    const cuil = CUIL_POR_CLAVE.get(p.clave)
    const persona = cuil ? personaPorCuil.get(cuil) : undefined
    // EL PUENTE ES DECLARADO, NO ADIVINADO. «Castillo Carlos» ya cayó una vez en «GONZALEZ CARLOS
    // SAMUEL» por parecido de nombre. Con plata de sueldo de por medio, un candidato no alcanza:
    // quien no está en el puente sale listado y lo carga una persona.
    if (!persona) { sinPersona.push({ nombre: p.nombre, cuil: cuil ?? null, valor }); continue }
    const ya = vigentePorPersona.get(persona.persona_id)
    if (ya != null && Number(ya) === valor) {
      iguales.push({ nombre: p.nombre, persona: persona.nombre, valor })
      continue
    }
    insertar.push({
      persona_id: persona.persona_id,
      nombre: p.nombre,
      personaBase: persona.nombre,
      valor,
      anterior: ya == null ? null : Number(ya),
    })
  }
  return { insertar, iguales, sinTarifa, sinPersona }
}

const pesos = (n) => `$${Number(n).toLocaleString('es-AR')}`

async function main() {
  const desde = process.argv.includes('--desde')
    ? process.argv[process.argv.indexOf('--desde') + 1]
    : desdePorDefecto()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(desde)) throw new Error(`--desde inválido: «${desde}»`)

  const google = makeGoogleClient({ config: loadConfig() })
  const grid = await google.readSheetValues(FLUJO_ID, RANGO)
  const bloques = detectarQuincenas(grid ?? [])
  if (bloques.length === 0) {
    throw new Error(`no encontré ni un bloque de quincena en '${HOJA}': NO siembro nada`)
  }
  // EL PLANTEL DEL ESPEJO YA RESUELVE LAS TRES TRAMPAS de esta planilla (el nombre dado vuelta, la
  // fecha de ingreso reescrita, el reingreso) y se queda con el $/hora del bloque MÁS RECIENTE, que
  // es exactamente «el de la última quincena de cada persona». Reimplementarlo acá sería una segunda
  // lectura del mismo Sheet con otro criterio.
  const plantel = plantelDelEspejo(grid ?? [], bloques)
  // ═══ SÓLO EL BLOQUE MÁS RECIENTE ═══
  //
  // El espejo trae el AÑO ENTERO: 37 personas, y veinte de ellas dejaron de aparecer en marzo. La
  // tarifa que se siembra es la de quien está cobrando HOY; sembrar la de alguien que se fue en
  // enero le dejaría en la base un $/hora vigente que ninguna quincena va a usar, y que el día que
  // vuelva lo liquidaría a la tarifa de hace ocho meses.
  const ultimo = bloques.length - 1
  const vivos = [...plantel.values()].filter((p) => p.bloques.includes(ultimo))

  const { rows: personas } = await query(
    `select id, nombre_completo, cuil from public.personas where cuil is not null`,
  )
  const personaPorCuil = new Map(personas.map((r) => [r.cuil, {
    persona_id: r.id, nombre: r.nombre_completo,
  }]))

  const { rows: tarifas } = await query(
    `select distinct on (persona_id) persona_id, valor_hora
       from public.persona_tarifa
      where desde <= $1::date and valor_hora is not null
      order by persona_id, desde desc`, [desde],
  )
  const vigentePorPersona = new Map(tarifas.map((r) => [r.persona_id, Number(r.valor_hora)]))

  const { rows: mensuales } = await query(
    `select distinct on (persona_id) persona_id, neto_mensual
       from public.persona_tarifa
      where desde <= $1::date and neto_mensual is not null
      order by persona_id, desde desc`, [desde],
  )
  const mensualPorPersona = new Map(mensuales.map((r) => [r.persona_id, Number(r.neto_mensual)]))

  const plan = planDeSembrado(vivos, personaPorCuil, vigentePorPersona)

  console.log(`${HOJA}: ${bloques.length} bloque(s) · ${vivos.length} persona(s) en el bloque más reciente`)
  console.log(`tarifa vigente desde ${desde}\n`)
  for (const x of plan.insertar) {
    const antes = x.anterior == null ? 'sin tarifa previa' : `antes ${pesos(x.anterior)}`
    console.log(`   + ${x.nombre.padEnd(22)} ${pesos(x.valor).padStart(10)}/h   (${antes} · ${x.personaBase})`)
  }
  for (const x of plan.iguales) console.log(`   = ${x.nombre.padEnd(22)} ${pesos(x.valor).padStart(10)}/h   ya vigente`)
  for (const n of plan.sinTarifa) console.log(`   · ${n}: SIN $/hora en la planilla — no se inventa`)
  for (const x of plan.sinPersona) {
    console.log(`   · ${x.nombre}: ${x.cuil ? `CUIL ${x.cuil} no está en public.personas` : 'no está en el puente CUIL↔planilla'} — queda sin tarifa`)
  }

  console.log(`\nRESUMEN  ${vivos.length} en la última quincena · ${plan.insertar.length} a insertar`
    + ` · ${plan.iguales.length} ya vigentes · ${plan.sinTarifa.length} sin $/hora`
    + ` · ${plan.sinPersona.length} sin persona en la base`)

  // ═══ OFICINA NO SALE DEL ESPEJO, Y POR ESO SU ORIGEN DICE OTRA COSA ═══
  //
  // Maldonado y Nievas no tienen $/hora: cobran un neto mensual acordado ($1.800.000 c/u al
  // 09/09/2026), que en este repo está declarado en `SUELDO_NETO_OFICINA`. Se siembra con su propio
  // `origen` para que la pantalla no diga «sheet:_J_OBREROS» de una cifra que esa pestaña no tiene.
  const oficina = []
  for (const [cuil, neto] of Object.entries(SUELDO_NETO_OFICINA)) {
    const persona = personaPorCuil.get(String(cuil))
    if (!persona) { console.log(`   · oficina CUIL ${cuil}: no está en public.personas`); continue }
    const ya = mensualPorPersona.get(persona.persona_id)
    if (ya != null && Number(ya) === Number(neto)) {
      console.log(`   = ${persona.nombre.padEnd(30)} ${pesos(neto)}/mes  ya vigente`)
      continue
    }
    oficina.push({ persona_id: persona.persona_id, nombre: persona.nombre, neto: Number(neto) })
    console.log(`   + ${persona.nombre.padEnd(30)} ${pesos(neto)}/mes  (oficina)`)
  }

  if (!APLICAR) return console.log('\n(sin --aplicar: no escribí nada)')

  for (const x of plan.insertar) {
    await query(
      `insert into public.persona_tarifa (persona_id, desde, valor_hora, origen)
       values ($1, $2::date, $3, $4)
       on conflict (persona_id, desde) do update set valor_hora = excluded.valor_hora,
         origen = excluded.origen`,
      [x.persona_id, desde, x.valor, `${ORIGEN} · quincena del ${desde}`],
    )
  }
  for (const x of oficina) {
    await query(
      `insert into public.persona_tarifa (persona_id, desde, neto_mensual, origen)
       values ($1, $2::date, $3, $4)
       on conflict (persona_id, desde) do update set neto_mensual = excluded.neto_mensual,
         valor_hora = null, origen = excluded.origen`,
      [x.persona_id, desde, x.neto, ORIGEN_OFICINA],
    )
  }
  // LO QUE PRUEBA UNA ESCRITURA ES EL DATO LEÍDO EN SU DESTINO.
  const { rows: releido } = await query(
    `select count(*)::int n, count(distinct persona_id)::int p
       from public.persona_tarifa where desde = $1::date`,
    [desde],
  )
  console.log(`\n✓ releído de la base: ${releido[0].n} fila(s) para ${releido[0].p} persona(s) con desde=${desde}`)
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  await main().finally(closePool)
}
