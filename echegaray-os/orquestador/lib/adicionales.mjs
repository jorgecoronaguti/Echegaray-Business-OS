// ADICIONALES (área Obras). El dueño: "no se manejan bien en la actualidad" → greenfield. La tabla
// public.adicionales ya modela el flujo detección→cotización→aprobación→facturación→cobranza; esto
// da la forma de REGISTRARLOS y seguir el embudo, keyeados al eje canónico. El adicional NO cobrado
// es plata perdida — el KPI clave es % cobrado sobre aprobado. Interno/reversible (patrón certificaciones).
import { query } from './db.mjs'
import { resolverObra } from './obras.mjs'

const ISO_HOY = () => new Date().toISOString().slice(0, 10)
const ESTADOS = ['detectado', 'cotizado', 'aprobado', 'facturado', 'cobrado']

/** VALIDACIÓN PURA (testeable): normaliza monto es-AR (opcional) y estado. */
export function validarAdicional({ concepto, monto, estado }) {
  if (!concepto || !String(concepto).trim()) return { ok: false, error: 'falta el concepto del adicional (qué es)' }
  const est = String(estado || 'detectado').toLowerCase()
  if (!ESTADOS.includes(est)) return { ok: false, error: `estado inválido: "${estado}". Usá: ${ESTADOS.join(', ')}` }
  let m = null
  if (monto != null && monto !== '') {
    m = typeof monto === 'number' ? monto : Number(String(monto).replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.'))
    if (!Number.isFinite(m) || m <= 0) return { ok: false, error: 'el monto tiene que ser un número mayor a 0' }
  }
  if (est !== 'detectado' && m == null) return { ok: false, error: `para estado "${est}" hace falta el monto` }
  return { ok: true, concepto: String(concepto).trim(), monto: m, estado: est }
}

/** CORE PURO: embudo de adicionales (detectado→cobrado) + KPI % cobrado sobre aprobado. */
export function analizarAdicionales(filas) {
  let nDet = 0, nApr = 0, nFact = 0, nCob = 0, mApr = 0, mFact = 0, mCob = 0
  for (const a of filas) {
    nDet++
    if (a.monto_aprobado) { nApr++; mApr += Number(a.monto_aprobado) }
    if (a.monto_facturado) { nFact++; mFact += Number(a.monto_facturado) }
    if (a.monto_cobrado) { nCob++; mCob += Number(a.monto_cobrado) }
  }
  return {
    detectados: nDet, aprobados: nApr, facturados: nFact, cobrados: nCob,
    monto_aprobado: Math.round(mApr), monto_facturado: Math.round(mFact), monto_cobrado: Math.round(mCob),
    monto_sin_cobrar: Math.round(mApr - mCob),
    pct_cobrado_sobre_aprobado: mApr ? Math.round((mCob / mApr) * 1000) / 10 : null,
  }
}

/** Registra un adicional en el estado indicado (llena la fecha+monto de ese hito, acumulativo). */
export async function registrarAdicional({ obra, concepto, monto, estado, detectado_por, fecha }) {
  const r = await resolverObra(obra)
  if (!r.obra_id) return { error: `"${obra}" no resuelve a una obra. Obras: La Estrella, San Francisco, Messina, ARCOR, Galpones.` }
  const v = validarAdicional({ concepto, monto, estado })
  if (!v.ok) return { error: v.error }
  const f = fecha || ISO_HOY()
  const col = { cotizado: ['fecha_cotizacion', 'monto_cotizado'], aprobado: ['fecha_aprobacion', 'monto_aprobado'], facturado: ['fecha_facturacion', 'monto_facturado'], cobrado: ['fecha_cobranza', 'monto_cobrado'] }[v.estado]
  const campos = ['obra_canonica_id', 'concepto', 'detectado_por', 'fecha_deteccion']
  const vals = [r.obra_id, v.concepto, detectado_por ? String(detectado_por) : null, f]
  if (col) { campos.push(col[0], col[1]); vals.push(f, v.monto) }
  const ph = vals.map((_, i) => `$${i + 1}`).join(',')
  const ins = await query(`insert into public.adicionales (${campos.join(',')}, created_at) values (${ph}, now()) returning id`, vals)
  return { registrado: true, id: ins.rows[0].id, obra: r.obra_id, concepto: v.concepto, estado: v.estado, monto: v.monto }
}

/** Estado de adicionales de una obra (o de todas si no se pasa obra). 0 API. */
export async function estadoAdicionales(obraTexto) {
  let obraId = null
  if (obraTexto) { const r = await resolverObra(obraTexto); if (!r.obra_id) return { error: `"${obraTexto}" no resuelve a una obra` }; obraId = r.obra_id }
  const { rows } = await query(
    `select concepto, obra_canonica_id, to_char(fecha_deteccion,'DD/MM/YYYY') detectado,
            monto_cotizado::float8 monto_cotizado, monto_aprobado::float8 monto_aprobado,
            monto_facturado::float8 monto_facturado, monto_cobrado::float8 monto_cobrado
       from public.adicionales ${obraId ? 'where obra_canonica_id=$1' : ''} order by fecha_deteccion nulls last`,
    obraId ? [obraId] : [])
  return { ...analizarAdicionales(rows), obra: obraId, adicionales: rows, fuente: 'public.adicionales' }
}
