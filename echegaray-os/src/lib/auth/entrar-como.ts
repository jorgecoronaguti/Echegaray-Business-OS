// «ENTRAR COMO»: DIRECCIÓN ABRE UNA SESIÓN REAL DE OTRO USUARIO, Y VUELVE.
//
// ═══ EL PEDIDO (dueño, 23/09/2026) ═══
//
// «Ver como» es una lente: cambia el rol con el que se DIBUJA la pantalla, pero la base sigue viendo
// a Dirección y el middleware rechaza toda escritura. El dueño quiere «ver EXACTAMENTE lo que ve ese
// nivel, con los permisos reales de la base, y poder operar si hace falta». Eso no se puede simular:
// hay que SER ese usuario ante Supabase. Así que esto abre una sesión de verdad —cookies de Supabase
// a nombre del otro— y guarda, firmado, quién era el que entró para poder devolverlo a su cuenta.
//
// ═══ CÓMO SE ABRE LA SESIÓN DEL OTRO SIN SU CONTRASEÑA ═══
//
// Con la clave de servicio: `auth.admin.generateLink({ type: 'magiclink' })` devuelve el
// `hashed_token` de un enlace mágico que NO se manda por correo, y `verifyOtp({ token_hash })` lo canjea
// en el servidor por una sesión. Es el mismo canje que hace `/callback` cuando alguien abre el enlace
// del correo; la diferencia es que acá el enlace no viaja: nace y se canjea en la misma petición.
//
// ═══ LO QUE ESTA COOKIE AFIRMA ═══
//
// `entrarcomo.<uid de Dirección>.<uid del objetivo>.<id de auditoría>.<vence>.<firma>`. Se lee contra
// el usuario de la SESIÓN ACTUAL: sólo vale si la sesión es la del objetivo. Con eso la franja «Estás
// entrando como…» se dibuja para la sesión prestada y para ninguna otra, y «Volver a mi cuenta» sabe a
// quién devolver sin preguntarle al navegador —que es entrada de usuario—.
//
// La firma es la misma técnica que la lente y el rol cacheado (HMAC-SHA256 con Web Crypto: corre en el
// Edge), con el PROPÓSITO adentro del cuerpo: una cookie de lente no vale como ésta ni al revés.
//
// ═══ LAS TRES REGLAS ═══
//
//   1. Sólo Dirección entra, y se comprueba contra `perfiles`, nunca contra una cookie.
//   2. Nadie entra como otra Dirección: sería la puerta para que una cuenta comprometida de Dirección se
//      convirtiera en TODAS las cuentas de Dirección sin dejar una sola huella distinta.
//   3. Cada entrada y cada vuelta quedan en `auditoria_entrar_como`: quién, a quién, cuándo entró y
//      cuándo volvió. Una sesión prestada sin registro es una suplantación.

import type { Rol } from '@/features/auth/types'

export const COOKIE_ENTRAR_COMO = 'os_entrar_como'

/** Lo mismo que la lente: media jornada. Vencida, la franja desaparece y la sesión prestada sigue
 *  siendo la del otro — por eso «Volver» también acepta la cookie vencida (ver `leerEntrarComo`). */
export const VIDA_ENTRAR_COMO_SEGUNDOS = 4 * 60 * 60

/** La ruta que entra y vuelve. POST a propósito: cambia la identidad de la sesión. */
export const RUTA_ENTRAR_COMO = '/entrar-como'

export const ROL_QUE_ENTRA: Rol = 'direccion'

/** Los niveles en los que se puede entrar, en el orden en que se listan. Dirección NO está: regla 2. */
export const NIVELES_ENTRABLES: readonly Rol[] = ['administracion', 'jefe_obra', 'campo', 'cliente']

/**
 * ¿Puede `rolActor` entrar como una cuenta de `rolObjetivo`? Pura, para probarla.
 * `null` = cuenta sin perfil: entra al nivel menos privilegiado, y es justamente una de las que
 * conviene poder mirar («¿por qué no ve nada?»).
 */
export function puedeEntrarComo(rolActor: Rol | null | undefined, rolObjetivo: Rol | null | undefined): boolean {
  if (rolActor !== ROL_QUE_ENTRA) return false
  return rolObjetivo !== ROL_QUE_ENTRA
}

const PROPOSITO = 'entrarcomo'
const enc = new TextEncoder()

async function firma(texto: string, secreto: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secreto), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(texto))
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

export interface EntradaPrestada {
  /** Quién entró: la cuenta de Dirección a la que hay que volver. */
  direccionId: string
  /** Como quién está entrando: el dueño de la sesión actual. */
  objetivoId: string
  /** La fila de `auditoria_entrar_como` que se cierra al volver. */
  auditoriaId: string
  /** `true` si pasó la vida útil: la franja lo dice y sólo deja volver. */
  vencida: boolean
}

export async function sellarEntrarComo(
  { direccionId, objetivoId, auditoriaId, ahora = Date.now() }:
  { direccionId: string; objetivoId: string; auditoriaId: string; ahora?: number },
  secreto: string,
): Promise<string> {
  const vence = Math.floor(ahora / 1000) + VIDA_ENTRAR_COMO_SEGUNDOS
  const cuerpo = `${PROPOSITO}.${direccionId}.${objetivoId}.${auditoriaId}.${vence}`
  return `${cuerpo}.${await firma(cuerpo, secreto)}`
}

/**
 * Lo que la cookie afirma, o `null` si no se puede confiar: firma que no cierra, propósito ajeno, o
 * una sesión que no es la del objetivo. UNA COOKIE VENCIDA SÍ SE LEE, marcada: si venciera en
 * silencio, el dueño quedaría adentro de la cuenta del otro sin franja y sin botón para volver —lo
 * peor de los dos mundos—. Vencida sólo sirve para volver; el que la lee decide.
 */
export async function leerEntrarComo(
  cookie: string | undefined | null,
  { uidSesion, ahora = Date.now() }: { uidSesion: string; ahora?: number },
  secreto: string,
): Promise<EntradaPrestada | null> {
  if (!cookie) return null
  const partes = cookie.split('.')
  if (partes.length !== 6) return null
  const [proposito, direccionId, objetivoId, auditoriaId, venceTxt, sig] = partes
  if (proposito !== PROPOSITO || !direccionId || !auditoriaId) return null
  if (objetivoId !== uidSesion) return null
  if (direccionId === objetivoId) return null
  const vence = Number(venceTxt)
  if (!Number.isFinite(vence)) return null
  const esperada = await firma(`${proposito}.${direccionId}.${objetivoId}.${auditoriaId}.${venceTxt}`, secreto)
  if (esperada.length !== sig.length) return null
  let dif = 0
  for (let i = 0; i < esperada.length; i++) dif |= esperada.charCodeAt(i) ^ sig.charCodeAt(i)
  if (dif !== 0) return null
  return { direccionId, objetivoId, auditoriaId, vencida: vence * 1000 <= ahora }
}
