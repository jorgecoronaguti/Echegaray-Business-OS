// id de usuario → nombre para mostrar, leído de la base por el vínculo usuario → persona.
//
// Reemplaza a las ~20 lecturas sueltas de `perfiles.select('id, nombre')` que cada servicio hacía
// para poner «quién» al lado de un movimiento, una tarea o una corrección. Esas lecturas daban el
// nombre de la CUENTA, no el de la persona, y cada pantalla lo escribía a su manera.
import type { SupabaseClient } from '@supabase/supabase-js'
import { diccionarioDeUsuarios, type FilaNombreDeUsuario } from './nombre.ts'

/** Todos los usuarios (son pocos: ~5). Si la lectura falla, un diccionario vacío: la pantalla cae en
 *  su «alguien» / texto viejo, nunca se cae. */
export async function nombresDeUsuarios(supabase: SupabaseClient): Promise<Map<string, string>> {
  try {
    const { data, error } = await supabase.rpc('nombres_de_usuarios')
    if (error) return new Map()
    return diccionarioDeUsuarios((data ?? []) as FilaNombreDeUsuario[])
  } catch {
    return new Map()
  }
}

/** Lo mismo, como objeto plano (para pasarlo de un Server Component a uno de cliente). */
export async function nombresDeUsuariosPlano(supabase: SupabaseClient): Promise<Record<string, string>> {
  return Object.fromEntries(await nombresDeUsuarios(supabase))
}
