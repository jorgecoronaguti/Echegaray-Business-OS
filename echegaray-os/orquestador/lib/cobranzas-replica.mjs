// COBRANZAS → SUPABASE. La mitad que faltaba para el calendario de la web.
//
// ERROR PROPIO QUE ESTO CORRIGE (20/07): dije dos veces que la pestaña Cobranzas "sólo tiene fecha
// de emisión" y que por eso el Cash Flow no podía tener ingresos. Era falso: leí hasta la columna N
// y las fechas de vencimiento y de cobro están en las columnas P y Q. Leer un pedazo de una tabla y
// concluir sobre el resto es exactamente la clase de error que este proyecto no puede permitirse.
import { query } from './db.mjs'
import { montoAR } from './egresos-por-area.mjs'
import { fechaSheet } from './nomina-replica.mjs'
import { resolverObraCon, cargarAliasMap } from './obras.mjs'

/** NÚCLEO PURO: filas de la pestaña → registros. `enc` es el índice de la fila de encabezado. */
export function mapearCobranzas(filas = [], aliasMap = new Map(), filaBase = 5) {
  const out = []
  filas.forEach((r, i) => {
    const total = montoAR(r?.[12])
    if (!total) return
    const cliente = String(r?.[6] ?? '').trim()
    const o = resolverObraCon(aliasMap, cliente)
    out.push({
      fila_sheet: filaBase + i,
      fecha_emision: fechaSheet(r?.[2]),
      comprobante: String(r?.[4] ?? '').trim() || null,
      unidad: String(r?.[5] ?? '').trim() || null,
      cliente_texto: cliente || null,
      obra_id: o.resuelto && !o.aproximado ? o.obra_id : null,
      concepto: String(r?.[8] ?? '').trim() || null,
      total,
      fecha_vencimiento: fechaSheet(r?.[15]),   // P
      fecha_cobro: fechaSheet(r?.[16]),         // Q
      estado: String(r?.[14] ?? '').trim() || null,  // O
      probabilidad: (() => { const p = String(r?.[18] ?? '').replace('%', '').replace(',', '.'); const n = Number(p); return Number.isFinite(n) ? n / 100 : null })(),
    })
  })
  return out
}

const $ = (v) => `$${Math.round(Number(v) || 0).toLocaleString('es-AR')}`

export function formatCobranzas(r) {
  if (!r || r.error) return `No pude replicar cobranzas: ${r?.error ?? 'sin datos'}`
  return [
    'COBRANZAS REPLICADAS', '',
    `  ${r.filas} facturas · ${$(r.total)}`,
    `  Cobradas: ${r.cobradas} · ${$(r.total_cobrado)}`,
    `  Pendientes: ${r.filas - r.cobradas} · ${$(r.total - r.total_cobrado)}`,
    `  Sin cliente reconocido por el eje: ${r.sin_obra}`,
  ].join('\n')
}

export async function replicarCobranzas(google, { file_id } = {}) {
  if (!google?.readSheetValues) return { error: 'no hay una cuenta de Google autorizada' }
  const filas = await google.readSheetValues(file_id, 'Cobranzas!A5:S200').catch(() => [])
  let aliasMap = new Map()
  try { aliasMap = await cargarAliasMap() } catch { /* sin eje, obra_id queda null y se declara */ }
  const regs = mapearCobranzas(filas, aliasMap)
  await query("delete from public.cobranza where origen='flujo_caja_sheet'")
  for (const c of regs) {
    await query(
      `insert into public.cobranza (fila_sheet,fecha_emision,comprobante,unidad,cliente_texto,obra_id,concepto,total,fecha_vencimiento,fecha_cobro,estado,probabilidad)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [c.fila_sheet, c.fecha_emision, c.comprobante, c.unidad, c.cliente_texto, c.obra_id,
        c.concepto, c.total, c.fecha_vencimiento, c.fecha_cobro, c.estado, c.probabilidad],
    )
  }
  return {
    filas: regs.length,
    total: regs.reduce((a, c) => a + c.total, 0),
    cobradas: regs.filter((c) => c.fecha_cobro).length,
    total_cobrado: regs.filter((c) => c.fecha_cobro).reduce((a, c) => a + c.total, 0),
    sin_obra: regs.filter((c) => !c.obra_id).length,
  }
}
