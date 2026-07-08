import type { SupabaseClient } from '@supabase/supabase-js'
import type { Perfil } from '@/features/auth/types'

export type ServiceResult<T> = { data: T; error: null } | { data: null; error: string }

export async function getUsuarioActual(supabase: SupabaseClient) {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user
}

export async function getPerfilActual(supabase: SupabaseClient): Promise<ServiceResult<Perfil | null>> {
  const user = await getUsuarioActual(supabase)
  if (!user) return { data: null, error: null }
  const { data, error } = await supabase.from('perfiles').select('*').eq('id', user.id).maybeSingle()
  if (error) return { data: null, error: error.message }
  return { data: data as Perfil | null, error: null }
}
