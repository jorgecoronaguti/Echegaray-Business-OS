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
import { exigirColumnas, leerColumnasCobranzas } from './cobranzas-columnas.mjs'
import { rangoFilas } from './columnas-por-encabezado.mjs'

/** Las columnas que la réplica lee, por clave de `COBRANZAS_OS`. */
export const COLUMNAS_REPLICA = Object.freeze(['fechaVenta', 'comprobante', 'unidad', 'cliente', 'concepto', 'total', 'fechaFactura', 'fechaCobro', 'estado', 'probabilidad'])

/**
 * NÚCLEO PURO: filas de la pestaña → registros, con las columnas RESUELTAS por rótulo.
 *
 * Hasta el 14/09 indexaba `r[12]`, `r[16]`: con «Obra» insertada en H, el total pasaba a ser las
 * retenciones y la «fecha de cobro» el «Mes cobro (auto)». Las claves de salida no cambian: la
 * `fecha_emision` sigue saliendo de «Fecha de Venta» y el `fecha_vencimiento` de «Fecha de Factura»,
 * que es lo que la réplica guardaba cuando las leía por posición.
 * @param {Record<string,{indice:number}>} cols
 */
export function mapearCobranzas(filas = [], cols, aliasMap = new Map(), filaBase = 5) {
  const c = exigirColumnas(cols, COLUMNAS_REPLICA, 'mapearCobranzas')
  const en = (r, k) => r?.[c[k].indice]
  const out = []
  filas.forEach((r, i) => {
    const total = montoAR(en(r, 'total'))
    if (!total) return
    const cliente = String(en(r, 'cliente') ?? '').trim()
    const o = resolverObraCon(aliasMap, cliente)
    out.push({
      fila_sheet: filaBase + i,
      fecha_emision: fechaSheet(en(r, 'fechaVenta')),
      comprobante: String(en(r, 'comprobante') ?? '').trim() || null,
      unidad: String(en(r, 'unidad') ?? '').trim() || null,
      cliente_texto: cliente || null,
      obra_id: o.resuelto && !o.aproximado ? o.obra_id : null,
      concepto: String(en(r, 'concepto') ?? '').trim() || null,
      total,
      fecha_vencimiento: fechaSheet(en(r, 'fechaFactura')),
      fecha_cobro: fechaSheet(en(r, 'fechaCobro')),
      estado: String(en(r, 'estado') ?? '').trim() || null,
      probabilidad: (() => { const p = String(en(r, 'probabilidad') ?? '').replace('%', '').replace(',', '.'); const n = Number(p); return Number.isFinite(n) ? n / 100 : null })(),
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
  // Los rótulos ANTES del delete: si falta uno, la tabla queda como estaba y el error lo nombra.
  let cols
  try { cols = await leerColumnasCobranzas(google, file_id, COLUMNAS_REPLICA) } catch (e) { return { error: e.message } }
  const filas = await google.readSheetValues(file_id, rangoFilas('Cobranzas', 5, 200)).catch(() => [])
  let aliasMap = new Map()
  try { aliasMap = await cargarAliasMap() } catch { /* sin eje, obra_id queda null y se declara */ }
  const regs = mapearCobranzas(filas, cols, aliasMap)
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
