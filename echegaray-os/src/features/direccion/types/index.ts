// Tipos del Centro de Dirección (Director IA). Reflejan la vista public.orq_direction
// y el contenido del informe ejecutivo (task.result) — no redefinen estado.

export interface DireccionObjetivo {
  id: string
  title: string
  goal: string | null
  state: string
  priority: number
  engine: string | null
  result: DirectorResult | null
  evidence: { situation?: SituationSnapshot; digest?: string } | null
  error: string | null
  created_at: string
  updated_at: string
  subtasks: number
  subtasks_done: number
  subtasks_failed: number
}

export interface DirectorResult {
  executive_summary?: string
  priorities?: { titulo: string; razon?: string }[]
  assigned?: { key: string; capability: string; agent: string | null }[]
  recommendations?: string[]
  approval_requests?: { titulo: string; motivo?: string; capability_slug?: string }[]
  cost?: { usd?: number | null }
  session_id?: string | null
}

export interface SituationSnapshot {
  generated_at?: string
  negocio?: Record<string, unknown>
  sistema?: Record<string, unknown>
}

export const ESTADO_OBJETIVO_LABEL: Record<string, string> = {
  received: 'Recibido', ready: 'En cola', claimed: 'Procesando', running: 'Dirigiendo',
  reviewing: 'Revisando', succeeded: 'Dirigido', failed: 'Falló', retrying: 'Reintentando',
  dead_letter: 'Bloqueado', cancelled: 'Cancelado', paused: 'Pausado',
}

export const ESTADO_OBJETIVO_COLOR: Record<string, string> = {
  succeeded: 'bg-emerald-100 text-emerald-700', running: 'bg-indigo-100 text-indigo-700',
  claimed: 'bg-indigo-100 text-indigo-700', ready: 'bg-blue-100 text-blue-700',
  reviewing: 'bg-violet-100 text-violet-700', failed: 'bg-orange-100 text-orange-700',
  dead_letter: 'bg-red-100 text-red-700', retrying: 'bg-amber-100 text-amber-700',
  cancelled: 'bg-slate-200 text-slate-600', paused: 'bg-yellow-100 text-yellow-800',
  received: 'bg-slate-100 text-slate-700',
}
