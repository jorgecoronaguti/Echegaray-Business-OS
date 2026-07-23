// Tipos del Calendario Financiero. Espejo del payload que produce el motor
// (orquestador/lib/calendario-financiero.mjs) y que el worker materializa en public.finanzas_calendario.
// La Web NO calcula nada: sólo pinta esto.

export type NivelRiesgo = 'bajo' | 'medio' | 'alto'

export interface MovimientoDia {
  tipo: 'ingreso' | 'egreso'
  monto: number
  categoria: string
  proveedor: string | null
  cliente: string | null
  obra: string | null
  cuenta: string | null
  medio: string | null
  origen: string | null
  detalle: string | null
  // Deuda traída al primer día porque su vencimiento ya pasó. Sin esta marca el panel la mostraría
  // como un vencimiento de hoy, que es una lectura distinta.
  vencida?: boolean
  vence_original?: string
}

export interface DiaCalendario {
  fecha: string
  saldo_inicial: number
  ingresos: number
  egresos: number
  saldo_final: number
  obligaciones: number
  impuestos: number
  cargas_sociales: number
  cheques: number
  cobranzas: number
  descubierto_utilizado: number
  credito_disponible: number
  riesgo: NivelRiesgo
  recomendaciones: number
  movimientos: MovimientoDia[]
}

export interface RecomendacionFinanciera {
  prioridad: string
  titulo: string
  impacto_pesos: number
  explicacion: string
  riesgo: string
  ahorro: string
  fundamentos: string
}

// Deuda real que existe pero no pudo ubicarse en ningún día del calendario por falta de fecha
// prevista de pago (Compras la tiene marcada "Pendiente" en vez de una fecha). Se declara, no se tapa.
export interface SinFecha {
  n: number
  monto: number
  fuente: string
}

export interface CalendarioFinanciero {
  desde: string
  hasta: string
  caja_inicial: number
  dias: DiaCalendario[]
  recomendaciones: RecomendacionFinanciera[]
  generado_en: string
  fuentes?: string
  sin_fecha?: SinFecha | null
}
