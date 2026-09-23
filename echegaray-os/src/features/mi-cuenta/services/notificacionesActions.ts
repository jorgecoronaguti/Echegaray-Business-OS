'use server'

// GUARDAR UNA PREFERENCIA DE AVISO — la propia, con la sesión: la policy sólo deja escribir filas
// con el uid de quien llama, así que el `usuario_id` sale de la sesión y no del formulario.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { esCanal, esTipo } from './notificaciones'

export type Resultado = { ok: true; id?: string } | { ok: false; error: string }

export async function guardarPreferencia(tipo: string, canal: string, activo: boolean): Promise<Resultado> {
  if (!esTipo(tipo) || !esCanal(canal)) return { ok: false, error: 'Ese aviso no existe.' }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Tu sesión venció. Volvé a entrar.' }

  const { error } = await supabase.from('usuario_preferencia_notificacion').upsert(
    { usuario_id: user.id, tipo, canal, activo, actualizado_en: new Date().toISOString() },
    { onConflict: 'usuario_id,tipo,canal' },
  )
  if (error) {
    if (error.code === '42P01') return { ok: false, error: 'La base todavía no tiene dónde guardar esto (falta la migración 20260923T2610).' }
    return { ok: false, error: error.message }
  }
  revalidatePath('/mi-cuenta/notificaciones')
  return { ok: true }
}
