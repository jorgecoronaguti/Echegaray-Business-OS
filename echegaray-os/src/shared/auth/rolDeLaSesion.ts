// EL ROL REAL DE QUIEN LLAMA, leído de `perfiles` con su propia sesión — para las acciones de servidor.
//
// Una acción de servidor se puede invocar desde cualquier pantalla (el id viaja en el JS público), así
// que la puerta del middleware no la protege: cada acción sensible pregunta acá antes de actuar. Se lee
// el rol REAL, no la lente «ver como»: con la lente puesta el middleware ya corta toda escritura.
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Rol } from './identidad.ts'

export async function rolDeLaSesion(supabase: SupabaseClient): Promise<{ id: string; rol: Rol | null } | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase.from('perfiles').select('rol').eq('id', user.id).maybeSingle()
  return { id: user.id, rol: (data?.rol ?? null) as Rol | null }
}
