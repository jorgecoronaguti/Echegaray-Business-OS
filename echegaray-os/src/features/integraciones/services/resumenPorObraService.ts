import type { SupabaseClient } from '@supabase/supabase-js'
import { getHerramientas } from './herramientasService'
import { getPedidosMateriales } from './pedidosMaterialesService'

// Rollup OPERATIVO por obra: cuántas herramientas hay en cada obra y cuántos pedidos de
// material quedan pendientes. Es la capa de datos que la vista por-obra (cartera → obra)
// necesita, y sobrevive a cualquier rediseño de UX porque no depende de la presentación.
// Deriva de datos reales (herramientas.ubicacion_actual + pedidos_materiales.obra_texto) —
// cero tabla nueva, cero dato fabricado. La obra "operativa" es el nombre tal cual lo
// escribe el campo; los depósitos/ubicaciones internas NO son obras.

export interface ResumenObra {
  obra: string
  herramientas: number
  pedidosPendientes: number
  pedidosTotal: number
}

export type ServiceResult<T> = { data: T; error: null } | { data: null; error: string }

// Ubicaciones que NO son una obra (depósito/taller/oficina). Se comparan normalizadas.
const NO_OBRA = new Set(['ALMACEN', 'ALMACÉN', 'TALLER', 'DEPOSITO', 'DEPÓSITO', 'OFICINA', 'STOCK', ''])

function norm(s: string | null | undefined): string {
  return (s ?? '').trim()
}
function clave(s: string): string {
  return s.toUpperCase()
}
function esObra(nombre: string): boolean {
  return nombre !== '' && !NO_OBRA.has(clave(nombre))
}
// Pendiente = tiene estado y no está entregado ni anulado/cancelado.
function esPendiente(estado: string | null): boolean {
  const e = clave(norm(estado))
  if (e === '') return false
  return !e.includes('ENTREG') && !e.includes('CANCEL') && !e.includes('ANULAD')
}

export async function getResumenPorObra(supabase: SupabaseClient): Promise<ServiceResult<ResumenObra[]>> {
  try {
    const [herr, ped] = await Promise.all([getHerramientas(supabase), getPedidosMateriales(supabase)])
    if (herr.error) return { data: null, error: herr.error }
    if (ped.error) return { data: null, error: ped.error }

    // Map por clave normalizada → conserva el primer nombre visto como etiqueta legible.
    const acc = new Map<string, ResumenObra>()
    const upsert = (nombre: string): ResumenObra => {
      const k = clave(nombre)
      let r = acc.get(k)
      if (!r) {
        r = { obra: nombre, herramientas: 0, pedidosPendientes: 0, pedidosTotal: 0 }
        acc.set(k, r)
      }
      return r
    }

    for (const h of herr.data ?? []) {
      const nombre = norm(h.ubicacion_actual)
      if (!esObra(nombre)) continue
      upsert(nombre).herramientas += 1
    }
    for (const p of ped.data ?? []) {
      const nombre = norm(p.obra_texto)
      if (!esObra(nombre)) continue
      const r = upsert(nombre)
      r.pedidosTotal += 1
      if (esPendiente(p.estado)) r.pedidosPendientes += 1
    }

    // Orden "¿cuál miro primero?": más pedidos pendientes arriba, después más herramientas.
    const rows = [...acc.values()].sort(
      (a, b) => b.pedidosPendientes - a.pedidosPendientes || b.herramientas - a.herramientas || a.obra.localeCompare(b.obra),
    )
    return { data: rows, error: null }
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : 'Error desconocido' }
  }
}
