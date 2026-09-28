// id de usuario → nombre para mostrar, leído de la base por el vínculo usuario → persona.
//
// Reemplaza a las ~20 lecturas sueltas de `perfiles.select('id, nombre')` que cada servicio hacía
// para poner «quién» al lado de un movimiento, una tarea o una corrección. Esas lecturas daban el
// nombre de la CUENTA, no el de la persona, y cada pantalla lo escribía a su manera.
import type { SupabaseClient } from '@supabase/supabase-js'
import { clavesDeOrden, diccionarioDeUsuarios, type FilaNombreDeUsuario, type FilaOrdenDeUsuario } from './nombre.ts'

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

/**
 * id de usuario → clave de ORDEN (el legajo, apellido primero). Lo que se muestra sale de
 * `nombresDeUsuarios`; esto es sólo para ordenar, porque ordenar por el nombre para mostrar es
 * ordenar por nombre de pila (dueño, 28/09/2026).
 *
 * Una sola lectura, a `orden_de_usuarios()`: es security definer porque la RLS de `personas` le
 * esconde los legajos a Campo y a los jefes, y leerlos con esa sesión los hacía caer al nombre de
 * pila. Si la función falla (o la migración 20260928T2345 todavía no está aplicada), un diccionario
 * vacío y quien llama cae en su propio orden: nunca se cae la pantalla.
 */
export async function ordenDeUsuarios(supabase: SupabaseClient): Promise<Map<string, string>> {
  try {
    const { data, error } = await supabase.rpc('orden_de_usuarios')
    if (error) return new Map()
    return clavesDeOrden((data ?? []) as FilaOrdenDeUsuario[])
  } catch {
    return new Map()
  }
}

/** Lo mismo, como objeto plano (para pasarlo de un Server Component a uno de cliente). */
export async function ordenDeUsuariosPlano(supabase: SupabaseClient): Promise<Record<string, string>> {
  return Object.fromEntries(await ordenDeUsuarios(supabase))
}
