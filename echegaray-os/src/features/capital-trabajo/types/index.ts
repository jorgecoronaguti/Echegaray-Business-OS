import type { Cliente, Proveedor } from '@/features/fundacion/types'
import type { MovimientoCaja } from '@/features/flujo-caja/types'
import type { ObligacionResumen, AplicacionPago } from '@/features/obligaciones/types'

// F2 — Capital de Trabajo y Exposición Financiera (primer incremento). 100% síntesis
// TypeScript sobre datos ya existentes (clientes, proveedores, movimientos_caja,
// obligacion_resumen) — cero tablas o vistas SQL nuevas, mismo criterio que F1
// (posicion-caja). No incluye todavía "obra rentable que consume caja" (depende de
// costos_reales, hoy vacío) ni "necesidad de financiamiento" cuantificada — ver gap
// documentado en pr1-b-cf-cob-cheques.md.

export interface ExposicionContraparte {
  id: string
  nombre: string
  montoPendiente: number
  porcentajeDelTotal: number
}

export interface CapitalTrabajo {
  totalCxC: number
  totalCxP: number
  capitalTrabajoNeto: number
  exposicionPorCliente: ExposicionContraparte[]
  exposicionPorProveedor: ExposicionContraparte[]
}

interface DatosCapitalTrabajo {
  clientes: Cliente[]
  proveedores: Proveedor[]
  movimientos: MovimientoCaja[]
  obligacionesResumen: ObligacionResumen[]
  aplicacionesPago: AplicacionPago[]
}

function construirExposicion(
  montosPorId: Map<string, number>,
  nombresPorId: Map<string, string>,
  total: number
): ExposicionContraparte[] {
  return Array.from(montosPorId.entries())
    .map(([id, monto]) => ({
      id,
      nombre: nombresPorId.get(id) ?? 'Desconocido',
      montoPendiente: monto,
      porcentajeDelTotal: total > 0 ? monto / total : 0,
    }))
    .sort((a, b) => b.montoPendiente - a.montoPendiente)
}

export function calcularCapitalTrabajo(datos: DatosCapitalTrabajo): CapitalTrabajo {
  const movimientoIdsYaAplicados = new Set(datos.aplicacionesPago.map((a) => a.movimiento_caja_id))

  // CxC: cobros proyectados todavía no cobrados (los "real" ya impactaron la cuenta,
  // no son una cuenta por cobrar sino caja ya percibida).
  const cobrosPendientes = datos.movimientos.filter((m) => m.tipo === 'cobro' && m.estado === 'proyectado')
  const montoPorCliente = new Map<string, number>()
  for (const m of cobrosPendientes) {
    if (!m.cliente_id) continue
    montoPorCliente.set(m.cliente_id, (montoPorCliente.get(m.cliente_id) ?? 0) + m.monto)
  }
  const totalCxC = cobrosPendientes.reduce((acc, m) => acc + m.monto, 0)

  // CxP: saldo_pendiente de obligaciones (ya neto de aplicaciones_pago) + pagos
  // proyectados sueltos no aplicados a ninguna obligación (mismo criterio anti-doble-
  // conteo que F1).
  const pagosSueltos = datos.movimientos.filter(
    (m) => m.tipo === 'pago' && m.estado === 'proyectado' && !movimientoIdsYaAplicados.has(m.id)
  )
  const montoPorProveedor = new Map<string, number>()
  for (const o of datos.obligacionesResumen) {
    if (!o.proveedor_id || o.saldo_pendiente <= 0) continue
    montoPorProveedor.set(o.proveedor_id, (montoPorProveedor.get(o.proveedor_id) ?? 0) + o.saldo_pendiente)
  }
  for (const m of pagosSueltos) {
    if (!m.proveedor_id) continue
    montoPorProveedor.set(m.proveedor_id, (montoPorProveedor.get(m.proveedor_id) ?? 0) + m.monto)
  }
  const totalCxPObligaciones = datos.obligacionesResumen
    .filter((o) => o.saldo_pendiente > 0)
    .reduce((acc, o) => acc + o.saldo_pendiente, 0)
  const totalCxPPagosSueltos = pagosSueltos.reduce((acc, m) => acc + m.monto, 0)
  const totalCxP = totalCxPObligaciones + totalCxPPagosSueltos

  const nombresClientes = new Map(datos.clientes.map((c) => [c.id, c.nombre]))
  const nombresProveedores = new Map(datos.proveedores.map((p) => [p.id, p.nombre]))

  return {
    totalCxC,
    totalCxP,
    capitalTrabajoNeto: totalCxC - totalCxP,
    exposicionPorCliente: construirExposicion(montoPorCliente, nombresClientes, totalCxC),
    exposicionPorProveedor: construirExposicion(montoPorProveedor, nombresProveedores, totalCxP),
  }
}

export interface AlertaConcentracion {
  tipo: 'concentracion_cliente' | 'concentracion_proveedor'
  contraparte: ExposicionContraparte
  mensaje: string
}

// Umbral de concentración: más del 40% de la CxC (o CxP) en una sola contraparte es
// un riesgo real de dependencia (CLAUDE.md raíz: "revenue por empleado" y afines no
// alcanzan si hay concentración de cliente). No es una norma contable, es un criterio
// de gestión — ajustable si Jorge define otro umbral.
const UMBRAL_CONCENTRACION = 0.4

export function calcularAlertasConcentracion(capital: CapitalTrabajo): AlertaConcentracion[] {
  const alertas: AlertaConcentracion[] = []
  for (const c of capital.exposicionPorCliente) {
    if (c.porcentajeDelTotal > UMBRAL_CONCENTRACION) {
      alertas.push({
        tipo: 'concentracion_cliente',
        contraparte: c,
        mensaje: `${c.nombre} concentra ${(c.porcentajeDelTotal * 100).toFixed(0)}% de las cuentas por cobrar pendientes ($${c.montoPendiente.toLocaleString('es-AR')}).`,
      })
    }
  }
  for (const p of capital.exposicionPorProveedor) {
    if (p.porcentajeDelTotal > UMBRAL_CONCENTRACION) {
      alertas.push({
        tipo: 'concentracion_proveedor',
        contraparte: p,
        mensaje: `${p.nombre} concentra ${(p.porcentajeDelTotal * 100).toFixed(0)}% de las cuentas por pagar pendientes ($${p.montoPendiente.toLocaleString('es-AR')}).`,
      })
    }
  }
  return alertas
}
