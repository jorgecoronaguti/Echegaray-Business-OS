'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { esPasoPedido } from '@/shared/lib/estadoPedidoMaterial'
import { HREF_MATERIAL_ESCRITORIO, HREF_MATERIAL_TELEFONO, URGENCIAS, normalizarItems } from '../logica/pedidos'

// MATERIAL — las dos escrituras, y ninguna regla propia.
//
// La REGLA vive en la base: `pedir_material` valida la obra, que quien pide la vea, la urgencia y cada
// ítem; `cambiar_estado_pedido_material` exige Administración y un paso del circuito. Acá se valida
// la FORMA (Zod sobre lo que llega del formulario) y se revalidan las dos caras, que la base no
// conoce. Una segunda implementación «para el teléfono» sería una segunda definición de qué es un
// pedido, y la del teléfono es justo la que nadie audita.

export type EstadoForm = { error: string | null; ok?: boolean; mensaje?: string | null }

const pedidoSchema = z.object({
  obra_id: z.string().trim().min(1, 'Elegí la obra'),
  urgencia: z.enum(URGENCIAS.map((u) => u.id) as [string, ...string[]], { message: 'Elegí la urgencia' }),
  nota: z.string().trim().max(500, 'La nota es demasiado larga').optional(),
})

const textos = (form: FormData, clave: string) => form.getAll(clave).map((v) => (typeof v === 'string' ? v : ''))

function revalidar() {
  revalidatePath(HREF_MATERIAL_ESCRITORIO)
  revalidatePath(HREF_MATERIAL_TELEFONO)
  revalidatePath('/campo')
}

export async function pedirMaterialAction(_prev: EstadoForm, form: FormData): Promise<EstadoForm> {
  const parsed = pedidoSchema.safeParse({
    obra_id: form.get('obra_id'),
    urgencia: form.get('urgencia'),
    nota: form.get('nota') || undefined,
  })
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const items = normalizarItems(textos(form, 'material'), textos(form, 'cantidad'), textos(form, 'unidad'))
  if (!items.ok) return { error: items.error }

  try {
    const supabase = await createClient()
    const { error } = await supabase.rpc('pedir_material', {
      p_obra: parsed.data.obra_id,
      p_items: items.items,
      p_urgencia: parsed.data.urgencia,
      p_nota: parsed.data.nota ?? null,
    })
    if (error) return { error: error.message }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Error al conectar con Supabase' }
  }
  revalidar()
  const n = items.items.length
  return { error: null, ok: true, mensaje: n === 1 ? 'Pedido cargado: 1 material.' : `Pedido cargado: ${n} materiales.` }
}

const estadoSchema = z.object({
  id_pedido: z.string().trim().min(1),
  estado: z.string().trim().toUpperCase().refine(esPasoPedido, 'El estado es pedido, visto, comprado o entregado'),
})

/** Cambia el estado de UN ítem. Lo llama el selector de la fila, en escritorio. */
export async function cambiarEstadoPedido(idPedido: string, estado: string): Promise<EstadoForm> {
  const parsed = estadoSchema.safeParse({ id_pedido: idPedido, estado })
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  try {
    const supabase = await createClient()
    const { error } = await supabase.rpc('cambiar_estado_pedido_material', {
      p_id_pedido: parsed.data.id_pedido,
      p_estado: parsed.data.estado,
    })
    if (error) return { error: error.message }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Error al conectar con Supabase' }
  }
  revalidar()
  return { error: null, ok: true }
}

const borrarSchema = z.array(z.string().trim().min(1)).min(1, 'No se dijo qué pedido borrar')

/** Borra uno o varios ítems (borrado lógico: `borrar_pedido_material`). Lo llama «Borrar» en las dos caras. */
export async function borrarPedidos(ids: string[]): Promise<EstadoForm> {
  const parsed = borrarSchema.safeParse(ids)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  try {
    const supabase = await createClient()
    const { error } = await supabase.rpc('borrar_pedido_material', { p_ids: parsed.data })
    if (error) return { error: error.message }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Error al conectar con Supabase' }
  }
  revalidar()
  return { error: null, ok: true }
}
