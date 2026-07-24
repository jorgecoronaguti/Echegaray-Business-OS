// Tipos del Plan de Tesorería y su estado vigente. Espejo del contrato que produce el motor
// (orquestador/lib/plan-tesoreria.mjs + plan-vigente.mjs), materializado en public.finanzas_plan_vigente.
// La Web NO calcula nada financiero: sólo pinta este snapshot. Si un número está mal, se arregla en el
// motor, nunca acá.

export type EstadoPlan = 'pendiente_ejecucion' | 'autorizado' | 'ejecutado'

export interface AccionPlan {
  id: string
  fecha: string
  tipo: 'cobrar' | 'pagar' | 'postergar' | 'financiar' | 'cancelar_financiacion'
  descripcion: string
  motivo: string
  impacto_pesos: number
  costo_financiero: number
  efecto_liquidez: number
  riesgos: string
  dependencias: string[]
  medio: string | null
  linea: string | null
  requiere_aprobacion: boolean
}

// La capa de ESTRATEGIA (24/07): el motor piensa como CFO. Por cada horizonte genera varias estrategias
// completas (posturas sobre la MISMA data), las compara con un objetivo CFO explícito y elige una; el plan
// operativo (resumen/acciones del horizonte) es la CONSECUENCIA de la elegida. La web puede pintar esta
// capa; los campos ya existentes del horizonte siguen intactos (retrocompat).
export interface EstrategiaGenerada {
  clave: string
  nombre: string
  objetivo: string
  razonamiento: string
  palancas: { financiar_no_criticos: boolean; piso_liquidez: number; colchon_defensivo: number }
  metricas: {
    costo_financiero: number
    postergados: number
    financiados: number
    pagos_en_fecha: number
    cobros: number
    saldo_final: number
    linea_maxima: number
    limite_linea: number
    excede_limite: boolean
    piso_liquidez: number
    colchon_defensivo: number
  }
  beneficios: string[]
  riesgos: string[]
  impacto: {
    caja: string
    liquidez: string
    costo_financiero: string
    obras: string
    proveedores: string
    clientes: string
    obligaciones: string
  }
  alternativas_descartadas: {
    clave: string
    nombre: string
    objetivo: string
    diferencia_vs_esta: string
    es_la_elegida: boolean
  }[]
}

export interface ComparacionEstrategias {
  objetivo_cfo: string
  criterio_decisivo: string
  ranking: {
    puesto: number
    clave: string
    nombre: string
    costo_financiero: number
    postergados: number
    saldo_final: number
    linea_maxima: number
    excede_limite: boolean
  }[]
  justificacion: string
}

export interface EstrategiasHorizonte {
  generadas: EstrategiaGenerada[]
  elegida: string
  comparacion: ComparacionEstrategias
}

export interface HorizontePlan {
  titulo: string
  dias: number
  resumen: {
    saldo_proyectado_final: number
    costo_financiero_total: number
    linea_maxima_usada: number
    excede_limite_linea: boolean
  }
  acciones: AccionPlan[]
  // Nueva capa CFO: las estrategias que el motor contrastó antes de derivar el plan de arriba.
  estrategias?: EstrategiasHorizonte
}

export interface PlanTesoreria {
  estado: string
  fecha: string
  caja_inicial: number
  horizontes: Partial<Record<'hoy' | 'dias_7' | 'dias_30' | 'dias_90', HorizontePlan>>
}

export interface CambiosPlan {
  agregadas: { fecha: string; descripcion: string }[]
  eliminadas: { fecha: string; descripcion: string }[]
  reprogramadas: { descripcion: string; de: string; a: string }[]
}

// La fila de public.finanzas_plan_vigente: el plan optimizado y su estado de ejecución.
export interface PlanVigente {
  estado: EstadoPlan
  horizonte: string
  plan: PlanTesoreria
  cambios: CambiosPlan | null
  calculado_en: string
  autorizado_por: string | null
  correlation_id: string | null
}

// El estado real de una acción, leído del Work Fabric (orq_tasks) y cruzado con la acción del plan.
// La Web NO crea tareas: sólo lee las que el Financial Execution Orchestrator ya creó.
export type EstadoTarea =
  | 'received' | 'ready' | 'blocked' | 'claimed' | 'running' | 'reviewing'
  | 'awaiting_approval' | 'paused' | 'succeeded' | 'failed' | 'cancelled' | 'retrying'

export interface SeguimientoTarea {
  title: string
  state: EstadoTarea
  agent_slug: string | null
  error: string | null
  result: unknown
  evidence: unknown
  updated_at: string
}
