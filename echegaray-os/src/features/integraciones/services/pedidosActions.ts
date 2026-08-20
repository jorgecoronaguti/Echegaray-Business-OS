'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { asignarActividadAPedido } from '@/features/obras/services/actionsEjecucion'

// Módulo NATIVO de Pedidos de Materiales (control desde la web, no desde el chat). Supabase
// es la fuente de verdad de lo que se crea/edita acá. Los pedidos nativos usan id_pedido
// 'OS-<ts>' y origen='os' para no colisionar con los IDs numéricos del AppSheet legacy ni
// ser pisados por el sync del Sheet.

const PATH = '/integraciones/pedidos-materiales'

export type ActionState = { error: string | null; ok?: boolean }

const pedidoSchema = z.object({
  obra_texto: z.string().trim().min(1, 'La obra es obligatoria').max(60),
  material: z.string().trim().min(1, 'El material es obligatorio').max(120),
  cantidad: z.coerce.number().positive('La cantidad debe ser mayor a 0'),
  estado: z.enum(['PENDIENTE', 'PEDIDO', 'ENTREGADO']).default('PENDIENTE'),
  fecha: z.string().trim().optional(),
})

async function client() {
  try {
    return { supabase: await createClient(), error: null as string | null }
  } catch (err) {
    return { supabase: null, error: err instanceof Error ? err.message : 'Error al conectar con Supabase' }
  }
}

export async function createPedidoAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = pedidoSchema.safeParse({
    obra_texto: formData.get('obra_texto'),
    material: formData.get('material'),
    cantidad: formData.get('cantidad'),
    estado: formData.get('estado') || undefined,
    fecha: formData.get('fecha') || undefined,
  })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const c = await client()
  if (!c.supabase) return { error: c.error! }

  const idPedido = `OS-${Date.now()}`
  const { error } = await c.supabase.from('pedidos_materiales').insert({
    id_pedido: idPedido,
    obra_texto: parsed.data.obra_texto,
    material: parsed.data.material,
    cantidad: parsed.data.cantidad,
    estado: parsed.data.estado,
    fecha: parsed.data.fecha || new Date().toISOString().slice(0, 10),
    origen: 'os',
  })
  if (error) return { error: error.message }
  revalidatePath(PATH)
  return { error: null, ok: true }
}

export async function setEstadoPedidoAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = String(formData.get('id_pedido') || '').trim()
  const estado = String(formData.get('estado') || '').trim().toUpperCase()
  if (!id || !['PENDIENTE', 'PEDIDO', 'ENTREGADO'].includes(estado)) return { error: 'estado inválido' }

  const c = await client()
  if (!c.supabase) return { error: c.error! }
  // Al editar en el OS, marcamos origen='os' para que el sync del Sheet no lo pise.
  const { error } = await c.supabase
    .from('pedidos_materiales')
    .update({ estado, origen: 'os', updated_at: new Date().toISOString() })
    .eq('id_pedido', id)
  if (error) return { error: error.message }
  revalidatePath(PATH)
  return { error: null, ok: true }
}

const editSchema = z.object({
  id_pedido: z.string().trim().min(1),
  obra_texto: z.string().trim().min(1, 'La obra es obligatoria').max(60),
  material: z.string().trim().min(1, 'El material es obligatorio').max(120),
  cantidad: z.coerce.number().positive('La cantidad debe ser mayor a 0'),
})

export async function updatePedidoAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = editSchema.safeParse({
    id_pedido: formData.get('id_pedido'),
    obra_texto: formData.get('obra_texto'),
    material: formData.get('material'),
    cantidad: formData.get('cantidad'),
  })
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const c = await client()
  if (!c.supabase) return { error: c.error! }
  const { error } = await c.supabase
    .from('pedidos_materiales')
    .update({
      obra_texto: parsed.data.obra_texto,
      material: parsed.data.material,
      cantidad: parsed.data.cantidad,
      origen: 'os',
      updated_at: new Date().toISOString(),
    })
    .eq('id_pedido', parsed.data.id_pedido)
  if (error) return { error: error.message }
  revalidatePath(PATH)
  return { error: null, ok: true }
}

export async function deletePedidoAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = String(formData.get('id_pedido') || '').trim()
  if (!id) return { error: 'falta id' }
  const c = await client()
  if (!c.supabase) return { error: c.error! }
  const { error } = await c.supabase.from('pedidos_materiales').delete().eq('id_pedido', id)
  if (error) return { error: error.message }
  revalidatePath(PATH)
  return { error: null, ok: true }
}

// ═══ PARA QUÉ ACTIVIDAD ES EL PEDIDO, DESDE LA LISTA GLOBAL ═══
//
// La REGLA no se reescribe acá: la escribe `asignarActividadAPedido`, que además verifica que la
// actividad sea de esa obra (sin ese chequeo, un id de otra obra colgaría el pedido de un trabajo
// que nadie de acá puede ver). Esta acción sólo agrega lo que esa no puede saber: que hay que
// revalidar la lista global, no la ficha de la obra.
const asignarSchema = z.object({
  id_pedido: z.string().trim().min(1),
  obra_id: z.string().trim().min(1),
  // Vacío = DESASIGNAR, que es una decisión válida: alguien lo colgó de la actividad equivocada.
  actividad_id: z.union([z.string().uuid(), z.literal('')]),
})

export async function asignarActividadPedidoAction(
  idPedido: string,
  obraId: string,
  actividadId: string,
): Promise<ActionState> {
  const parsed = asignarSchema.safeParse({ id_pedido: idPedido, obra_id: obraId, actividad_id: actividadId })
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const r = await asignarActividadAPedido(parsed.data.obra_id, parsed.data.id_pedido, parsed.data.actividad_id)
  if (!r.ok) return { error: r.error }
  revalidatePath(PATH)
  return { error: null, ok: true }
}
