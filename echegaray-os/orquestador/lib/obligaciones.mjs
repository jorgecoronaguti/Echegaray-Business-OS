// OBLIGACIONES (área Adm. y Finanzas). Estado de la deuda de la empresa por tipo, saldo pendiente
// (obligación − pagos aplicados vía aplicaciones_pago), y vencimientos. Sobre public.obligaciones +
// aplicaciones_pago (el modelo ya existe). 0 API, nada inventado. LÍMITE: muchas obligaciones son
// "deuda acumulada" sin fecha de vencimiento cargada → se informan como saldo, no como vencimiento.
import { query } from './db.mjs'

const dias = (d) => Math.floor(new Date(d).getTime() / 86400000)

/** Clasifica el concepto en un tipo de obligación (para agrupar). */
export function tipoObligacion(concepto) {
  const c = String(concepto || '').toLowerCase()
  if (/cese|uocra|ieric|labor|sueldo|jornal/.test(c)) return 'laboral'
  if (/arca|afip|iva|f931|impositiv|ingresos brutos|iibb|dgr|ganancias|fiscal/.test(c)) return 'impositiva'
  if (/banco|financ|préstamo|prestamo|cheque|tarjeta/.test(c)) return 'financiera'
  if (/comercial|proveedor|deuda comercial/.test(c)) return 'comercial'
  if (/alquiler|renta/.test(c)) return 'operativa'
  return 'otras'
}

/** CORE PURO (testeable sin DB): estado de obligaciones a una fecha.
 *  filas = [{ concepto, saldo, vencimiento }].
 *
 *  FUENTE ÚNICA: el `saldo` NO se calcula acá — viene de la vista `public.obligacion_resumen`
 *  (saldo_pendiente = monto_total − pagos aplicados), que es la MISMA que consume la web. Antes este
 *  módulo lo recalculaba en JS: dos definiciones del mismo concepto, que coincidían por cuidado y no
 *  por construcción. Esta función clasifica y agrega; qué es el saldo lo define Postgres. */
export function analizarObligaciones(hoy, filas) {
  const hoyD = dias(hoy)
  const porTipo = {}
  let saldoTotal = 0, vencido = 0, prox30 = 0
  const vencidas = []
  for (const f of filas) {
    const saldo = Math.max(0, Number(f.saldo || 0))
    if (saldo <= 0) continue
    saldoTotal += saldo
    const tipo = tipoObligacion(f.concepto)
    porTipo[tipo] = (porTipo[tipo] || 0) + saldo
    if (f.vencimiento) {
      const v = dias(f.vencimiento)
      if (v < hoyD) { vencido += saldo; vencidas.push({ concepto: f.concepto, saldo, vencimiento: f.vencimiento, tipo }) }
      else if (v <= hoyD + 30) prox30 += saldo
    }
  }
  return {
    saldo_total: Math.round(saldoTotal),
    por_tipo: Object.fromEntries(Object.entries(porTipo).map(([k, v]) => [k, Math.round(v)]).sort((a, b) => b[1] - a[1])),
    vencido: Math.round(vencido),
    entra_30_dias: Math.round(prox30),
    vencidas: vencidas.sort((a, b) => b.saldo - a.saldo).slice(0, 10),
    sin_vencimiento: filas.filter((f) => !f.vencimiento && Math.max(0, Number(f.saldo || 0)) > 0).length,
  }
}

/** Capacidad pública: estado de obligaciones a hoy. 0 API.
 *  Lee la VISTA `public.obligacion_resumen` — la MISMA fuente que consume la web. No recalcula el
 *  saldo: un concepto de negocio que se muestra en más de una cara del OS se define una sola vez,
 *  en Postgres. Ver scripts/canario-fuente-unica.mjs (verifica que web y chat sigan dando lo mismo). */
export async function estadoObligaciones(hoy = new Date()) {
  const { rows } = await query(
    `select concepto, saldo_pendiente::float8 saldo, fecha_vencimiento vencimiento
       from public.obligacion_resumen`)
  const a = analizarObligaciones(hoy, rows)
  return { ...a, n_obligaciones: rows.length, fuente: 'vista public.obligacion_resumen (fuente única compartida con la web)' }
}
