'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

// Módulo NATIVO de Herramientas (control desde la web). Incluye SUBIR FOTO a Supabase
// Storage (bucket 'herramientas') — lo que AppSheet no resolvía fácil. Supabase es fuente
// de verdad de lo editado acá (origen='os'); imagen_url es propia del OS y el sync no la toca.

const PATH = '/integraciones/herramientas'
export type ActionState = { error: string | null; ok?: boolean }

async function client() {
  try {
    return { supabase: await createClient(), error: null as string | null }
  } catch (err) {
    return { supabase: null, error: err instanceof Error ? err.message : 'Error al conectar con Supabase' }
  }
}

const ubicacionSchema = z.object({
  id_herramienta: z.string().trim().min(1),
  ubicacion_actual: z.string().trim().min(1, 'La ubicación es obligatoria').max(60),
})

export async function setUbicacionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = ubicacionSchema.safeParse({
    id_herramienta: formData.get('id_herramienta'),
    ubicacion_actual: formData.get('ubicacion_actual'),
  })
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const c = await client()
  if (!c.supabase) return { error: c.error! }
  const { error } = await c.supabase
    .from('herramientas')
    .update({ ubicacion_actual: parsed.data.ubicacion_actual, origen: 'os', updated_at: new Date().toISOString() })
    .eq('id_herramienta', parsed.data.id_herramienta)
  if (error) return { error: error.message }
  revalidatePath(PATH)
  return { error: null, ok: true }
}

export async function uploadFotoAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = String(formData.get('id_herramienta') || '').trim()
  const file = formData.get('foto')
  if (!id) return { error: 'falta id' }
  if (!(file instanceof File) || file.size === 0) return { error: 'elegí una foto' }
  if (file.size > 6 * 1024 * 1024) return { error: 'la foto supera 6MB' }
  if (!/^image\//.test(file.type)) return { error: 'el archivo debe ser una imagen' }

  const c = await client()
  if (!c.supabase) return { error: c.error! }

  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
  const path = `${id}/${Date.now()}.${ext}`
  const { error: upErr } = await c.supabase.storage
    .from('herramientas')
    .upload(path, file, { contentType: file.type, upsert: true })
  if (upErr) return { error: `no se pudo subir: ${upErr.message}` }

  const { data: pub } = c.supabase.storage.from('herramientas').getPublicUrl(path)
  const { error } = await c.supabase
    .from('herramientas')
    .update({ imagen_url: pub.publicUrl, origen: 'os', updated_at: new Date().toISOString() })
    .eq('id_herramienta', id)
  if (error) return { error: error.message }
  revalidatePath(PATH)
  return { error: null, ok: true }
}

const altaSchema = z.object({
  nombre: z.string().trim().min(1, 'El nombre es obligatorio').max(80),
  ubicacion_actual: z.string().trim().max(60).optional(),
})

export async function createHerramientaAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = altaSchema.safeParse({
    nombre: formData.get('nombre'),
    ubicacion_actual: formData.get('ubicacion_actual') || undefined,
  })
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const c = await client()
  if (!c.supabase) return { error: c.error! }
  const { error } = await c.supabase.from('herramientas').insert({
    id_herramienta: `OS-${Date.now()}`,
    nombre: parsed.data.nombre,
    ubicacion_actual: parsed.data.ubicacion_actual || 'ALMACEN',
    fecha: new Date().toISOString(),
    origen: 'os',
  })
  if (error) return { error: error.message }
  revalidatePath(PATH)
  return { error: null, ok: true }
}

export async function deleteHerramientaAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = String(formData.get('id_herramienta') || '').trim()
  if (!id) return { error: 'falta id' }
  const c = await client()
  if (!c.supabase) return { error: c.error! }
  const { error } = await c.supabase.from('herramientas').delete().eq('id_herramienta', id)
  if (error) return { error: error.message }
  revalidatePath(PATH)
  return { error: null, ok: true }
}
