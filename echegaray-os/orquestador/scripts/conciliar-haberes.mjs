#!/usr/bin/env node
// CONCILIA LOS HABERES QUE PAGÓ EL BANCO CONTRA LAS QUINCENAS QUE LOS DECLARAN.
//
// Contesta la pregunta que el modelo de quincenas no puede: ¿hay plata de sueldos que salió del banco y
// que ninguna quincena explica? Es SÓLO LECTURA — lee `banco_movimientos` y la pestaña "Jornales por
// Quincena", y no escribe en ningún lado. El criterio entero vive en `lib/haberes-conciliacion.mjs`.
//
// LOS PAGOS ANUNCIADOS. Un comprobante del banco puede existir antes que el extracto (el del 13/08 se
// generó 08:53 y el pago fue 10:02). Esos pagos no están en `banco_movimientos` todavía y se pasan
// aparte con `--anunciados`, para que la conciliación pueda decir que el saldo bancario del OS está
// alto por ese importe:
//
//   [ { "fecha": "2026-08-13", "importe": 239790.94, "beneficiario": "…", "cuil": "…" } ]
//
//   node orquestador/scripts/conciliar-haberes.mjs [--desde 2026-07-01] [--anunciados pagos.json]

import { readFileSync } from 'node:fs'
import { query, closePool } from '../lib/db.mjs'
import { makeGoogleClient } from '../lib/google.mjs'
import { conciliarHaberes, formatConciliacion } from '../lib/haberes-conciliacion.mjs'
import { serialAIso } from '../lib/jornales-estructura.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const PESTAÑA = 'Jornales por Quincena'
const args = process.argv.slice(2)
const opt = (n, d = null) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d }
const DESDE = opt('--desde', '2026-01-01')

/** Los pagos de haberes del extracto. El concepto lo pone el banco: "Pago haberes - <lote>". */
async function pagosDelBanco(desde) {
  const r = await query(
    `select fecha::text, concepto, importe, referencia
       from public.banco_movimientos
      where importe < 0 and fecha >= $1::date and concepto ilike '%haber%'
      order by fecha`,
    [desde],
  )
  return (r.rows ?? []).map((m) => ({
    fecha: String(m.fecha).slice(0, 10),
    importe: Math.abs(Number(m.importe)),
    referencia: m.referencia,
    beneficiario: '',
    origen: 'extracto',
  }))
}

/** El corte del extracto: el último día importado. Sin eso no se puede decir qué falta. */
async function corteDelExtracto() {
  const r = await query('select max(fecha)::text corte from public.banco_movimientos')
  return String((r.rows ?? [])[0]?.corte ?? '').slice(0, 10) || null
}

/**
 * Las quincenas, leídas por RANGO CON NOMBRE y no por fila. El rediseño del 23/07 movió el cuadro de la
 * fila 3 a la 41 y las sumas siguieron devolviendo un número —el de las filas equivocadas— sin marcar
 * un solo error. Si el ancla falta, no se lee a ciegas: se dice.
 *
 * UNFORMATTED_VALUE a propósito: formateadas, las fechas vuelven como "16/07/2026" y hay que parsearlas
 * con una convención adivinada. El serial no tiene ambigüedad.
 */
async function quincenasDelSheet(google) {
  const nombrados = new Map((await google.getNamedRanges(ID).catch(() => [])).map((r) => [r.name, r.range]))
  const ancla = nombrados.get('JORNALES_REAL_HASTA')
  if (!ancla || ancla.startRowIndex == null) {
    throw new Error('falta el rango con nombre JORNALES_REAL_HASTA en el Sheet: no leo el cuadro de una '
      + 'fila adivinada. Corré orquestador/scripts/jornales-pestana.mjs desde el árbol principal.')
  }
  const filas = await google.readSheetValues(
    ID, `'${PESTAÑA}'!A${ancla.startRowIndex + 1}:N${ancla.endRowIndex}`, { render: 'UNFORMATTED_VALUE' },
  )
  const iso = (v) => (typeof v === 'number' ? serialAIso(v) : null)
  return (filas ?? [])
    .map((f) => ({
      desde: iso(f?.[0]), hasta: iso(f?.[1]), se_paga_el: iso(f?.[2]),
      banco: Number(f?.[7]) || 0, pagado_el: iso(f?.[13]),
    }))
    .filter((q) => q.hasta)
}

async function main() {
  const google = await makeGoogleClient()
  const anunciadosFile = opt('--anunciados')
  const anunciados = anunciadosFile
    ? JSON.parse(readFileSync(anunciadosFile, 'utf8')).map((p) => ({ ...p, origen: 'comprobante' }))
    : []
  const [pagos, quincenas, corte] = await Promise.all([
    pagosDelBanco(DESDE), quincenasDelSheet(google), corteDelExtracto(),
  ])
  console.log(`  Extracto importado hasta el ${corte ?? '(sin datos)'} · ${pagos.length} pago(s) de haberes `
    + `desde el ${DESDE} · ${quincenas.length} quincena(s) en la pestaña.`)
  if (anunciados.length) console.log(`  ${anunciados.length} pago(s) anunciado(s) todavía fuera del extracto.`)
  console.log('')
  console.log(formatConciliacion(conciliarHaberes({ pagos: [...pagos, ...anunciados], quincenas, corte })))
}

main()
  .catch((e) => { console.error(`ERROR: ${e.message}`); process.exitCode = 1 })
  .finally(() => closePool())
