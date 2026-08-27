'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

// CONTROL DE OBRAS Fase 3 — atribución HUMANA de un comprobante de ARCA a una obra. No se
// fabrica: el dueño (o quien tenga acceso) asigna; queda registrado quién y cuándo. Desasignar
// vuelve el comprobante a "sin asignar".

export type ActionState = { error: string | null; ok?: boolean }

const asignarSchema = z.object({
  id: z.string().trim().min(1, 'falta el comprobante'),
  obra_texto: z.string().trim().min(1, 'La obra es obligatoria').max(80),
})

async function client() {
  try {
    return { supabase: await createClient(), error: null as string | null }
  } catch (err) {
    return { supabase: null, error: err instanceof Error ? err.message : 'Error al conectar con Supabase' }
  }
}

export async function asignarComprobanteObraAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = asignarSchema.safeParse({
    id: formData.get('id'),
    obra_texto: formData.get('obra_texto'),
  })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const c = await client()
  if (!c.supabase) return { error: c.error! }

  const { data: user } = await c.supabase.auth.getUser()
  const por = user?.user?.email || 'os'
  const { error } = await c.supabase
    .from('comprobantes_arca')
    .update({ obra_texto: parsed.data.obra_texto, obra_asignada_por: por, obra_asignada_en: new Date().toISOString() })
    .eq('id', parsed.data.id)
  if (error) return { error: error.message }
  // LA PANTALLA QUE MUESTRA ESTO ES `/administracion/compras` (27/08/2026). `/control-obras/costos`
  // —donde la asignación vivía escondida— y `/control-obras/<obra>` se retiraron; revalidar una
  // ruta que no existe no falla, y ése es el problema: la asignación se guardaba y la pantalla que
  // sí la muestra seguía sirviendo la versión anterior.
  revalidatePath('/administracion/compras')
  return { error: null, ok: true }
}

export async function desasignarComprobanteObraAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = String(formData.get('id') || '').trim()
  if (!id) return { error: 'falta el comprobante' }

  const c = await client()
  if (!c.supabase) return { error: c.error! }
  const { error } = await c.supabase
    .from('comprobantes_arca')
    .update({ obra_texto: null, obra_asignada_por: null, obra_asignada_en: null })
    .eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/administracion/compras')
  return { error: null, ok: true }
}
