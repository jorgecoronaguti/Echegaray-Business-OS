#!/usr/bin/env node
// LAS CINCO ALÍCUOTAS DEL COSTO DE LA HORA, DERIVADAS DE LAS DDJJ Y DE LAS QUINCENAS CERRADAS.
//
//   node orquestador/scripts/costo-hora-alicuota-derivar.mjs                          → qué cargaría
//   node orquestador/scripts/costo-hora-alicuota-derivar.mjs --aplicar                 → carga
//   node orquestador/scripts/costo-hora-alicuota-derivar.mjs --desde 2026-06-01 --hasta 2026-08-31
//   node orquestador/scripts/costo-hora-alicuota-derivar.mjs --rige-desde 2026-06-01
//
// ═══ EL AGUJERO QUE CIERRA (12/09/2026) ═══
//
// `costo_hora_alicuota` tenía CERO filas, y `multiplicador_de_costo` devuelve `null` —no 1— sin una
// sola alícuota vigente. Con `null` × horas = `null`, la columna «Mano de obra» de la ficha del
// cliente y la solapa «Costo a la obra» de Liquidación decían «sin valorizar» en las trece obras.
// Lo que faltaba era DATO, no código.
//
// ═══ POR QUÉ NO SE CARGAN LAS ALÍCUOTAS LEGALES ═══
//
// Porque no se pueden afirmar vigentes sin verificarlas, y porque no explicarían lo que esta empresa
// paga de verdad: los mínimos por trabajador, la zona, el SAC y los ajustes de una rectificativa no
// salen de ninguna tabla de alícuotas. Lo que se carga es la MEDICIÓN de lo declarado y pagado, con
// la fuente escrita en cada fila. Es una INFERENCIA y así queda rotulada.
//
// El criterio y las trampas del reparto están en `lib/costo-hora-derivado.mjs`, que es puro y tiene
// sus tests. Acá sólo viven las tres lecturas y la escritura.
//
// ═══ LA VENTANA ═══
//
// Por defecto, TODO el período con evidencia completa: enero a agosto de 2026 —las ocho quincenas
// cerradas de cada mes y las ocho DDJJ de los dos organismos—, rigiendo desde el 01/01/2026, que es
// la fecha del primer registro de horas.
//
// Se derivó también la ventana jun–ago sola (ver el informe del commit). Se cargó la de ocho meses
// por dos razones: valoriza TODAS las horas cargadas en vez de las de los últimos tres meses, y
// contiene UN SAC —el de junio— repartido sobre ocho meses en vez de sobre tres. Una ventana de
// jun–ago le carga a las obras de esos tres meses las cargas del aguinaldo de todo el semestre.
//
// ═══ SÓLO LECTURA SOBRE GOOGLE ═══
//
// Lee PDF de Drive y no escribe una celda. Lo que escribe es Postgres, y se corre desde el checkout
// principal.

import { makeGoogleClient } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { query, closePool } from '../lib/db.mjs'
import { parseF931 } from '../lib/cargas-sociales.mjs'
import { leerUocra } from '../lib/uocra-ddjj.mjs'
import { alicuotasDerivadas, declaradoDeLaVentana } from '../lib/costo-hora-derivado.mjs'

const APLICAR = process.argv.includes('--aplicar')
const arg = (nombre, def) => {
  const i = process.argv.indexOf(`--${nombre}`)
  return i >= 0 ? process.argv[i + 1] : def
}

const DESDE = arg('desde', '2026-01-01')
const HASTA = arg('hasta', '2026-08-31')
const RIGE_DESDE = arg('rige-desde', DESDE)

/** Los períodos `AAAA-MM` que toca la ventana. Explícitos: una DDJJ que falte tiene que notarse. */
export function periodosDe(desde, hasta) {
  const out = []
  const [a0, m0] = desde.split('-').map(Number)
  const [a1, m1] = hasta.split('-').map(Number)
  for (let a = a0, m = m0; a * 12 + m <= a1 * 12 + m1; m === 12 ? (a++, m = 1) : m++) {
    out.push(`${a}-${String(m).padStart(2, '0')}`)
  }
  return out
}

const pesos = (v) => `$${Math.round(Number(v)).toLocaleString('es-AR')}`
const pct = (v) => `${Number(v).toFixed(4)} %`

/** Las DDJJ F931 del año, leídas de los PDF de Drive. Desempata la copia más nueva, como `f931-sheet`. */
async function leerF931(google, anio) {
  const { rows } = await query(
    `select name, drive_file_id, path, modified_time from public.drive_index
      where name ilike '%931%' and name like $1 and mime_type = 'application/pdf'
      order by name, modified_time desc nulls last`, [`${anio}%`])
  const porNombre = new Map()
  for (const a of rows) if (!porNombre.has(a.name)) porNombre.set(a.name, a)
  const out = []
  const fallidos = []
  for (const a of porNombre.values()) {
    try {
      const { text, scanned } = await google.readPdfText(a.drive_file_id, { maxChars: 60000 })
      if (scanned) { fallidos.push(`${a.name} (escaneado)`); continue }
      const d = parseF931(text)
      if (!d?.periodo) { fallidos.push(a.name); continue }
      out.push({ ...d, archivo: a.name })
    } catch (e) { fallidos.push(`${a.name} (${String(e?.message ?? e).slice(0, 40)})`) }
  }
  return { declaraciones: out, fallidos }
}

/**
 * EL BOLSILLO DE LA VENTANA, EN SUS DOS FORMAS.
 *
 *   pagado   Σ `cobra` de las quincenas CERRADAS = Σ horas × $/h sellado. Es lo que la gente se
 *            llevó: `total` NO sirve, porque descuenta adelantos y giros previos (el acuerdo sigue
 *            siendo el mismo plata).
 *   imputado Σ horas imputadas a una obra × el $/h sellado de esa persona en esa quincena. Es
 *            EXACTAMENTE lo que `multiplicador_de_costo` multiplica, y por eso es el denominador.
 *
 * El filtro de `tipo_hora` es el MISMO que usa la clave `costo_obra` y la solapa: una ausencia no se
 * trabajó y una licencia la paga la empresa, no la obra.
 */
async function leerBolsillo(desde, hasta) {
  const { rows } = await query(
    `with q as (
       select id, desde, hasta from public.liquidacion_quincena
        where estado = 'cerrada' and desde >= $1::date and hasta <= $2::date),
     pagado as (select sum(l.cobra) monto, sum(l.horas) horas
                  from q join public.liquidacion_linea l on l.liquidacion_id = q.id),
     imputado as (
       select sum(h.horas * l.valor_hora) monto, sum(h.horas) horas
         from q
         join public.registros_hh h
           on h.fecha between q.desde and q.hasta
          and h.tipo_hora in ('normal', 'extra_50', 'extra_100')
          and h.obra_canonica_id is not null
         join public.liquidacion_linea l
           on l.liquidacion_id = q.id and l.persona_id = h.persona_id)
     select (select count(*) from q)::int                as quincenas,
            (select monto from pagado)::float            as pagado,
            (select horas from pagado)::float            as horas_pagadas,
            (select monto from imputado)::float          as imputado,
            (select horas from imputado)::float          as horas_imputadas`,
    [desde, hasta],
  )
  return rows[0]
}

async function main() {
  const periodos = periodosDe(DESDE, HASTA)
  const anio = DESDE.slice(0, 4)
  const etiqueta = `${DESDE} a ${HASTA}`

  const google = makeGoogleClient({ config: loadConfig() })
  const [{ declaraciones, fallidos }, uocra, bolsillo] = await Promise.all([
    leerF931(google, anio),
    leerUocra(google),
    leerBolsillo(DESDE, HASTA),
  ])

  console.log(`ventana ${etiqueta} · ${periodos.length} período(s) · rige desde ${RIGE_DESDE}`)
  console.log(`F931 leídas: ${declaraciones.map((d) => d.periodo).join(' ')}`)
  if (fallidos.length) console.log(`  ⚠ F931 que no pude leer: ${fallidos.join(' · ')}`)
  console.log(`DDJJ UOCRA leídas: ${uocra.map((u) => `${u.periodo}${/rectif/i.test(u.tipo_boleta ?? '') ? '(R)' : ''}`).join(' ')}`)
  console.log(`quincenas cerradas: ${bolsillo.quincenas} · horas pagadas ${bolsillo.horas_pagadas}`
    + ` · horas imputadas a obra ${bolsillo.horas_imputadas}`)
  console.log(`bolsillo pagado ${pesos(bolsillo.pagado)} · bolsillo imputado ${pesos(bolsillo.imputado)}\n`)

  const declarado = declaradoDeLaVentana(declaraciones, uocra, periodos)
  console.log('período   remuneración    aportes   contribuc.        ART      UOCRA   fondo cese  boleta')
  for (const d of declarado.detalle) {
    console.log(`${d.periodo}  ${pesos(d.remuneracion).padStart(13)} ${pesos(d.aportes).padStart(11)}`
      + ` ${pesos(d.contribuciones).padStart(12)} ${pesos(d.art).padStart(10)} ${pesos(d.uocraTotal).padStart(10)}`
      + ` ${pesos(d.fondoCese).padStart(12)}  ${d.tipoBoletaUocra ?? '—'}`)
    if (d.discrepanciaRemuneracion) {
      console.log(`   ⚠ ${d.periodo}: F931 y UOCRA declaran remuneraciones distintas`
        + ` (diferencia ${pesos(d.discrepanciaRemuneracion)}) — mirarlo antes de usar este número`)
    }
  }

  const r = alicuotasDerivadas({
    declarado,
    bolsilloImputado: bolsillo.imputado,
    bolsilloPagado: bolsillo.pagado,
    rigeDesde: RIGE_DESDE,
    etiquetaVentana: etiqueta,
  })

  if (r.razonabilidad) {
    const z = r.razonabilidad
    console.log(`\nremuneración declarada ${pesos(z.remuneracionDeclarada)} · bruto declarado / bolsillo pagado `
      + `${z.razonBrutoSobreBolsillo.toFixed(4)}`)
    console.log('RAZONABILIDAD · cada concepto sobre la REMUNERACIÓN DECLARADA (la base sobre la que se calculan):')
    for (const [k, v] of Object.entries(z.sobreDeclarado)) console.log(`   ${k.padEnd(16)} ${pct(v)}`)
    console.log(`   costo sobre el bruto declarado (sin los aportes, que ya están dentro): ${z.costoSobreDeclarado.toFixed(4)}`)
  }

  console.log('\nconcepto                      monto ventana        % sobre bolsillo imputado   base')
  for (const f of r.filas) {
    console.log(`${f.concepto.padEnd(22)} ${pesos(f.monto).padStart(16)} ${pct(f.porcentaje).padStart(25)}   ${f.base}`)
  }
  if (r.multiplicador != null) {
    console.log(`\nMULTIPLICADOR = ${r.multiplicador.toFixed(4)}  (1 + Σ, que es lo que devuelve multiplicador_de_costo con p = 1)`)
  }

  if (!r.ok) {
    console.log('\n✖ NO CARGO NADA. Motivos:')
    for (const m of r.motivos) console.log(`   · ${m}`)
    process.exitCode = 1
    return
  }

  const { rows: ya } = await query(
    'select concepto, desde::text as desde from public.costo_hora_alicuota where desde = $1::date', [RIGE_DESDE])
  const existentes = new Set(ya.map((x) => x.concepto))
  const aInsertar = r.filas.filter((f) => !existentes.has(f.concepto))
  for (const f of r.filas) {
    if (existentes.has(f.concepto)) {
      console.log(`   = ${f.concepto}: ya hay una fila con desde ${RIGE_DESDE} — no se pisa`
        + ' (corregir una alícuota vieja reescribiría el costo de una obra cerrada: se agrega otra con otro desde)')
    }
  }

  console.log(`\nRESUMEN  ${aInsertar.length} fila(s) a insertar · ${r.filas.length - aInsertar.length} ya existente(s)`)
  if (!APLICAR) { console.log('\n(dry) nada escrito. Volvé a correr con --aplicar'); return }
  if (aInsertar.length === 0) { console.log('\nnada para insertar'); return }

  // TODO O NADA. Con cuatro de cinco conceptos cargados el multiplicador existe y es MENOR que el
  // real: publicaría un costo de obra incompleto con la misma cara que uno completo.
  await query('begin')
  try {
    for (const f of aInsertar) {
      await query(
        `insert into public.costo_hora_alicuota (concepto, desde, porcentaje, base, fuente)
         values ($1, $2::date, $3, $4, $5)`,
        [f.concepto, f.desde, f.porcentaje, f.base, f.fuente],
      )
    }
    await query('commit')
  } catch (e) { await query('rollback'); throw e }

  const { rows: [post] } = await query(
    'select count(*)::int n, public.multiplicador_de_costo($1::date, 1)::float m from public.costo_hora_alicuota',
    [HASTA])
  console.log(`\n✔ ${aInsertar.length} fila(s) insertada(s). costo_hora_alicuota: ${post.n} filas.`)
  console.log(`   multiplicador_de_costo('${HASTA}', 1) leído de la base = ${post.m}`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().then(() => closePool()).catch(async (e) => {
    console.error(`\n✖ ${e.message}`)
    await closePool()
    process.exitCode = 1
  })
}
