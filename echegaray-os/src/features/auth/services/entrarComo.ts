import { cache } from 'react'
import { cookies } from 'next/headers'
import type { SupabaseClient } from '@supabase/supabase-js'
import { secretoDelRol } from '@/lib/auth/rol-cache'
import { COOKIE_ENTRAR_COMO, NIVELES_ENTRABLES, leerEntrarComo, type EntradaPrestada } from '@/lib/auth/entrar-como'
import { ROL_LABEL, type Rol } from '@/features/auth/types'
import { estadoDeCuenta } from '@/features/usuarios/services/usuariosService'
import { nombresDeUsuarios } from '../../../shared/personas/nombresDeUsuarios.ts'

// «ENTRAR COMO», DEL LADO DEL SERVIDOR QUE DIBUJA.
//
// La ruta `/entrar-como` cambia la sesión; esto sólo LEE lo que la cookie firmada afirma sobre la
// sesión actual, para que la franja «Estás entrando como…» se dibuje en los tres marcos y para que la
// pantalla que elige a quién entrar tenga la lista. El porqué entero está en `lib/auth/entrar-como.ts`.

/** La entrada prestada que gobierna esta sesión, o `null`. Memorizado por request. */
export const entradaPrestada = cache(async (uidSesion: string): Promise<EntradaPrestada | null> => {
  const secreto = secretoDelRol()
  if (!secreto) return null
  const cookie = (await cookies()).get(COOKIE_ENTRAR_COMO)?.value
  return leerEntrarComo(cookie, { uidSesion }, secreto)
})

export interface CuentaEntrable {
  id: string
  email: string | null
  nombre: string | null
  rol: Rol | null
  /** `sin_acceso` = bloqueada: no se le puede abrir sesión, y se dice en vez de fallar al tocar. */
  estado: 'activo' | 'sin_acceso'
  ultimoIngreso: string | null
  /** ¿Tiene verificación en dos pasos? La sesión prestada la saltea, y hay que decirlo. */
  dosPasos: boolean
}

export interface GrupoEntrable {
  rol: Rol | null
  etiqueta: string
  cuentas: CuentaEntrable[]
}

/**
 * LAS CUENTAS A LAS QUE DIRECCIÓN PUEDE ENTRAR, agrupadas por nivel en el orden de
 * `NIVELES_ENTRABLES` y con «Sin nivel» al final. Las de Dirección no están —regla 2— y la propia
 * tampoco. Se lee con la clave de servicio porque las cuentas viven en `auth.users`; quien llama ya
 * comprobó que es Dirección.
 */
export async function cuentasEntrables(admin: SupabaseClient, actorId: string): Promise<GrupoEntrable[]> {
  const { data: auth, error } = await admin.auth.admin.listUsers({ perPage: 1000 })
  if (error) throw new Error(error.message)
  const [{ data: perfiles }, nombres] = await Promise.all([
    admin.from('perfiles').select('id, rol'),
    // El nombre de su persona, resuelto por el vínculo (src/shared/personas).
    nombresDeUsuarios(admin),
  ])
  const perfilDe = new Map((perfiles ?? []).map((p) => [p.id as string, p as { rol: Rol }]))

  const grupos = new Map<Rol | null, CuentaEntrable[]>()
  for (const u of auth?.users ?? []) {
    if (u.id === actorId) continue
    const perfil = perfilDe.get(u.id)
    const rol = perfil?.rol ?? null
    if (rol === 'direccion') continue
    const cuenta: CuentaEntrable = {
      id: u.id,
      email: u.email ?? null,
      nombre: nombres.get(u.id) ?? null,
      rol,
      estado: estadoDeCuenta(u),
      ultimoIngreso: u.last_sign_in_at ?? null,
      dosPasos: Array.isArray(u.factors) && u.factors.some((f) => f.status === 'verified'),
    }
    grupos.set(rol, [...(grupos.get(rol) ?? []), cuenta])
  }
  const orden: (Rol | null)[] = [...NIVELES_ENTRABLES, null]
  return orden
    .filter((r) => (grupos.get(r) ?? []).length > 0)
    .map((r) => ({
      rol: r,
      etiqueta: r ? ROL_LABEL[r] : 'Sin nivel asignado',
      cuentas: (grupos.get(r) ?? []).sort((a, b) => (a.nombre ?? a.email ?? '').localeCompare(b.nombre ?? b.email ?? '', 'es')),
    }))
}
