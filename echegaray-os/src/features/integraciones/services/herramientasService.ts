import type { SupabaseClient } from '@supabase/supabase-js'

export type EstadoHerramienta = 'disponible' | 'en_uso' | 'en_reparacion' | 'fuera_servicio' | 'perdida'

export const ESTADOS: { value: EstadoHerramienta; label: string; tone: 'ok' | 'info' | 'amber' | 'red' }[] = [
  { value: 'disponible', label: 'Disponible', tone: 'ok' },
  { value: 'en_uso', label: 'En uso', tone: 'info' },
  { value: 'en_reparacion', label: 'En reparación', tone: 'amber' },
  { value: 'fuera_servicio', label: 'Fuera de servicio', tone: 'red' },
  { value: 'perdida', label: 'Perdida', tone: 'red' },
]

export function estadoInfo(estado: string | null): { value: EstadoHerramienta; label: string; tone: 'ok' | 'info' | 'amber' | 'red' } {
  return ESTADOS.find((e) => e.value === estado) ?? ESTADOS[0]
}

export interface Herramienta {
  id_herramienta: string
  nombre: string
  ubicacion_actual: string | null
  imagen_url: string | null
  fecha: string | null
  origen: string | null
  estado: EstadoHerramienta
  categoria: string | null
  estado_nota: string | null
  responsable_actual: string | null // derivado del último movimiento
}

export type ServiceResult<T> = { data: T; error: null } | { data: null; error: string }

export async function getHerramientas(supabase: SupabaseClient): Promise<ServiceResult<Herramienta[]>> {
  try {
    const { data, error } = await supabase
      .from('herramientas')
      .select('id_herramienta, nombre, ubicacion_actual, imagen_url, fecha, origen, estado, categoria, estado_nota')
      .order('nombre', { ascending: true })
    if (error) return { data: null, error: error.message }

    // Responsable ACTUAL de cada herramienta = responsable del último movimiento hacia su
    // ubicación actual. Una sola query, se resuelve en memoria (evita N+1).
    const { data: movs } = await supabase
      .from('movimientos_herramienta')
      .select('id_herramienta, responsable, fecha')
      .order('fecha', { ascending: false })
    const ultimoResp = new Map<string, string>()
    for (const m of (movs ?? []) as { id_herramienta: string; responsable: string | null; fecha: string | null }[]) {
      if (m.responsable && !ultimoResp.has(m.id_herramienta)) ultimoResp.set(m.id_herramienta, m.responsable)
    }

    const herramientas = (data ?? []).map((h) => ({
      ...h,
      estado: (h.estado ?? 'disponible') as EstadoHerramienta,
      responsable_actual: ultimoResp.get(h.id_herramienta) ?? null,
    })) as Herramienta[]
    return { data: herramientas, error: null }
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : 'Error desconocido' }
  }
}
