import type { SupabaseClient } from '@supabase/supabase-js'

export interface PedidoMaterial {
  id_pedido: string
  obra_texto: string | null
  obra_id: string | null
  fecha: string | null
  material: string | null
  cantidad: number | null
  estado: string | null
  sincronizado_en: string
}

export type ServiceResult<T> = { data: T; error: null } | { data: null; error: string }

export async function getPedidosMateriales(supabase: SupabaseClient): Promise<ServiceResult<PedidoMaterial[]>> {
  try {
    const { data, error } = await supabase
      .from('pedidos_materiales')
      .select('id_pedido, obra_texto, obra_id, fecha, material, cantidad, estado, sincronizado_en')
      .order('fecha', { ascending: false, nullsFirst: false })
    if (error) return { data: null, error: error.message }
    return { data: (data ?? []) as PedidoMaterial[], error: null }
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : 'Error desconocido' }
  }
}
