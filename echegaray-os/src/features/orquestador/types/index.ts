// Tipos del Work Fabric (orquestador autónomo) para la UI. Reflejan las vistas
// read-only public.orq_* — NO redefinen el estado, sólo lo tipan para la pantalla.

export type OrqTaskState =
  | 'received' | 'planned' | 'ready' | 'claimed' | 'running' | 'reviewing'
  | 'awaiting_approval' | 'approved' | 'succeeded' | 'failed' | 'retrying'
  | 'dead_letter' | 'cancelled' | 'paused' | 'compensating' | 'rejected'

export interface OrqTask {
  id: string
  type: string
  title: string
  state: OrqTaskState
  priority: number
  attempt: number
  max_attempts: number
  capability_slug: string | null
  agent_slug: string | null
  engine: string | null
  parent_task_id: string | null
  correlation_id: string | null
  locked_by: string | null
  lease_expires_at: string | null
  error: string | null
  result: Record<string, unknown> | null
  evidence: Record<string, unknown> | null
  cost: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

export interface OrqAttempt {
  id: string
  task_id: string
  attempt_no: number
  state: string
  worker_id: string | null
  engine: string | null
  session_id: string | null
  error: string | null
  started_at: string | null
  finished_at: string | null
}

export interface OrqEvent {
  id: number
  subject_type: string
  subject_id: string | null
  type: string
  correlation_id: string | null
  payload: Record<string, unknown> | null
  created_at: string
}

export interface OrqAgent {
  slug: string
  role: string
  clearance: string
  default_model: string
  max_cost_usd_per_task: number
  max_concurrent: number
  enabled: boolean
}

export interface OrqQueueRow {
  state: OrqTaskState
  is_terminal: boolean
  is_active: boolean
  n: number
}

export type HumanAction = 'retry' | 'cancel' | 'pause' | 'resume' | 'approve' | 'reject'

export const ESTADO_LABEL: Record<OrqTaskState, string> = {
  received: 'Recibida', planned: 'Planificada', ready: 'Lista', claimed: 'Tomada',
  running: 'Ejecutando', reviewing: 'En revisión', awaiting_approval: 'Espera aprobación',
  approved: 'Aprobada', succeeded: 'Completada', failed: 'Falló', retrying: 'Reintentando',
  dead_letter: 'Dead-letter', cancelled: 'Cancelada', paused: 'Pausada',
  compensating: 'Compensando', rejected: 'Rechazada',
}

// color por estado (Tailwind) para chips
export const ESTADO_COLOR: Record<OrqTaskState, string> = {
  received: 'bg-slate-100 text-slate-700', planned: 'bg-slate-100 text-slate-700',
  ready: 'bg-blue-100 text-blue-700', claimed: 'bg-indigo-100 text-indigo-700',
  running: 'bg-indigo-100 text-indigo-700', reviewing: 'bg-violet-100 text-violet-700',
  awaiting_approval: 'bg-amber-100 text-amber-800', approved: 'bg-teal-100 text-teal-700',
  succeeded: 'bg-emerald-100 text-emerald-700', failed: 'bg-orange-100 text-orange-700',
  retrying: 'bg-amber-100 text-amber-700', dead_letter: 'bg-red-100 text-red-700',
  cancelled: 'bg-slate-200 text-slate-600', paused: 'bg-yellow-100 text-yellow-800',
  compensating: 'bg-violet-100 text-violet-700', rejected: 'bg-red-100 text-red-600',
}

/** Acciones humanas válidas ofrecidas por estado (coincide con el state machine). */
export function accionesDisponibles(state: OrqTaskState): HumanAction[] {
  switch (state) {
    case 'dead_letter': return ['retry', 'cancel']
    case 'failed': return ['cancel']
    case 'retrying': return ['pause', 'cancel']
    case 'ready': return ['pause', 'cancel']
    case 'paused': return ['resume', 'cancel']
    case 'awaiting_approval': return ['approve', 'reject', 'cancel']
    case 'cancelled': return ['retry']
    default: return []
  }
}

export const ACCION_LABEL: Record<HumanAction, string> = {
  retry: 'Reintentar', cancel: 'Cancelar', pause: 'Pausar',
  resume: 'Reanudar', approve: 'Aprobar', reject: 'Rechazar',
}
