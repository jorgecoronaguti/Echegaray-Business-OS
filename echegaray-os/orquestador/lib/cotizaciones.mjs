// COTIZACIÓN · BIBLIOTECA VIVA (área Comercial). PRP aprobado 2026-07-19, Fase 1. Hoy las
// cotizaciones se arman en el Sheet (APU) y se pisan/pierden. Esta capacidad las ACUMULA: cada
// cotización queda registrada (cliente, obra, monto, margen, estado ganada/perdida). Es la base del
// loop de aprendizaje del PRP — la Fase 2 comparará lo cotizado contra el costo real por obra
// (costos_obra) usando el link opcional a obra_canonica. El costo real NO se copia acá: se calcula.
// Interno/reversible (patrón adicionales/certificaciones). 0 API.
import { query } from './db.mjs'
import { resolverObra } from './obras.mjs'
import { costoRealObra } from './obra-costos.mjs'

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

/**
 * CORE PURO (Fase 2 del PRP): el aprendizaje de la cotización. Compara lo COTIZADO contra lo REAL y
 * expone la erosión de margen — que es la señal que pide el CLAUDE.md (margen esperado vs. margen real).
 * Todo null-safe: si falta el costo estimado o la venta, devuelve null en vez de inventar un número.
 */
export function calcularDesvioCotizacion({ monto_venta, costo_estimado, costo_real }) {
  const venta = Number(monto_venta) || null
  const est = costo_estimado == null ? null : Number(costo_estimado)
  const real = costo_real == null ? null : Number(costo_real)
  const pct = (n, d) => (d ? Math.round((n / d) * 1000) / 10 : null)
  const margenEstPct = venta && est != null ? pct(venta - est, venta) : null
  const margenRealPct = venta && real != null ? pct(venta - real, venta) : null
  return {
    monto_venta: venta, costo_estimado: est, costo_real: real,
    desvio_costo: est != null && real != null ? Math.round(real - est) : null,
    desvio_costo_pct: est ? pct(real - est, est) : null,
    margen_estimado: venta && est != null ? Math.round(venta - est) : null,
    margen_estimado_pct: margenEstPct,
    margen_real: venta && real != null ? Math.round(venta - real) : null,
    margen_real_pct: margenRealPct,
    erosion_margen_pct: margenEstPct != null && margenRealPct != null ? Math.round((margenEstPct - margenRealPct) * 10) / 10 : null,
  }
}

/**
 * Fase 2: desvío de UNA obra — lo cotizado (biblioteca) vs. el costo real (costos_obra, capacidad ya
 * existente que se REUSA). Deliberadamente NO usa public.presupuestos: sus filas apuntan a obras
 * legacy cuyo nombre no coincide con la obra real de la que salieron (compararía peras con manzanas).
 * Si no hay cotización cargada para la obra, lo dice — no inventa una base.
 */
export async function desvioCotizacionObra(obraTexto) {
  const r = await resolverObra(obraTexto)
  if (!r.obra_id) return { error: `"${obraTexto}" no resuelve a una obra. Obras: La Estrella, San Francisco, Messina, ARCOR, Galpones.` }
  const { rows } = await query(
    `select cliente, obra_nombre, monto_venta::float8 monto_venta, costo_estimado::float8 costo_estimado,
            margen_pct::float8 margen_pct, estado, to_char(fecha_cotizacion,'DD/MM/YYYY') fecha
       from public.cotizaciones where obra_canonica_id=$1
      order by (estado='ganada') desc, fecha_cotizacion desc nulls last limit 1`, [r.obra_id])
  const real = await costoRealObra(r.obra_id)
  if (!rows.length) {
    return {
      obra: r.obra_id, costo_real: Math.round(real.total), sin_cotizacion: true,
      mensaje: `No hay cotización cargada para ${r.obra_id}. El costo real es $${Math.round(real.total).toLocaleString('es-AR')} pero no tengo contra qué compararlo. Cargá la cotización (cliente, monto y costo estimado) con registrar_cotizacion y ahí sí puedo medir el desvío.`,
      fuente: 'public.cotizaciones (vacía para esta obra) + costos_obra',
    }
  }
  const c = rows[0]
  return {
    obra: r.obra_id, cotizacion: { cliente: c.cliente, obra_nombre: c.obra_nombre, estado: c.estado, fecha: c.fecha },
    ...calcularDesvioCotizacion({ monto_venta: c.monto_venta, costo_estimado: c.costo_estimado, costo_real: real.total }),
    costo_real_detalle: { n_comprobantes: real.n, por_categoria: real.por_categoria },
    fuente: 'cotizado = public.cotizaciones (cargado por el dueño) · real = public.costos_obra',
    criterio: 'el costo real es TODO lo imputado a la obra (no solo las partidas del APU); si el desvío sorprende, revisar primero qué se imputó.',
  }
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
