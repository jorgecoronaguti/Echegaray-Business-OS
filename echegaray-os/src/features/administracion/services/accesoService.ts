// LA CUENTA DE UNA PERSONA — leer, nunca escribir. Lo que escribe vive en `accesoActions.ts`.
//
// ═══ POR QUÉ NO SE REUSA `listarUsuarios` ═══
//
// `usuariosService.listarUsuarios` trae las MIL cuentas del sistema con sus perfiles, sus obras y su
// catálogo de nombres, porque la pantalla de usuarios es una lista. Acá se necesita UNA, y esa lista
// completa costaría cuatro consultas y un `listUsers` para tirar todo menos una fila. Lo que sí se
// reusa —y es lo que importa— son las dos funciones que INTERPRETAN el dato: `estadoDeCuenta` (un
// bloqueo vencido no es un bloqueo) y `ultimoIngresoDicho` (la hora de San Juan, no la de Vercel).
// Duplicar cualquiera de esas dos es lo que deja la ficha diciendo una cosa y /usuarios otra.
//
// ═══ DOS LLAVES, Y CADA UNA POR SU MOTIVO ═══
//
//   perfiles, usuario_obra   LA SESIÓN. `authenticated_read_perfiles` es `using (true)` y
//                            `usuario_obra_select` acepta a Administración: no hace falta más, y
//                            leer con la clave de servicio lo que la sesión ya puede leer apaga la
//                            RLS sin ganar nada.
//   auth.users               CLAVE DE SERVICIO, sin alternativa: el correo, el bloqueo y el último
//                            ingreso viven en el esquema `auth` y no hay forma de leerlos con la
//                            sesión de una persona.
//
// EL PORTÓN LO PONE LA PANTALLA, ANTES DE LLAMAR ACÁ (`veLaCuentaDeOtro`). Se declara acá arriba
// porque una función que usa la clave de servicio sin control propio es una que alguien puede llamar
// mañana desde otro lado sin darse cuenta.

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Rol } from '@/features/auth/types'
import type { EstadoUsuario } from '@/features/usuarios/types'
import { estadoDeCuenta } from '@/features/usuarios/services/usuariosService'
import { ultimoIngresoDicho } from '@/features/usuarios/services/reglas'

/** La cuenta que ES esta persona, o el motivo por el que no hay ninguna. */
export type CuentaDePersona =
  | { hay: true; cuenta: CuentaVinculada; error: null }
  | { hay: false; error: string | null }

export interface CuentaVinculada {
  usuarioId: string
  email: string | null
  nombre: string | null
  rol: Rol | null
  estado: EstadoUsuario
  /** Ya dicho en la hora de la empresa. `null` = la cuenta NUNCA entró, que es un dato, no un hueco. */
  ultimoIngreso: string | null
  /** Los nombres de las obras de `usuario_obra`. Vacío no significa «ninguna»: ver `veTodasLasObras`. */
  obras: string[]
}

/**
 * ¿QUIÉN ENTRA AL SISTEMA COMO ESTA PERSONA?
 *
 * El vínculo es `perfiles.persona_id`, la misma columna que resuelve `mi_persona_id()` en la base y
 * de la que cuelga todo «Mi cuenta». Se busca desde la persona hacia la cuenta —y no al revés—
 * porque el índice único parcial `perfiles_una_persona_por_usuario` garantiza que hay como mucho
 * una: `maybeSingle()` no puede reventar por duplicados.
 */
export async function getCuentaDePersona(
  sesion: SupabaseClient,
  personaId: string,
): Promise<CuentaDePersona> {
  const { data: perfil, error } = await sesion
    .from('perfiles').select('id, rol, nombre').eq('persona_id', personaId).maybeSingle()
  // NO EXISTE y NO PUDE LEER son dos cosas distintas. Decir «sin cuenta» ante un error de permisos
  // manda a crear una cuenta que ya existe — y el alta rebota con «ya existe ese correo».
  if (error) return { hay: false, error: error.message }
  if (!perfil) return { hay: false, error: null }

  const usuarioId = perfil.id as string

  // La clave de servicio puede faltar en el despliegue: es la única variable que esta solapa
  // necesita y sin ella `createAdminClient()` tira. Un 500 en blanco no dice qué configurar.
  let cuentaAuth: { email: string | null; ultimoIngreso: string | null; estado: EstadoUsuario }
  try {
    const admin = createAdminClient()
    const { data, error: aErr } = await admin.auth.admin.getUserById(usuarioId)
    if (aErr || !data?.user) {
      // Hay perfil y no hay cuenta: el vínculo quedó colgado. Es un hallazgo, no un hueco.
      return { hay: false, error: 'Hay un perfil vinculado a esta persona, pero la cuenta de acceso ya no existe.' }
    }
    cuentaAuth = {
      email: data.user.email ?? null,
      ultimoIngreso: ultimoIngresoDicho(data.user.last_sign_in_at ?? null),
      estado: estadoDeCuenta(data.user),
    }
  } catch {
    return {
      hay: false,
      error: 'Falta SUPABASE_SERVICE_ROLE_KEY en este despliegue: el correo y el estado de la cuenta '
        + 'viven en el esquema de autenticación y no se pueden leer con la sesión de una persona.',
    }
  }

  const { data: filas } = await sesion
    .from('usuario_obra').select('obra_canonica_id, obra_canonica(nombre)').eq('usuario_id', usuarioId)
  const obras = (filas ?? []).map((f) => {
    const obra = f.obra_canonica as { nombre?: string } | { nombre?: string }[] | null
    const nombre = Array.isArray(obra) ? obra[0]?.nombre : obra?.nombre
    // Una obra borrada deja la asignación colgada: se dice con el id, no se esconde.
    return nombre ?? (f.obra_canonica_id as string)
  })

  return {
    hay: true,
    error: null,
    cuenta: {
      usuarioId,
      nombre: (perfil.nombre as string | null) ?? null,
      rol: (perfil.rol as Rol | null) ?? null,
      ...cuentaAuth,
      obras: obras.sort((a, b) => a.localeCompare(b, 'es')),
    },
  }
}
