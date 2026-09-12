#!/usr/bin/env node
// LAS TARIFAS DE ENERO A AGOSTO, RECONSTRUIDAS DE LAS QUINCENAS QUE YA SE LIQUIDARON.
//
//   node orquestador/scripts/persona-tarifa-desde-liquidacion.mjs              → qué insertaría
//   node orquestador/scripts/persona-tarifa-desde-liquidacion.mjs --aplicar    → inserta
//
// ═══ EL AGUJERO QUE CIERRA (12/09/2026) ═══
//
// `persona_tarifa` tenía 19 filas y TODAS con `desde = 2026-09-01` —las sembró
// `persona-tarifa-sembrar.mjs`, que por diseño no inventa historia y pone la quincena en curso—,
// mientras `registros_hh` tiene horas desde el 05/01/2026. El `left join lateral` que valoriza una
// hora busca «la tarifa de mayor desde que ya empezó a la fecha del registro» y para una hora de
// marzo no encuentra ninguna: devuelve `null`, y la ficha del cliente dice «sin valorizar» en las
// trece obras. Ocho meses de mano de obra sin precio.
//
// ═══ DE DÓNDE SALE EL NÚMERO, Y POR QUÉ ESA FUENTE Y NO OTRA ═══
//
// De `liquidacion_linea.valor_hora`: el $/hora SELLADO con el que cada persona se liquidó en cada
// quincena cerrada. No es una reconstrucción ni una inferencia — es el número con el que se le pagó,
// guardado al cerrar. 274 filas, 30 personas, enero a agosto.
//
// La alternativa era releer `_J_OBREROS` del Sheet y reconstruir los bloques viejos. Se descartó: esa
// planilla trae UNA columna de tarifa por bloque y ya reescribió su propia historia otras veces (el
// nombre dado vuelta de abril, la fecha de ingreso del reingreso). La liquidación cerrada es el
// HECHO; el espejo del Sheet es la fuente de la que ese hecho se produjo, y está un paso más lejos.
//
// ═══ UNA FILA POR CAMBIO, NO UNA POR QUINCENA ═══
//
// `persona_tarifa` es una tabla de TRAMOS: la fila rige desde `desde` hasta que aparece otra. Meter
// una fila por quincena daría 274 filas que dicen dieciséis veces lo mismo y harían más lento el
// lateral de cada registro de horas sin agregar un dato.
//
// Y EL TRAMO NO SE COLAPSA POR VALOR. Si alguien cobró 5.000, subió a 5.500 y volvió a 5.000, son
// TRES tramos: un `distinct on (valor_hora)` daría dos y la segunda vuelta a 5.000 heredaría la
// fecha de enero, liquidando agosto con la tarifa del primer tramo. Por eso la agrupación es por
// cambio CONSECUTIVO (`tramosDeTarifa`), que es lo único que el test prueba.
//
// ═══ NO PISA NI DUPLICA LO QUE YA ESTÁ ═══
//
// `persona_tarifa_una_por_dia` es UNIQUE (persona_id, desde): un `insert` sobre un par que ya existe
// tira. Y un UPDATE está prohibido a propósito —pisar una tarifa vieja reliquidaría una quincena ya
// cerrada a la tarifa de hoy, en silencio—, así que los pares que ya existen se SALTEAN y se dicen.
// Las 19 filas del 01/09 no se tocan: todos los tramos de esta corrida empiezan el 16/08 o antes.
//
// ═══ SÓLO LECTURA SOBRE EL SHEET (no lo toca) ═══
//
// Este script no abre Google: la fuente es Postgres de punta a punta. Lo que escribe es Postgres y
// se corre desde el checkout principal, nunca desde un worktree.

import { query, closePool } from '../lib/db.mjs'

const APLICAR = process.argv.includes('--aplicar')

/** El `origen` de cada fila dice de qué quincena salió el número. Ningún valor sin procedencia. */
export const origenDeTramo = (desdeQuincena) =>
  `liquidacion_linea sellada quincena ${desdeQuincena}`

/**
 * NÚCLEO PURO · LOS TRAMOS DE UNA PERSONA.
 *
 * Recibe las quincenas de UNA persona EN ORDEN CRONOLÓGICO y devuelve una entrada por CAMBIO de
 * valor. La primera quincena siempre abre tramo; después, sólo abre tramo la quincena cuyo valor
 * difiere del tramo anterior.
 *
 * Un valor no positivo NO abre tramo ni cierra el anterior: es un dato que falta, y `persona_tarifa`
 * tiene un CHECK que lo rechazaría. Se devuelve aparte para poder decirlo.
 *
 * @param {Array<{desde:string, valor_hora:number|null}>} quincenas ordenadas por `desde`
 * @returns {{tramos:Array<{desde:string, valor_hora:number}>, sinValor:string[]}}
 */
export function tramosDeTarifa(quincenas) {
  const tramos = []
  const sinValor = []
  let ultimo = null
  for (const q of quincenas) {
    const v = Number(q.valor_hora)
    if (!Number.isFinite(v) || v <= 0) { sinValor.push(q.desde); continue }
    // EL CAMBIO ES CONTRA EL TRAMO ANTERIOR, no contra todos los valores ya vistos: volver a un
    // valor que ya se cobró es un cambio, y tiene que abrir su propio tramo.
    if (ultimo === null || ultimo !== v) { tramos.push({ desde: q.desde, valor_hora: v }); ultimo = v }
  }
  return { tramos, sinValor }
}

/**
 * NÚCLEO PURO · EL PLAN COMPLETO.
 *
 * @param {Map<string, Array<{desde:string, valor_hora:number|null}>>} porPersona persona_id → quincenas ordenadas
 * @param {Set<string>} yaExisten claves `persona_id|desde` que ya están en `persona_tarifa`
 * @param {Map<string,string>} nombres persona_id → nombre, sólo para el informe
 */
export function planDeTramos(porPersona, yaExisten, nombres = new Map()) {
  const insertar = []
  const salteadas = []
  const sinValor = []
  const porPersonaInforme = []
  for (const [persona_id, quincenas] of porPersona) {
    const { tramos, sinValor: sv } = tramosDeTarifa(quincenas)
    for (const d of sv) sinValor.push({ persona_id, nombre: nombres.get(persona_id) ?? persona_id, desde: d })
    const nuevos = []
    for (const t of tramos) {
      const clave = `${persona_id}|${t.desde}`
      // YA EXISTE = NO SE TOCA. No es «ya está bien»: es «no sé si está bien y no soy yo quien lo
      // decide», porque un UPDATE acá reliquida una quincena cerrada.
      if (yaExisten.has(clave)) { salteadas.push({ persona_id, nombre: nombres.get(persona_id) ?? persona_id, ...t }); continue }
      nuevos.push(t)
      insertar.push({ persona_id, nombre: nombres.get(persona_id) ?? persona_id, ...t })
    }
    porPersonaInforme.push({
      persona_id,
      nombre: nombres.get(persona_id) ?? persona_id,
      quincenas: quincenas.length,
      tramos,
      nuevos: nuevos.length,
    })
  }
  porPersonaInforme.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
  insertar.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es') || a.desde.localeCompare(b.desde))
  return { insertar, salteadas, sinValor, porPersona: porPersonaInforme }
}

const pesos = (n) => `$${Number(n).toLocaleString('es-AR')}`

async function main() {
  // `::text` EN LAS FECHAS, SIEMPRE. El driver `pg` convierte un `date` a un `Date` de JavaScript en
  // la zona del proceso: `2026-09-01` vuelve como `2026-09-01T03:00:00.000Z` y un `.slice(0,10)`
  // sobre su ISO puede dar el día anterior. La clave del UNIQUE es el texto.
  const { rows: lineas } = await query(
    `select l.persona_id, p.nombre_completo, q.desde::text as desde, l.valor_hora
       from public.liquidacion_linea l
       join public.liquidacion_quincena q on q.id = l.liquidacion_id
       join public.personas p on p.id = l.persona_id
      where q.estado = 'cerrada'
      order by l.persona_id, q.desde`,
  )
  if (lineas.length === 0) {
    throw new Error('ni una línea de quincena CERRADA en liquidacion_linea: no hay nada que reconstruir')
  }

  const { rows: ya } = await query('select persona_id, desde::text as desde from public.persona_tarifa')
  const yaExisten = new Set(ya.map((r) => `${r.persona_id}|${r.desde}`))

  const porPersona = new Map()
  const nombres = new Map()
  for (const l of lineas) {
    nombres.set(l.persona_id, l.nombre_completo)
    if (!porPersona.has(l.persona_id)) porPersona.set(l.persona_id, [])
    porPersona.get(l.persona_id).push({ desde: l.desde, valor_hora: l.valor_hora })
  }

  const plan = planDeTramos(porPersona, yaExisten, nombres)

  console.log(`${lineas.length} línea(s) de ${porPersona.size} persona(s) en quincenas cerradas`)
  console.log(`${yaExisten.size} fila(s) ya en persona_tarifa\n`)
  console.log('persona                          quincenas  tramos  nuevos   tramos (desde → $/h)')
  for (const p of plan.porPersona) {
    const detalle = p.tramos.map((t) => `${t.desde}→${Number(t.valor_hora).toLocaleString('es-AR')}`).join('  ')
    console.log(`${p.nombre.slice(0, 32).padEnd(32)} ${String(p.quincenas).padStart(9)} ${String(p.tramos.length).padStart(7)} ${String(p.nuevos).padStart(7)}   ${detalle}`)
  }
  for (const s of plan.salteadas) {
    console.log(`   = ${s.nombre}: ${s.desde} ya está en persona_tarifa (${pesos(s.valor_hora)}/h) — no se pisa`)
  }
  for (const s of plan.sinValor) {
    console.log(`   · ${s.nombre}: quincena ${s.desde} sin valor_hora sellado — no se inventa`)
  }

  console.log(`\nRESUMEN  ${plan.insertar.length} fila(s) a insertar · ${plan.salteadas.length} ya existente(s)`
    + ` · ${plan.sinValor.length} sin valor sellado`)

  if (!APLICAR) { console.log('\n(dry) nada escrito. Volvé a correr con --aplicar'); return }
  if (plan.insertar.length === 0) { console.log('\nnada para insertar'); return }

  // UNA TRANSACCIÓN: media historia de tarifas es peor que ninguna, porque el lateral encuentra una
  // tarifa vieja para unas personas y null para otras, y el total de la obra parece completo.
  await query('begin')
  try {
    for (const f of plan.insertar) {
      await query(
        `insert into public.persona_tarifa (persona_id, desde, valor_hora, origen)
         values ($1, $2::date, $3, $4)`,
        [f.persona_id, f.desde, f.valor_hora, origenDeTramo(f.desde)],
      )
    }
    await query('commit')
  } catch (e) { await query('rollback'); throw e }

  const { rows: [post] } = await query(
    'select count(*)::int as n, min(desde)::text as d0, max(desde)::text as d1 from public.persona_tarifa',
  )
  console.log(`\n✔ ${plan.insertar.length} fila(s) insertada(s). persona_tarifa: ${post.n} filas, ${post.d0} → ${post.d1}`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().then(() => closePool()).catch(async (e) => {
    console.error(`\n✖ ${e.message}`)
    await closePool()
    process.exitCode = 1
  })
}
