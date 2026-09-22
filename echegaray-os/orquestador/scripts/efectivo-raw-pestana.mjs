#!/usr/bin/env node
// _EFECTIVO_RAW — LAS ENTREGAS Y DEVOLUCIONES DE EFECTIVO A RENDIR, ADENTRO DEL SHEET.
//
// POR QUÉ EXISTE (22/09/2026). Efectivo a rendir, etapa 1. La entrega saca plata de la caja física y
// la pone a nombre de una persona; la devolución la hace volver. Las dos viven en la base
// (`efectivo_entrega` / `efectivo_devolucion`, migración 20260922T1500), que es donde escriben la app y
// el bot. CAJA tiene que restarlas de la caja física, y la regla del archivo es la de siempre:
//
//     Si el insumo no está en el archivo, se trae el INSUMO — no se pega el RESULTADO.
//
// Es el mismo camino que `_BANCO_RAW`: una réplica que CAJA lee por fórmula (SUMIFS por fecha), no un
// total calculado acá y pegado.
//
// ═══ EL GASTO NO ESTÁ ACÁ ═══
//
// Lo rendido es una fila de Compras con Tipo pago «A rendir». Esa fila es la verdad del gasto y NO
// vuelve a tocar la caja física (la plata ya salió en la entrega). Por eso esta réplica sólo tiene
// movimientos de caja: la entrega SALE (importe negativo), la devolución ENTRA (positivo). Las
// entregas anuladas no aparecen: nunca salió plata.
//
//   node orquestador/scripts/efectivo-raw-pestana.mjs [--dry]
//   ORQ_CASHFLOW_ID=<copia> node orquestador/scripts/efectivo-raw-pestana.mjs   ← probar en una copia

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import * as E from '../lib/estilo-pestana.mjs'
import { escribirPreservando } from '../lib/preservar-anotaciones.mjs'
import { conColaMedidaLeida, avisoDeCola } from '../lib/cola-de-rango.mjs'
import { query } from '../lib/db.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
export const PESTAÑA = '_EFECTIVO_RAW'
const DRY = process.argv.includes('--dry')

/** Las columnas de la réplica. El orden es contrato: las fórmulas de CAJA lo referencian. */
export const COLUMNAS = [
  ['Fecha', 'fecha'], ['Entrega', 'texto'], ['Persona', 'texto'], ['Destino', 'texto'],
  ['Movimiento', 'texto'], ['Importe', 'monedaExacta'],
]
export const COL = { fecha: 'A', entrega: 'B', persona: 'C', destino: 'D', movimiento: 'E', importe: 'F' }
export const FILA0 = 4

const iso = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d ?? '').slice(0, 10))

/** NÚCLEO PURO: una fila de la réplica. El importe va con su signo para la caja: la entrega sale. */
export function fila(m) {
  return [iso(m.fecha), String(m.codigo ?? ''), String(m.persona ?? ''), String(m.destino ?? ''),
    String(m.movimiento ?? ''), Number(m.importe) || 0]
}

/** NÚCLEO PURO: la grilla completa — título con el corte, nota, encabezados y datos. */
export function grilla(movs, corte) {
  const datos = movs.map(fila)
  const neto = datos.reduce((s, f) => s + f[5], 0)
  return [
    [`_EFECTIVO_RAW — entregas y devoluciones de efectivo a rendir · réplica del ${corte}`],
    [`${datos.length} movimiento(s) · neto para la caja física ${Math.round(neto).toLocaleString('es-AR')}. `
      + 'NO se carga a mano: la reescribe el agente desde la base (efectivo_entrega / efectivo_devolucion). '
      + 'La entrega SALE de la caja y la devolución ENTRA. Lo rendido NO está acá: es la fila de Compras con '
      + 'Tipo pago «A rendir», y no vuelve a restar de la caja.'],
    COLUMNAS.map(([n]) => n),
    ...datos,
  ]
}

async function main() {
  const { rows } = await query(
    `select fecha, codigo, persona, destino, movimiento, importe
       from public.efectivo_movimiento_caja order by fecha, registrado_en, codigo`)
  const corte = new Date().toISOString().slice(0, 16).replace('T', ' ')
  const gridRaw = grilla(rows, corte)
  console.log(`${rows.length} movimiento(s) de efectivo a rendir · ${ID === '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8' ? 'SHEET REAL' : 'copia ' + ID}`)
  if (DRY) return console.log('--dry: no escribí nada.')

  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  let meta = await google.getSheetMeta(ID)
  let hoja = meta.find((h) => h.title === PESTAÑA)
  if (!hoja) {
    // Oculta: es un insumo de fórmulas, no una pantalla. El guion bajo NO la oculta.
    await google.spreadsheetBatchUpdate(ID, [{ addSheet: { properties: { title: PESTAÑA, hidden: true, gridProperties: { rowCount: 60, columnCount: COLUMNAS.length + 1, frozenRowCount: 3 } } } }])
    meta = await google.getSheetMeta(ID)
    hoja = meta.find((h) => h.title === PESTAÑA)
    console.log(`  pestaña ${PESTAÑA} creada (oculta)`)
  }
  const alto = Math.max(rows.length + FILA0 + 20, 60)
  if ((hoja.rows ?? 0) < alto) {
    await google.spreadsheetBatchUpdate(ID, [{ updateSheetProperties: { properties: { sheetId: hoja.sheetId, gridProperties: { rowCount: alto } }, fields: 'gridProperties.rowCount' } }])
  }
  // Una entrega anulada DESAPARECE de la réplica: la cola de la corrida anterior se vacía con el
  // centinela, igual que en _BANCO_RAW (es un espejo: no hay nada de una persona adentro).
  const cola = await conColaMedidaLeida(google, ID, PESTAÑA, gridRaw, { ancho: COLUMNAS.length, tope: 2000 })
  if (avisoDeCola(cola, PESTAÑA)) console.log(avisoDeCola(cola, PESTAÑA))
  await escribirPreservando(google, ID, PESTAÑA, cola.filas, { respetar: false, espejo: true, anchoHoja: Math.max(COLUMNAS.length, hoja.cols ?? COLUMNAS.length) })

  const rg = (r0, r1, c0, c1) => ({ sheetId: hoja.sheetId, startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1 })
  const reqs = [
    E.reset(hoja.sheetId, alto, COLUMNAS.length + 1),
    { repeatCell: { range: rg(0, 1, 0, COLUMNAS.length), cell: { userEnteredFormat: E.titulo() }, fields: 'userEnteredFormat' } },
    { repeatCell: { range: rg(1, 2, 0, COLUMNAS.length), cell: { userEnteredFormat: E.nota() }, fields: 'userEnteredFormat' } },
    { repeatCell: { range: rg(2, 3, 0, COLUMNAS.length), cell: { userEnteredFormat: E.encabezado() }, fields: 'userEnteredFormat' } },
  ]
  COLUMNAS.forEach(([, unidad], j) => {
    reqs.push({ repeatCell: { range: rg(FILA0 - 1, alto, j, j + 1), cell: { userEnteredFormat: E.celda(unidad) }, fields: 'userEnteredFormat(numberFormat,textFormat,horizontalAlignment)' } })
  })
  await google.spreadsheetBatchUpdate(ID, reqs)

  // VERIFICACIÓN POR EFECTO: la suma de la columna Importe releída del Sheet = el neto de la base.
  const v = await google.readSheetValues(ID, `${PESTAÑA}!${COL.importe}${FILA0}:${COL.importe}${FILA0 + rows.length + 5}`, { render: 'UNFORMATTED_VALUE' })
  const leido = v.reduce((s, f) => s + (Number(f?.[0]) || 0), 0)
  const base = rows.reduce((s, r) => s + Number(r.importe), 0)
  console.log(`${PESTAÑA}: neto leído del Sheet ${leido} · neto de la base ${base}`)
  if (Math.abs(leido - base) > 0.005) { console.log('  ⚠ NO COINCIDEN'); process.exitCode = 1 }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
}
