// LEER QUIÉN ES QUIÉN. Sólo lectura: todo lo que escribe vive en `usuariosActions.ts`.
//
// ═══ LA LISTA SE ARMA DESDE `auth.users`, NO DESDE `perfiles` ═══
//
// La identidad —quién puede entrar— vive en `auth.users`. `perfiles` es lo que ese usuario ES para
// el negocio, y puede faltar: una cuenta creada a mano en Supabase queda sin perfil. Si la lista
// saliera de `perfiles`, esa cuenta no aparecería en ninguna pantalla y sin embargo podría entrar
// —al nivel Obras, que es donde cae un rol desconocido—. Una cuenta invisible que entra es
// exactamente lo que esta pantalla existe para que no pase.
//
// Se usa el cliente de service role porque `auth.users` no es consultable de otra forma. Quien lo
// llama ya pasó por el control de rol del servidor.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Rol } from '@/features/auth/types'
import { areaDe, veEconomia } from '@/features/auth/types/areas'
import type { ServiceResult } from '@/features/auth/services/authService'
import type { EstadoUsuario, ObraDeUsuario, ObraElegible, UsuarioGestion } from '../types'

/**
 * EL BLOQUEO, LEÍDO DEL USUARIO DE AUTH.
 *
 * GoTrue devuelve `banned_until` sólo cuando está puesto (`omitempty`), y el tipo `User` del SDK no
 * lo declara. Se lee con un estrechamiento explícito en vez de un `as User & {…}`: el campo es del
 * servidor, no del tipo, y afirmar que existe sería afirmar algo que el SDK no garantiza.
 *
 * Un bloqueo VENCIDO no es un bloqueo: se compara contra el reloj. Sin esa comparación, un bloqueo
 * temporal ya expirado dejaría la cuenta pintada «sin acceso» para siempre mientras entra sin
 * problemas — la pantalla diciendo una cosa y la base haciendo otra.
 */
export function estadoDeCuenta(usuario: unknown, ahora = new Date()): EstadoUsuario {
  const bloqueo = (usuario as Record<string, unknown> | null)?.banned_until
  if (typeof bloqueo !== 'string') return 'activo'
  const hasta = new Date(bloqueo)
  return Number.isNaN(hasta.getTime()) || hasta <= ahora ? 'activo' : 'sin_acceso'
}

/** Todas las cuentas del sistema, con su rol, sus obras y su estado real. */
export async function listarUsuarios(admin: SupabaseClient): Promise<ServiceResult<UsuarioGestion[]>> {
  try {
    const { data: auth, error: aErr } = await admin.auth.admin.listUsers({ perPage: 1000 })
    if (aErr) return { data: null, error: aErr.message }

    const [{ data: perfiles, error: pErr }, { data: asignaciones }, { data: obras }] = await Promise.all([
      admin.from('perfiles').select('id, rol, nombre, persona_id'),
      admin.from('usuario_obra').select('id, usuario_id, obra_canonica_id, papel'),
      admin.from('obra_canonica').select('id, nombre'),
    ])
    // El nombre de la persona vinculada. Se pide aparte y no con un join anidado: `perfiles` puede
    // apuntar a una persona dada de baja, y un join interno la haría desaparecer de la lista —
    // que es justo el caso en el que alguien necesita ver el vínculo para deshacerlo.
    const { data: personas } = await admin.from('personas').select('id, nombre_completo')
    const nombrePersona = new Map((personas ?? []).map((x) => [x.id as string, x.nombre_completo as string]))
    if (pErr) return { data: null, error: pErr.message }

    const perfilDe = new Map((perfiles ?? []).map((p) => [p.id as string, p]))
    const nombreObra = new Map((obras ?? []).map((o) => [o.id as string, o.nombre as string]))
    const obrasDe = new Map<string, ObraDeUsuario[]>()
    for (const a of asignaciones ?? []) {
      const fila: ObraDeUsuario = {
        asignacionId: a.id as string,
        obraId: a.obra_canonica_id as string,
        // Una obra borrada deja la asignación colgada: se dice, no se esconde detrás del id.
        obraNombre: nombreObra.get(a.obra_canonica_id as string) ?? (a.obra_canonica_id as string),
        papel: (a.papel as string) ?? 'jefe',
      }
      obrasDe.set(a.usuario_id as string, [...(obrasDe.get(a.usuario_id as string) ?? []), fila])
    }

    const filas: UsuarioGestion[] = (auth?.users ?? []).map((u) => {
      const perfil = perfilDe.get(u.id)
      const rol = (perfil?.rol as Rol | undefined) ?? null
      return {
        id: u.id,
        persona: perfil?.persona_id
          ? {
              id: perfil.persona_id as string,
              nombre: nombrePersona.get(perfil.persona_id as string) ?? (perfil.persona_id as string),
            }
          : null,
        nombre: (perfil?.nombre as string | undefined) ?? null,
        email: u.email ?? null,
        rol,
        area: areaDe(rol),
        estado: estadoDeCuenta(u),
        obras: (obrasDe.get(u.id) ?? []).sort((a, b) => a.obraNombre.localeCompare(b.obraNombre, 'es')),
        ultimoIngreso: u.last_sign_in_at ?? null,
      }
    })

    // Administración primero —es la lista corta y la que se audita—, después por nombre.
    filas.sort((a, b) => {
      if (a.area !== b.area) return a.area === 'administracion' ? -1 : 1
      return (a.nombre ?? a.email ?? '').localeCompare(b.nombre ?? b.email ?? '', 'es')
    })
    return { data: filas, error: null }
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : 'Error desconocido' }
  }
}

/** Cuántas cuentas de nivel Administración pueden entrar hoy. Es el número de la regla del último
 *  administrador, y se calcula sobre el ESTADO REAL, no sobre el rol solo. */
export function administradoresActivos(usuarios: UsuarioGestion[]): number {
  // SE CUENTAN LOS QUE VEN LA PLATA, no los que administran. Desde que el jefe de obra entra a
  // Administración, contarlo acá haría que la regla del «último administrador» diera por cubierto
  // un sistema donde nadie puede ya ver un contrato ni cambiar un rol.
  return usuarios.filter((u) => veEconomia(u.rol) && u.estado === 'activo').length
}

/** El catálogo de obras para asignar. Incluye las cerradas: se sigue trabajando en el cierre. */
export async function listarObrasElegibles(admin: SupabaseClient): Promise<ObraElegible[]> {
  const { data } = await admin.from('obra_canonica').select('id, nombre, estado').order('nombre')
  return (data ?? []).map((o) => ({
    id: o.id as string,
    nombre: o.nombre as string,
    estado: (o.estado as string | null) ?? null,
  }))
}

/**
 * EL CATÁLOGO PARA VINCULAR: el plantel, con quién ya tiene cuenta marcado.
 *
 * No se filtran las personas ya vinculadas: se muestran deshabilitadas con el email que las tomó.
 * Sacarlas de la lista deja a quien busca a alguien sin saber si no está cargado, si se llama
 * distinto o si ya tiene cuenta — tres problemas con tres soluciones opuestas.
 */
export async function listarPersonasVinculables(
  admin: SupabaseClient,
): Promise<{ id: string; nombre: string; tomadaPor: string | null }[]> {
  const [{ data: personas }, { data: perfiles }] = await Promise.all([
    admin.from('personas').select('id, nombre_completo, en_la_empresa').order('nombre_completo'),
    admin.from('perfiles').select('id, persona_id, nombre').not('persona_id', 'is', null),
  ])
  const tomada = new Map((perfiles ?? []).map((p) => [p.persona_id as string, (p.nombre as string) ?? 'otra cuenta']))
  return (personas ?? [])
    .filter((p) => p.en_la_empresa !== false)
    .map((p) => ({
      id: p.id as string,
      nombre: p.nombre_completo as string,
      tomadaPor: tomada.get(p.id as string) ?? null,
    }))
}
