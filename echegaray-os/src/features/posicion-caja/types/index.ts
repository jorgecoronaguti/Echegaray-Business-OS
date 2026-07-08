import type { CuentaFinanciera } from '@/features/fundacion/types'
import type { MovimientoCaja } from '@/features/flujo-caja/types'
import type { ObligacionResumen, AplicacionPago } from '@/features/obligaciones/types'

// F1 — Posición de Caja Consolidada y Proyectada. Reemplaza el cálculo de
// "cobros proyectados en ventana" que antes vivía duplicado dentro de
// dashboardDataService.ts (PRP-011) — ahora ese cálculo importa de acá, no lo
// reimplementa. 100% síntesis en TypeScript sobre datos ya existentes
// (cuentas_financieras, movimientos_caja, obligacion_resumen): cero tablas o
// vistas SQL nuevas.
//
// Doble conteo evitado: un movimiento_caja tipo=pago ya aplicado a una obligación
// (vía aplicaciones_pago) no se suma de nuevo como "pago proyectado suelto" — la
// obligación ya lo refleja en su saldo_pendiente (obligacion_resumen).

export interface ItemComposicion {
  id: string
  concepto: string
  monto: number
  fecha: string
}

export interface ComposicionPeriodo {
  inicio: string
  fin: string
  saldoInicial: number
  cobrosCiertos: number
  cobrosEstimados: number
  pagosComprometidos: number
  pagosProyectadosSueltos: number
  saldoFinal: number
  esDeficit: boolean
  detalleCobrosCiertos: ItemComposicion[]
  detalleCobrosEstimados: ItemComposicion[]
  detallePagosComprometidos: ItemComposicion[]
  detallePagosProyectadosSueltos: ItemComposicion[]
}

export interface PosicionCajaConsolidada {
  saldoActual: number
  forecastSemanal: ComposicionPeriodo[]
  forecastMensual: ComposicionPeriodo[]
}

export const CANTIDAD_SEMANAS_FORECAST = 8
export const CANTIDAD_MESES_FORECAST = 6

function inicioSemana(fecha: Date): Date {
  const d = new Date(Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), fecha.getUTCDate()))
  const diaSemana = d.getUTCDay() // 0=domingo
  const offset = diaSemana === 0 ? -6 : 1 - diaSemana // lunes como inicio
  d.setUTCDate(d.getUTCDate() + offset)
  return d
}

function sumarDias(fecha: Date, dias: number): Date {
  const d = new Date(fecha)
  d.setUTCDate(d.getUTCDate() + dias)
  return d
}

function inicioMes(fecha: Date): Date {
  return new Date(Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), 1))
}

function sumarMeses(fecha: Date, meses: number): Date {
  return new Date(Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth() + meses, 1))
}

function aISO(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function enRango(fechaStr: string | null, inicio: Date, fin: Date): boolean {
  if (!fechaStr) return false
  const fecha = new Date(fechaStr)
  return fecha >= inicio && fecha < fin
}

interface DatosCalculo {
  cuentas: CuentaFinanciera[]
  movimientos: MovimientoCaja[]
  obligacionesResumen: ObligacionResumen[]
  aplicacionesPago: AplicacionPago[]
  hoy?: Date
}

function calcularSaldoActual(cuentas: CuentaFinanciera[], movimientos: MovimientoCaja[]): number {
  const saldoInicialTotal = cuentas.reduce((acc, c) => acc + c.saldo_inicial, 0)
  const impactoReales = movimientos
    .filter((m) => m.estado === 'real')
    .reduce((acc, m) => acc + (m.tipo === 'cobro' ? m.monto : -m.monto), 0)
  return saldoInicialTotal + impactoReales
}

function construirPeriodos(
  rangos: { inicio: Date; fin: Date }[],
  saldoInicialGlobal: number,
  movimientos: MovimientoCaja[],
  obligacionesResumen: ObligacionResumen[],
  movimientoIdsYaAplicados: Set<string>
): ComposicionPeriodo[] {
  const periodos: ComposicionPeriodo[] = []
  let saldoArrastrado = saldoInicialGlobal

  for (const { inicio, fin } of rangos) {
    const cobrosCiertosMov = movimientos.filter(
      (m) => m.tipo === 'cobro' && m.estado === 'real' && enRango(m.fecha_real, inicio, fin)
    )
    const cobrosEstimadosMov = movimientos.filter(
      (m) => m.tipo === 'cobro' && m.estado === 'proyectado' && enRango(m.fecha_esperada, inicio, fin)
    )
    // Pagos comprometidos: obligaciones con saldo pendiente y vencimiento en el
    // período — fuente única (obligacion_resumen), no se mezcla con movimientos_caja
    // para el mismo compromiso.
    const obligacionesEnPeriodo = obligacionesResumen.filter(
      (o) => o.saldo_pendiente > 0 && enRango(o.fecha_vencimiento, inicio, fin)
    )
    // Pagos proyectados sueltos: movimientos_caja tipo=pago proyectados que NO están
    // ya aplicados a una obligación (evita el doble conteo).
    const pagosSueltosMov = movimientos.filter(
      (m) =>
        m.tipo === 'pago' &&
        m.estado === 'proyectado' &&
        enRango(m.fecha_esperada, inicio, fin) &&
        !movimientoIdsYaAplicados.has(m.id)
    )

    const cobrosCiertos = cobrosCiertosMov.reduce((acc, m) => acc + m.monto, 0)
    const cobrosEstimados = cobrosEstimadosMov.reduce((acc, m) => acc + m.monto, 0)
    const pagosComprometidos = obligacionesEnPeriodo.reduce((acc, o) => acc + o.saldo_pendiente, 0)
    const pagosProyectadosSueltos = pagosSueltosMov.reduce((acc, m) => acc + m.monto, 0)

    const saldoInicial = saldoArrastrado
    const saldoFinal = saldoInicial + cobrosCiertos + cobrosEstimados - pagosComprometidos - pagosProyectadosSueltos

    periodos.push({
      inicio: aISO(inicio),
      fin: aISO(fin),
      saldoInicial,
      cobrosCiertos,
      cobrosEstimados,
      pagosComprometidos,
      pagosProyectadosSueltos,
      saldoFinal,
      esDeficit: saldoFinal < 0,
      detalleCobrosCiertos: cobrosCiertosMov.map((m) => ({ id: m.id, concepto: m.concepto, monto: m.monto, fecha: m.fecha_real! })),
      detalleCobrosEstimados: cobrosEstimadosMov.map((m) => ({ id: m.id, concepto: m.concepto, monto: m.monto, fecha: m.fecha_esperada })),
      detallePagosComprometidos: obligacionesEnPeriodo.map((o) => ({
        id: o.obligacion_id,
        concepto: o.concepto,
        monto: o.saldo_pendiente,
        fecha: o.fecha_vencimiento!,
      })),
      detallePagosProyectadosSueltos: pagosSueltosMov.map((m) => ({ id: m.id, concepto: m.concepto, monto: m.monto, fecha: m.fecha_esperada })),
    })

    saldoArrastrado = saldoFinal
  }

  return periodos
}

export function calcularPosicionCajaConsolidada(datos: DatosCalculo): PosicionCajaConsolidada {
  const hoy = datos.hoy ?? new Date()
  const saldoActual = calcularSaldoActual(datos.cuentas, datos.movimientos)
  const movimientoIdsYaAplicados = new Set(datos.aplicacionesPago.map((a) => a.movimiento_caja_id))

  const inicioSemanaActual = inicioSemana(hoy)
  const rangosSemanales = Array.from({ length: CANTIDAD_SEMANAS_FORECAST }, (_, i) => ({
    inicio: sumarDias(inicioSemanaActual, i * 7),
    fin: sumarDias(inicioSemanaActual, (i + 1) * 7),
  }))

  const inicioMesActual = inicioMes(hoy)
  const rangosMensuales = Array.from({ length: CANTIDAD_MESES_FORECAST }, (_, i) => ({
    inicio: sumarMeses(inicioMesActual, i),
    fin: sumarMeses(inicioMesActual, i + 1),
  }))

  return {
    saldoActual,
    forecastSemanal: construirPeriodos(
      rangosSemanales,
      saldoActual,
      datos.movimientos,
      datos.obligacionesResumen,
      movimientoIdsYaAplicados
    ),
    forecastMensual: construirPeriodos(
      rangosMensuales,
      saldoActual,
      datos.movimientos,
      datos.obligacionesResumen,
      movimientoIdsYaAplicados
    ),
  }
}

// Reemplaza el cálculo que antes vivía inline en dashboardDataService.ts — "cuánto se
// espera cobrar (proyectado) en los próximos `dias` días desde hoy". Usado por la
// alerta de tensión de liquidez de `obligaciones` (calcularTensionLiquidez).
export function cobrosProyectadosEnVentana(movimientos: MovimientoCaja[], dias: number, hoy: Date = new Date()): number {
  return movimientos
    .filter((m) => {
      if (m.tipo !== 'cobro' || m.estado !== 'proyectado') return false
      const diasHasta = (new Date(m.fecha_esperada).getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24)
      return diasHasta >= 0 && diasHasta <= dias
    })
    .reduce((acc, m) => acc + m.monto, 0)
}

export interface AlertaDeficit {
  tipo: 'deficit_proyectado'
  periodo: ComposicionPeriodo
  mensaje: string
}

// Alerta de déficit proyectado — solo sobre el forecast semanal (más accionable que
// el mensual) y solo dentro de las primeras 4 semanas (más allá de eso, la
// incertidumbre de los datos hoy cargados es demasiado alta para alertar con
// severidad, ver gaps documentados en pr0-linea-base-echegaray.md).
const SEMANAS_RELEVANTES_PARA_ALERTA = 4

export function calcularAlertasDeficit(forecastSemanal: ComposicionPeriodo[]): AlertaDeficit[] {
  return forecastSemanal
    .slice(0, SEMANAS_RELEVANTES_PARA_ALERTA)
    .filter((p) => p.esDeficit)
    .map((periodo) => ({
      tipo: 'deficit_proyectado' as const,
      periodo,
      mensaje: `Semana del ${periodo.inicio}: saldo proyectado $${periodo.saldoFinal.toFixed(2)} (déficit).`,
    }))
}

// Identifica el ítem individual (pago comprometido o proyectado suelto) que más pesa
// en el déficit de un período, para que la acción sugerida sea concreta ("cubrir X")
// en vez de un texto genérico repetido en cada semana con déficit.
export function causaPrincipalDeficit(periodo: ComposicionPeriodo): ItemComposicion | null {
  const items = [...periodo.detallePagosComprometidos, ...periodo.detallePagosProyectadosSueltos]
  if (items.length === 0) return null
  return items.reduce((mayor, actual) => (actual.monto > mayor.monto ? actual : mayor))
}
