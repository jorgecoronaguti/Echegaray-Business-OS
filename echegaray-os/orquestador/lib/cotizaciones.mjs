// COTIZACIÓN · BIBLIOTECA VIVA (área Comercial). PRP aprobado 2026-07-19, Fase 1. Hoy las
// cotizaciones se arman en el Sheet (APU) y se pisan/pierden. Esta capacidad las ACUMULA: cada
// cotización queda registrada (cliente, obra, monto, margen, estado ganada/perdida). Es la base del
// loop de aprendizaje del PRP — la Fase 2 comparará lo cotizado contra el costo real por obra
// (costos_obra) usando el link opcional a obra_canonica. El costo real NO se copia acá: se calcula.
// Interno/reversible (patrón adicionales/certificaciones). 0 API.
import { query } from './db.mjs'
import { resolverObra } from './obras.mjs'

const ISO_HOY = () => new Date().toISOString().slice(0, 10)
export const ESTADOS = ['borrador', 'emitida', 'ganada', 'perdida']

/** Normaliza un monto es-AR ("$ 47.590.271,50") → número. PURA. */
export function parseMontoAR(v) {
  if (v == null || v === '') return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const neg = /-\s*[\d(]/.test(String(v)) || /^\(.*\)$/.test(String(v).trim())
  const s = String(v).replace(/[^\d,]/g, '').replace(',', '.')
  if (!s) return null
  const n = Number(s)
  if (!Number.isFinite(n)) return null
  return neg ? -n : n
}

/** VALIDACIÓN PURA (testeable): concepto mínimo + estado + montos es-AR + margen derivado. */
export function validarCotizacion({ cliente, obra_nombre, monto_venta, costo_estimado, margen_pct, estado }) {
  if (!cliente && !obra_nombre) return { ok: false, error: 'falta al menos el cliente o el nombre de la obra cotizada' }
  const est = String(estado || 'emitida').toLowerCase()
  if (!ESTADOS.includes(est)) return { ok: false, error: `estado inválido: "${estado}". Usá: ${ESTADOS.join(', ')}` }
  const venta = parseMontoAR(monto_venta)
  if (monto_venta != null && monto_venta !== '' && venta == null) return { ok: false, error: 'el monto de venta no es un número válido' }
  const costo = parseMontoAR(costo_estimado)
  let margen = margen_pct == null || margen_pct === '' ? null : Number(String(margen_pct).replace(/[^\d,.-]/g, '').replace(',', '.'))
  if (margen != null && !Number.isFinite(margen)) margen = null
  // si no dieron margen pero sí venta y costo, se deriva
  if (margen == null && venta && costo != null && venta > 0) margen = Math.round(((venta - costo) / venta) * 1000) / 10
  return { ok: true, cliente: cliente ? String(cliente).trim() : null, obra_nombre: obra_nombre ? String(obra_nombre).trim() : null, monto_venta: venta, costo_estimado: costo, margen_pct: margen, estado: est }
}

/** CORE PURO: embudo comercial (emitidas→ganadas→perdidas) + tasa de conversión + monto ganado. */
export function analizarCotizaciones(filas) {
  let emitidas = 0, ganadas = 0, perdidas = 0, montoGanado = 0, montoEmitido = 0, margenSum = 0, margenN = 0
  for (const c of filas) {
    const est = String(c.estado || '').toLowerCase()
    if (est === 'ganada') { ganadas++; montoGanado += Number(c.monto_venta || 0) }
    else if (est === 'perdida') perdidas++
    else emitidas++ // borrador/emitida = en juego
    if (c.monto_venta) montoEmitido += Number(c.monto_venta)
    if (c.margen_pct != null) { margenSum += Number(c.margen_pct); margenN++ }
  }
  const decididas = ganadas + perdidas
  return {
    total: filas.length, en_juego: emitidas, ganadas, perdidas,
    monto_ganado: Math.round(montoGanado), monto_total_cotizado: Math.round(montoEmitido),
    tasa_conversion_pct: decididas ? Math.round((ganadas / decididas) * 1000) / 10 : null,
    margen_promedio_pct: margenN ? Math.round((margenSum / margenN) * 10) / 10 : null,
  }
}

/** Registra una cotización en la biblioteca. Link opcional a obra_canonica (cuando ya es/será obra). */
export async function registrarCotizacion({ cliente, obra_nombre, obra, monto_venta, costo_estimado, margen_pct, estado, fecha, notas }) {
  const v = validarCotizacion({ cliente, obra_nombre, monto_venta, costo_estimado, margen_pct, estado })
  if (!v.ok) return { error: v.error }
  let obraCanId = null
  if (obra) { const r = await resolverObra(obra); if (r.obra_id) obraCanId = r.obra_id }
  const campos = ['cliente', 'obra_nombre', 'obra_canonica_id', 'monto_venta', 'costo_estimado', 'margen_pct', 'estado', 'fecha_cotizacion', 'notas', 'origen']
  const vals = [v.cliente, v.obra_nombre, obraCanId, v.monto_venta, v.costo_estimado, v.margen_pct, v.estado, fecha || ISO_HOY(), notas ? String(notas) : null, 'os']
  const ph = vals.map((_, i) => `$${i + 1}`).join(',')
  const ins = await query(`insert into public.cotizaciones (${campos.join(',')}, created_at) values (${ph}, now()) returning id`, vals)
  return { registrada: true, id: ins.rows[0].id, cliente: v.cliente, obra: v.obra_nombre, monto_venta: v.monto_venta, margen_pct: v.margen_pct, estado: v.estado, obra_canonica_id: obraCanId }
}

/** Estado de la biblioteca de cotizaciones (todas, o filtradas por cliente/estado). 0 API. */
export async function estadoCotizaciones({ cliente, estado } = {}) {
  const cond = [], args = []
  if (cliente) { args.push(`%${cliente}%`); cond.push(`cliente ilike $${args.length}`) }
  if (estado) { args.push(String(estado).toLowerCase()); cond.push(`lower(estado) = $${args.length}`) }
  const where = cond.length ? `where ${cond.join(' and ')}` : ''
  const { rows } = await query(
    `select cliente, obra_nombre, obra_canonica_id, monto_venta::float8 monto_venta,
            costo_estimado::float8 costo_estimado, margen_pct::float8 margen_pct, estado,
            to_char(fecha_cotizacion,'DD/MM/YYYY') fecha
       from public.cotizaciones ${where} order by fecha_cotizacion desc nulls last, created_at desc`, args)
  return { ...analizarCotizaciones(rows), cotizaciones: rows, fuente: 'public.cotizaciones (biblioteca viva)' }
}
