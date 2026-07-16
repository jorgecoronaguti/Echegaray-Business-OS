import type { SupabaseClient } from '@supabase/supabase-js'
import { getHerramientas, type Herramienta } from '@/features/integraciones/services/herramientasService'
import { getPedidosMateriales, type PedidoMaterial } from '@/features/integraciones/services/pedidosMaterialesService'
import { getMovimientos, type MovimientoConHerramienta } from '@/features/integraciones/services/movimientosService'

// Detalle OPERATIVO de UNA obra: sus herramientas, pedidos y movimientos. Reusa los servicios
// existentes de integraciones y filtra por el NOMBRE de la obra (la obra operativa vive como
// texto en esas 3 tablas, no hay tabla canónica). Cero SQL nuevo, cero dato fabricado. Es el
// contenido de la vista por-obra (cartera → obra) del control de obras.

export interface ObraDetalle {
  obra: string
  herramientas: Herramienta[]
  pedidos: PedidoMaterial[]
  movimientos: MovimientoConHerramienta[]
}

export interface AvanceActividad {
  codigo: string | null
  actividad: string
  pct: number
  estado: string | null
}

export interface AvanceObra {
  obra: string
  estructurado: boolean
  motivo: string | null
  actividades: number
  completadas: number
  avance_promedio: number | null
  detalle: AvanceActividad[]
  sincronizado_en: string | null
}

export type ServiceResult<T> = { data: T; error: null } | { data: null; error: string }

const norm = (s: string | null | undefined): string => (s ?? '').trim().toLowerCase()

export async function getObraDetalle(supabase: SupabaseClient, nombre: string): Promise<ServiceResult<ObraDetalle>> {
  try {
    const key = norm(nombre)
    const [h, p, m] = await Promise.all([
      getHerramientas(supabase),
      getPedidosMateriales(supabase),
      getMovimientos(supabase),
    ])
    if (h.error) return { data: null, error: h.error }
    if (p.error) return { data: null, error: p.error }
    if (m.error) return { data: null, error: m.error }

    return {
      data: {
        obra: nombre,
        herramientas: (h.data ?? []).filter((x) => norm(x.ubicacion_actual) === key),
        pedidos: (p.data ?? []).filter((x) => norm(x.obra_texto) === key),
        movimientos: (m.data ?? []).filter((x) => norm(x.destino) === key),
      },
      error: null,
    }
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : 'Error desconocido' }
  }
}

// Avance físico de TODAS las obras (para la cartera). Lee public.avance_obra (espejo del
// tracker de Drive, sincronizado por el VM). Devuelve un mapa por nombre normalizado.
export async function getAvanceMap(supabase: SupabaseClient): Promise<Map<string, AvanceObra>> {
  const map = new Map<string, AvanceObra>()
  const { data, error } = await supabase
    .from('avance_obra')
    .select('obra, estructurado, motivo, actividades, completadas, avance_promedio, detalle, sincronizado_en')
  if (error || !data) return map
  for (const r of data as AvanceObra[]) map.set(norm(r.obra), { ...r, detalle: r.detalle ?? [] })
  return map
}

// Avance físico de UNA obra. Match por nombre normalizado; si no hay exacto, prueba por
// inclusión (los nombres del tracker no siempre son idénticos a los operativos). null si no hay.
export async function getAvanceObra(supabase: SupabaseClient, nombre: string): Promise<AvanceObra | null> {
  const map = await getAvanceMap(supabase)
  const key = norm(nombre)
  const exacto = map.get(key)
  if (exacto) return exacto
  for (const [k, v] of map) if (k.includes(key) || key.includes(k)) return v
  return null
}

// Un pedido está PENDIENTE si tiene estado y no está entregado ni anulado.
export function pedidoPendiente(estado: string | null): boolean {
  const e = norm(estado)
  return e !== '' && !e.includes('entreg') && !e.includes('cancel') && !e.includes('anulad')
}
