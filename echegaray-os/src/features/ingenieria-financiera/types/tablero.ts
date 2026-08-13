// Tipos de las salidas del motor de Ingeniería Financiera que la Web muestra en el TABLERO completo.
// Espejo del contrato que producen los tools finanzas.modelo_liquidez, finanzas.condiciones_financieras,
// finanzas.comparar_financiamiento y finanzas.priorizar_pagos (orquestador/lib/ingenieria-financiera.mjs
// + condiciones-financieras.mjs), materializados por sus syncs en las tablas public.finanzas_*. La Web
// NO calcula un peso: sólo pinta estos snapshots. Si un número está mal, se arregla en el motor.

// ── Modelo único de liquidez ────────────────────────────────────────────────
export interface BloqueDisponible {
  estado: 'ok' | 'sin dato'
  motivo?: string
  caja_hoy?: number
  cobranzas_por_cobrar_mes?: number
  cobranzas_vencidas?: number
  vencimientos_7dias?: number
  proyeccion_7dias?: number
  evidencia?: string
}

export interface BloqueComprometido {
  estado: 'ok' | 'sin dato'
  motivo?: string
  saldo_total?: number
  vencido?: number
  entra_30_dias?: number
  por_tipo?: Record<string, number>
  evidencia?: string
}

export interface BloqueComercial {
  estado: 'ok' | 'sin dato'
  motivo?: string
  vencido?: number
  n?: number
  evidencia?: string
}

export interface LineaDescubierto {
  limite: number
  vence?: string
  tna?: number
  cft?: number
  usado_aprox: number | null
  disponible_aprox: number | null
  nota?: string
}

export interface Lineas {
  descubierto: LineaDescubierto
  tarjeta: { limite: number; disponible: number; cuotas_disponible?: number }
  costo_marginal: string
}

export interface ModeloLiquidez {
  fecha: string
  disponible: BloqueDisponible
  comprometido: BloqueComprometido
  deuda_comercial: BloqueComercial
  lineas: Lineas
  colchon_total: number | null
  fuentes?: string
}

export interface RecomendacionModelo {
  prioridad: string
  titulo: string
  impacto_pesos: number
  explicacion: string
  riesgo: string
  ahorro: string
  fundamentos: string
}

// La fila de public.finanzas_modelo_liquidez.
export interface ModeloLiquidezVigente {
  modelo: ModeloLiquidez
  recomendaciones: RecomendacionModelo[]
  calculado_en: string
}

// ── Condiciones de financiamiento ────────────────────────────────────────────
export interface CondicionFinanciera {
  entidad: string
  producto: string
  tipo: string
  moneda: string | null
  tna: number | null
  cft: number | null
  limite_disponible: number | null
  saldo_utilizado: number | null
  vigencia_hasta: string | null
  nivel_confianza: string | null
  fuente: string | null
  observaciones: string | null
}

export interface FaltanDatosCondicion {
  tipo: string
  producto: string
  entidad?: string
  para_conseguirlo?: string | null
}

export interface CondicionesDoc {
  condiciones: CondicionFinanciera[]
  faltan_datos: FaltanDatosCondicion[]
  nota?: string
  generado_en?: string
}

// La fila de public.finanzas_condiciones_vigentes.
export interface CondicionesVigentes {
  condiciones: CondicionesDoc
  calculado_en: string
}

// ── Comparar financiamiento ──────────────────────────────────────────────────
export interface AlternativaFinanciamiento {
  via: string
  nombre: string
  costoFinanciero: number | null
  costoOportunidad: number
  ahorro: number
  ahorroProntoPago: number
  costoEconomico: number | null
  factible: boolean | null
  nota: string
}

export interface DetalleCondicionCosto {
  entidad: string
  producto: string
  tipo: string
  nivel_confianza: string | null
  capital: number
  dias: number
  costo_total: number | null
  costo_efectivo_mensual: number | null
  costo_efectivo_anual: number | null
  falta: string[]
  para_conseguirlo: string | null
  // 'piso' = el costo NO incluye todo (falta IVA, CFT o gastos). No es comparable contra un 'total'.
  completitud?: 'total' | 'piso' | 'sin_dato'
  es_piso?: boolean
}

// Por qué los costos de arriba pueden no ser comparables entre sí. `null` cuando todos son totales.
export interface ComparabilidadCondiciones {
  comparables: number
  incompletas: { entidad: string; producto: string; falta: string[] }[]
  advertencia: string
}

export interface CompararDoc {
  estado: 'ok' | 'sin_necesidad'
  nota?: string
  escenario?: { monto: number; dias: number; origen: string }
  monto?: number
  dias?: number
  alternativas?: AlternativaFinanciamiento[]
  recomendada?: AlternativaFinanciamiento | null
  justificacion?: string
  condiciones?: DetalleCondicionCosto[]
  faltan_datos?: FaltanDatosCondicion[]
  comparabilidad?: ComparabilidadCondiciones | null
  generado_en?: string
}

// La fila de public.finanzas_comparar_financiamiento.
export interface CompararFinanciamientoVigente {
  comparacion: CompararDoc
  calculado_en: string
}

// ── Priorizar pagos ──────────────────────────────────────────────────────────
export interface PagoPriorizado {
  proveedor: string
  monto: number
  dias_a_vencer?: number
  criticidad?: string
  obra?: string | null
  categoria?: string | null
  medio?: string | null
  vencida?: boolean
  vencido?: boolean
  costoDeEsperar?: number
  score?: number
  orden: number
  decision: 'pagar' | 'parcial' | 'esperar'
  motivo?: string
}

export interface PriorizarDoc {
  estado: 'ok' | 'sin_pagos'
  ventana_dias: number
  caja_disponible: number | null
  total: number
  total_a_pagar: number
  pagos: PagoPriorizado[]
  nota?: string
  generado_en?: string
}

// La fila de public.finanzas_priorizar_pagos.
export interface PriorizarPagosVigente {
  priorizacion: PriorizarDoc
  calculado_en: string
}
