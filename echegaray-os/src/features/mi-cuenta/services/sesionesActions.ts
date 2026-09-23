'use server'

// CERRAR SESIONES — de a una, las demás, o todas.
//
// Las dos primeras llaman a las funciones de la base (`cerrar_mi_sesion`, `cerrar_mis_otras_sesiones`,
// migración 20260923T2620), que borran filas de `auth.sessions` acotadas a `auth.uid()`: no hay forma
// de cerrar la de otro. «Todas» es `signOut({ scope: 'global' })`, la de siempre, e incluye ésta.
//
// EL LÍMITE, dicho también acá: una sesión cerrada no puede renovarse más, pero su access token ya
// emitido vale hasta que venza (una hora como mucho).

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export type Resultado = { ok: true; id?: string; cerradas?: number } | { ok: false; error: string }

const sinMigracion = (code?: string) => code === '42883' || code === 'PGRST202'

export async function cerrarSesion(id: string): Promise<Resultado> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, error: 'Esa sesión no existe.' }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('cerrar_mi_sesion', { p_id: id })
  if (error) return { ok: false, error: sinMigracion(error.code) ? 'Falta aplicar la migración 20260923T2620.' : error.message }
  if (!data) return { ok: false, error: 'Esa sesión ya no estaba abierta.' }
  revalidatePath('/mi-cuenta/sesiones')
  return { ok: true, cerradas: Number(data) }
}

export async function cerrarOtrasSesiones(): Promise<Resultado> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('cerrar_mis_otras_sesiones')
  if (error) return { ok: false, error: sinMigracion(error.code) ? 'Falta aplicar la migración 20260923T2620.' : error.message }
  revalidatePath('/mi-cuenta/sesiones')
  return { ok: true, cerradas: Number(data ?? 0) }
}
