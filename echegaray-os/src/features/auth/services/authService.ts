import type { SupabaseClient } from '@supabase/supabase-js'
import type { Perfil } from '@/features/auth/types'

export type ServiceResult<T> = { data: T; error: null } | { data: null; error: string }

export async function getUsuarioActual(supabase: SupabaseClient) {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user
}

/**
 * EL PERFIL DEL USUARIO DE LA SESIÓN.
 *
 * `userId` es opcional y existe por una razón medible: quien ya llamó a `getUsuarioActual()` tiene
 * el id en la mano, y sin este parámetro esta función volvía a pedírselo a Supabase. En el layout de
 * `(main)` eso era un viaje de red entero —de la función en iad1 a Supabase en São Paulo— repetido
 * en CADA pantalla del OS para averiguar algo que el llamador acababa de averiguar.
 *
 * Sin `userId` se comporta exactamente como antes: nadie tiene que cambiar para seguir funcionando.
 */
export async function getPerfilActual(supabase: SupabaseClient, userId?: string): Promise<ServiceResult<Perfil | null>> {
  const id = userId ?? (await getUsuarioActual(supabase))?.id
  if (!id) return { data: null, error: null }
  const { data, error } = await supabase.from('perfiles').select('*').eq('id', id).maybeSingle()
  if (error) return { data: null, error: error.message }
  return { data: data as Perfil | null, error: null }
}
