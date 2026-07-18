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
 *  filas = [{ concepto, monto, pagado, vencimiento }]  (pagado = suma de aplicaciones_pago). */
export function analizarObligaciones(hoy, filas) {
  const hoyD = dias(hoy)
  const porTipo = {}
  let saldoTotal = 0, vencido = 0, prox30 = 0
  const vencidas = []
  for (const f of filas) {
    const monto = Number(f.monto || 0)
    const pagado = Number(f.pagado || 0)
    const saldo = Math.max(0, monto - pagado)
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
    sin_vencimiento: filas.filter((f) => !f.vencimiento && Math.max(0, Number(f.monto || 0) - Number(f.pagado || 0)) > 0).length,
  }
}

/** Capacidad pública: estado de obligaciones a hoy. Cruza obligaciones con sus pagos aplicados. 0 API. */
export async function estadoObligaciones(hoy = new Date()) {
  const { rows } = await query(
    `select o.concepto, o.monto_total::float8 monto, o.fecha_vencimiento vencimiento,
            coalesce((select sum(ap.monto_aplicado) from public.aplicaciones_pago ap where ap.obligacion_id = o.id), 0)::float8 pagado
       from public.obligaciones o`)
  const a = analizarObligaciones(hoy, rows)
  return { ...a, n_obligaciones: rows.length, fuente: 'public.obligaciones + aplicaciones_pago (Cash Flow / Control de Gastos)' }
}
