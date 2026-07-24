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
