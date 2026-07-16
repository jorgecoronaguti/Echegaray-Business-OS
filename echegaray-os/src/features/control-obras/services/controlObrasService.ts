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

// Un pedido está PENDIENTE si tiene estado y no está entregado ni anulado.
export function pedidoPendiente(estado: string | null): boolean {
  const e = norm(estado)
  return e !== '' && !e.includes('entreg') && !e.includes('cancel') && !e.includes('anulad')
}
