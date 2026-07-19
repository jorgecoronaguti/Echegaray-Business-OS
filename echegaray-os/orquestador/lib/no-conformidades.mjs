// NO CONFORMIDADES (área Calidad). El dueño: "no existe, hay que empezar a tenerlo" → greenfield.
// Una NC es un desvío de calidad en obra; se trata como proceso detección→tratamiento→cierre. El KPI
// son las NC ABIERTAS (sobre todo graves/críticas) y el tiempo de cierre. Interno/reversible. 0 API.
import { query } from './db.mjs'
import { resolverObra } from './obras.mjs'

const ISO_HOY = () => new Date().toISOString().slice(0, 10)
export const GRAVEDADES = ['leve', 'moderada', 'grave', 'critica']
export const ESTADOS_NC = ['abierta', 'en_tratamiento', 'cerrada']
const sinAcento = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')

/** VALIDACIÓN PURA (testeable): descripción mínima + gravedad + estado normalizados. */
export function validarNC({ descripcion, gravedad, estado }) {
  if (!descripcion || !String(descripcion).trim()) return { ok: false, error: 'falta la descripción de la no conformidad (qué pasó)' }
  let grav = gravedad == null || gravedad === '' ? null : sinAcento(String(gravedad)).toLowerCase().trim()
  if (grav && !GRAVEDADES.includes(grav)) return { ok: false, error: `gravedad inválida: "${gravedad}". Usá: ${GRAVEDADES.join(', ')}` }
  const est = sinAcento(String(estado || 'abierta')).toLowerCase().trim().replace(/\s+/g, '_')
  if (!ESTADOS_NC.includes(est)) return { ok: false, error: `estado inválido: "${estado}". Usá: ${ESTADOS_NC.join(', ')}` }
  return { ok: true, descripcion: String(descripcion).trim(), gravedad: grav, estado: est }
}

/** CORE PURO: abiertas vs cerradas, desglose por gravedad, graves/críticas abiertas, tiempo de cierre. */
export function analizarNC(filas) {
  let abiertas = 0, cerradas = 0, gravesAbiertas = 0
  const porGravedad = { leve: 0, moderada: 0, grave: 0, critica: 0 }
  let diasCierreSum = 0, diasCierreN = 0
  for (const nc of filas) {
    const est = String(nc.estado || '').toLowerCase()
    const grav = String(nc.gravedad || '').toLowerCase()
    if (grav in porGravedad) porGravedad[grav]++
    if (est === 'cerrada') {
      cerradas++
      if (nc.fecha_deteccion && nc.fecha_cierre) {
        const d = (new Date(nc.fecha_cierre) - new Date(nc.fecha_deteccion)) / 86400000
        if (Number.isFinite(d) && d >= 0) { diasCierreSum += d; diasCierreN++ }
      }
    } else {
      abiertas++
      if (grav === 'grave' || grav === 'critica') gravesAbiertas++
    }
  }
  return {
    total: filas.length, abiertas, cerradas, graves_criticas_abiertas: gravesAbiertas,
    por_gravedad: porGravedad,
    dias_promedio_cierre: diasCierreN ? Math.round((diasCierreSum / diasCierreN) * 10) / 10 : null,
  }
}

/** Registra una NC o AVANZA su estado. Al cerrar, sella fecha_cierre (si no se pasa, hoy). */
export async function registrarNC({ obra, descripcion, gravedad, tipo, estado, accion_correctiva, detectada_por, fecha }) {
  const v = validarNC({ descripcion, gravedad, estado })
  if (!v.ok) return { error: v.error }
  let obraId = null
  if (obra) { const r = await resolverObra(obra); if (r.obra_id) obraId = r.obra_id }
  const campos = ['obra_canonica_id', 'descripcion', 'gravedad', 'tipo', 'estado', 'accion_correctiva', 'detectada_por', 'fecha_deteccion', 'origen']
  const vals = [obraId, v.descripcion, v.gravedad, tipo ? String(tipo) : null, v.estado, accion_correctiva ? String(accion_correctiva) : null, detectada_por ? String(detectada_por) : null, fecha || ISO_HOY(), 'os']
  if (v.estado === 'cerrada') { campos.push('fecha_cierre'); vals.push(fecha || ISO_HOY()) }
  const ph = vals.map((_, i) => `$${i + 1}`).join(',')
  const ins = await query(`insert into public.no_conformidades (${campos.join(',')}, created_at) values (${ph}, now()) returning id`, vals)
  return { registrada: true, id: ins.rows[0].id, obra: obraId, descripcion: v.descripcion, gravedad: v.gravedad, estado: v.estado }
}

/** Estado de las NC (todas, o de una obra). 0 API. */
export async function estadoNC(obraTexto) {
  let obraId = null
  if (obraTexto) { const r = await resolverObra(obraTexto); if (!r.obra_id) return { error: `"${obraTexto}" no resuelve a una obra` }; obraId = r.obra_id }
  const { rows } = await query(
    `select descripcion, obra_canonica_id, gravedad, tipo, estado, accion_correctiva,
            to_char(fecha_deteccion,'DD/MM/YYYY') detectada, to_char(fecha_cierre,'DD/MM/YYYY') cerrada,
            fecha_deteccion, fecha_cierre
       from public.no_conformidades ${obraId ? 'where obra_canonica_id=$1' : ''}
      order by (estado='cerrada'), fecha_deteccion desc nulls last`, obraId ? [obraId] : [])
  const analisis = analizarNC(rows)
  const limpias = rows.map(({ fecha_deteccion, fecha_cierre, ...r }) => r)
  return { ...analisis, no_conformidades: limpias, obra: obraId, fuente: 'public.no_conformidades' }
}
