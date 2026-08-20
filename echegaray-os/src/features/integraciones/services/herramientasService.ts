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

export interface MovimientoDeResponsable {
  id_herramienta: string
  responsable: string | null
  fecha: string | null
}

/**
 * EL RESPONSABLE ES DERIVADO, NO UN CAMPO PROPIO: es quien figura en el ÚLTIMO movimiento de la
 * herramienta. Guardarlo en `herramientas` sería una segunda versión del mismo dato, que el día que
 * alguien registre un traslado sin actualizarla queda mintiendo.
 *
 * Se elige por FECHA acá adentro y no se confía en el orden de la consulta: PostgREST devuelve los
 * `null` según cómo se pidió el `order`, y una fila sin fecha ganándole a una de ayer publicaría un
 * responsable que ya no tiene la herramienta. Un movimiento sin responsable no reemplaza al
 * anterior — no dice quién la tiene, dice que nadie lo anotó.
 */
export function ultimoResponsable(movs: MovimientoDeResponsable[]): Map<string, string> {
  const mejor = new Map<string, { fecha: string; responsable: string }>()
  for (const m of movs ?? []) {
    if (!m?.responsable || !m.id_herramienta) continue
    const fecha = m.fecha ?? ''
    const previo = mejor.get(m.id_herramienta)
    if (!previo || fecha > previo.fecha) mejor.set(m.id_herramienta, { fecha, responsable: m.responsable })
  }
  return new Map([...mejor].map(([id, v]) => [id, v.responsable]))
}

export async function getHerramientas(supabase: SupabaseClient): Promise<ServiceResult<Herramienta[]>> {
  try {
    const { data, error } = await supabase
      .from('herramientas')
      .select('id_herramienta, nombre, ubicacion_actual, imagen_url, fecha, origen, estado, categoria, estado_nota')
      .order('nombre', { ascending: true })
    if (error) return { data: null, error: error.message }

    // Responsable ACTUAL de cada herramienta = responsable de su último movimiento. Una sola query,
    // se resuelve en memoria (evita N+1); quién gana lo decide `ultimoResponsable`, que es puro.
    const { data: movs } = await supabase
      .from('movimientos_herramienta')
      .select('id_herramienta, responsable, fecha')
      .order('fecha', { ascending: false })
    const ultimoResp = ultimoResponsable((movs ?? []) as MovimientoDeResponsable[])

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
