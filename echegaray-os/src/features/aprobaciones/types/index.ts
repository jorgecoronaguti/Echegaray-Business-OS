export type EstadoOperacion = 'awaiting_approval' | 'approved' | 'rejected' | 'executed' | 'failed'

export type PendingOperation = {
  id: string
  task_id: string | null
  agent_slug: string
  capability_slug: string
  account: string
  target: Record<string, unknown>
  payload: Record<string, unknown>
  status: EstadoOperacion
  result: Record<string, unknown> | null
  error: string | null
  decided_note: string | null
  decided_at: string | null
  created_at: string
  updated_at: string
}

export const ESTADO_OP_LABEL: Record<EstadoOperacion, string> = {
  awaiting_approval: 'Esperando aprobación',
  approved: 'Aprobada',
  rejected: 'Rechazada',
  executed: 'Ejecutada',
  failed: 'Falló',
}

export const ESTADO_OP_COLOR: Record<EstadoOperacion, string> = {
  awaiting_approval: 'bg-amber-100 text-amber-800',
  approved: 'bg-blue-100 text-blue-700',
  rejected: 'bg-slate-100 text-slate-600',
  executed: 'bg-emerald-100 text-emerald-700',
  failed: 'bg-red-100 text-red-700',
}
