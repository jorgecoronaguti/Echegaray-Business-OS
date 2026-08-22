'use server'

// LAS DOS ACCIONES DE CUENTA QUE SE PUEDEN DISPARAR DESDE LA FICHA DE UNA PERSONA.
//
// ═══ ACÁ NO HAY UNA SOLA LÍNEA DE SEGURIDAD, Y ES A PROPÓSITO ═══
//
// Restablecer una contraseña y bloquear un acceso YA EXISTEN, resueltos y medidos contra la base
// real, en `usuarios/services/usuariosActions.ts`. Todo lo que decide si se puede o no vive allá:
//
//   `regenerarClave`   exige NIVEL DIRECCIÓN (`motivoParaNoRegenerarClave`) — quien pone una clave
//                      puede entrar con ella, así que es un escalón más arriba que el resto.
//   `cambiarAcceso`    exige NIVEL ADMINISTRACIÓN (`veEconomia`) y además las dos reglas que no se
//                      pueden saltear: nadie se saca el acceso a sí mismo, y no se apaga al último
//                      administrador (si se apaga, no queda nadie que pueda volver a encenderlo).
//
// Copiar cualquiera de esos controles acá crearía una SEGUNDA definición de quién puede tocar una
// cuenta, y la segunda es siempre la que nadie actualiza. Estas funciones no vuelven a preguntar:
// DELEGAN, y el `admin.updateUserById` sigue existiendo en un solo archivo del repositorio.
//
// ═══ LO ÚNICO QUE AGREGAN ═══
//
// 1. RESOLVER LA CUENTA DESDE LA PERSONA EN EL SERVIDOR. La ficha manda el id de la PERSONA, que es
//    lo que tiene en la URL; el id de la CUENTA lo busca el servidor en `perfiles.persona_id`. Así
//    esta acción no puede aplicarse a una cuenta arbitraria aunque alguien la invoque desde la
//    consola del navegador con otro cuerpo — que es exactamente cómo se invoca una acción de
//    servidor sin abrir jamás la pantalla.
// 2. REVALIDAR LA FICHA. `usuariosActions` revalida `/administracion/usuarios`, que es su pantalla.
//    Sin esto, el bloqueo se aplica en la base y la ficha sigue mostrando «activa» hasta que alguien
//    recargue: la pantalla diciendo una cosa y la base haciendo otra.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import {
  cambiarAcceso, regenerarClave,
  type Resultado, type ResultadoClave,
} from '@/features/usuarios/services/usuariosActions'

/**
 * DE LA PERSONA A SU CUENTA.
 *
 * Se lee con la SESIÓN del que llama, no con la clave de servicio: `authenticated_read_perfiles` es
 * `using (true)`, así que es una lectura que cualquiera con sesión ya puede hacer, y usar la clave
 * de servicio para resolver un id antes de haber comprobado nada es empezar por el privilegio.
 *
 * Que quien llama TENGA DERECHO a tocar esa cuenta no se decide acá: lo decide la acción de
 * `usuariosActions` a la que se delega, contra la cookie.
 */
async function cuentaDe(personaId: string): Promise<string | null> {
  const sesion = await createClient()
  const { data } = await sesion.from('perfiles').select('id').eq('persona_id', personaId).maybeSingle()
  return (data?.id as string | undefined) ?? null
}

const SIN_CUENTA = 'Esta persona no tiene ninguna cuenta vinculada. El vínculo lo hace Administración '
  + 'desde Usuarios.'

/** Le pone una clave nueva a la cuenta de esta persona y la devuelve UNA vez. Sólo Dirección. */
export async function restablecerClaveDePersona(personaId: string): Promise<ResultadoClave> {
  const usuarioId = await cuentaDe(personaId)
  if (!usuarioId) return { ok: false, error: SIN_CUENTA }
  const resultado = await regenerarClave(usuarioId)
  if (resultado.ok) revalidatePath(`/administracion/personas/${personaId}`)
  return resultado
}

/** Bloquea o desbloquea el acceso de esta persona. Nivel Administración, con las reglas de `reglas.ts`. */
export async function cambiarAccesoDePersona(personaId: string, activar: boolean): Promise<Resultado> {
  const usuarioId = await cuentaDe(personaId)
  if (!usuarioId) return { ok: false, error: SIN_CUENTA }
  const resultado = await cambiarAcceso(usuarioId, activar)
  if (resultado.ok) revalidatePath(`/administracion/personas/${personaId}`)
  return resultado
}
