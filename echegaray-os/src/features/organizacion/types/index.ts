// Tipos de la Organización IA (Etapa 4). Reflejan la vista read-only public.orq_org
// y el resultado estructurado de los especialistas (task.result) — no redefinen estado.

export interface OrgSpecialist {
  slug: string
  org_title: string
  org_order: number
  role: string
  clearance: string
  default_model: string
  context_ref: string | null
  enabled: boolean
  estado: 'trabajando' | 'disponible'
  tareas: number
  exitos: number
  fallos: number
  en_curso: number
  retries: number
  costo_usd: number
  tokens: number
  duracion_prom_s: number | null
  ultima_actividad: string | null
}

export interface SpecialistFinding {
  titulo: string
  detalle?: string
  severidad?: 'info' | 'baja' | 'media' | 'alta'
}

export interface SpecialistResult {
  agent?: string
  org_title?: string | null
  capability?: string
  analysis?: string
  findings?: SpecialistFinding[]
  recommendations?: string[]
  approval_requests?: { titulo: string; motivo?: string; capability_slug?: string }[]
  confidence?: 'alta' | 'media' | 'baja'
  cost?: { usd?: number | null }
}

export const CONFIANZA_COLOR: Record<string, string> = {
  alta: 'bg-emerald-100 text-emerald-700',
  media: 'bg-amber-100 text-amber-800',
  baja: 'bg-orange-100 text-orange-700',
}

export const SEVERIDAD_COLOR: Record<string, string> = {
  alta: 'bg-red-100 text-red-700',
  media: 'bg-amber-100 text-amber-800',
  baja: 'bg-blue-100 text-blue-700',
  info: 'bg-slate-100 text-slate-600',
}
