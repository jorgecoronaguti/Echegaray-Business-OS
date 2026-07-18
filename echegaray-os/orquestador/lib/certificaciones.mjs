// CERTIFICACIONES (ingreso DEVENGADO por obra). Greenfield: la empresa "quiere empezar a tener"
// certificaciones para demostrar el avance facturable. La tabla public.certificados ya modela el
// flujo (certificado→facturado→cobrado); esto da la forma de REGISTRARLAS, keyeadas al eje canónico,
// para que salud_obra calcule el MARGEN devengado (regla del dueño: ingreso devengado en P&L,
// percibido en Flujo). Registrar es interno y reversible (Nivel D); el chat confirma el número.
import { query } from './db.mjs'
import { resolverObra } from './obras.mjs'

const ISO_HOY = () => new Date().toISOString().slice(0, 10)

/** VALIDACIÓN PURA (testeable sin DB): normaliza monto y fecha, o devuelve error claro. */
export function validarCertificacion({ monto, fecha }) {
  // El schema pasa monto como number; el string es fallback humano es-AR ("$5.000.000" / "5.000.000,50"):
  // coma = decimal, punto = miles.
  let m = typeof monto === 'number' ? monto : NaN
  if (Number.isNaN(m)) {
    const s = String(monto ?? '').replace(/[^\d,.-]/g, '')
    m = Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/\./g, ''))
  }
  if (!Number.isFinite(m) || m <= 0) return { ok: false, error: 'el monto certificado tiene que ser un número mayor a 0' }
  let f = String(fecha ?? '').trim()
  if (f) {
    // acepta DD/MM/AAAA (es-AR) o AAAA-MM-DD
    const dm = f.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
    if (dm) f = `${dm[3]}-${dm[2].padStart(2, '0')}-${dm[1].padStart(2, '0')}`
    else if (!/^\d{4}-\d{2}-\d{2}$/.test(f)) return { ok: false, error: `fecha no reconocida: "${fecha}" (usá DD/MM/AAAA)` }
  } else f = ISO_HOY()
  return { ok: true, monto: m, fecha: f }
}

/** Registra una certificación (ingreso devengado) para una obra. Resuelve la obra al eje canónico.
 *  Interno/reversible. Devuelve lo registrado para que el chat lo confirme — NO inventa. */
export async function registrarCertificacion({ obra, monto, fecha, numero, descripcion, notas }) {
  const r = await resolverObra(obra)
  if (!r.obra_id) return { error: `"${obra}" no resuelve a una obra (${r.clasificacion}). Obras: La Estrella, San Francisco, Messina, ARCOR, Galpones.` }
  const v = validarCertificacion({ monto, fecha })
  if (!v.ok) return { error: v.error }
  const ins = await query(
    `insert into public.certificados
       (obra_canonica_id, numero, descripcion, fecha_certificacion, monto_certificado, notas, created_at)
     values ($1,$2,$3,$4,$5,$6, now()) returning id`,
    [r.obra_id, numero ? String(numero) : null, descripcion ? String(descripcion) : null, v.fecha, v.monto, notas ? String(notas) : null])
  return { registrado: true, id: ins.rows[0].id, obra: r.obra_id, monto_certificado: v.monto, fecha_certificacion: v.fecha, numero: numero ?? null }
}

/** Ingreso certificado (devengado) acumulado de una obra canónica. null si no hay certificaciones. */
export async function ingresoCertificado(obraCanonicaId) {
  const r = (await query(
    'select coalesce(sum(monto_certificado),0) total, count(*)::int n from public.certificados where obra_canonica_id=$1',
    [obraCanonicaId])).rows[0]
  return Number(r?.n || 0) > 0 ? Number(r.total) : null
}

/** Detalle de certificaciones de una obra (para listar / seguir el flujo). */
export async function certificacionesDeObra(obraCanonicaId) {
  const { rows } = await query(
    `select id, numero, to_char(fecha_certificacion,'DD/MM/YYYY') fecha, monto_certificado::float8 monto,
            monto_facturado::float8 facturado, monto_cobrado::float8 cobrado, descripcion, notas
       from public.certificados where obra_canonica_id=$1 order by fecha_certificacion nulls last`,
    [obraCanonicaId])
  return rows
}
