// «VER COMO»: LA LENTE CON LA QUE DIRECCIÓN MIRA LA APP CON LOS OJOS DE OTRO ROL.
//
// ═══ EL PEDIDO (dueño, 22/09/2026) ═══
//
// Textual: *«todas las funciones que yo tenga en mobile y en computadora son distintas al resto
// porque soy admin, y además tengo que probar cómo las verían el resto. No me crees un usuario
// normal»*. O sea: mirar la pantalla del otro SIN dar de alta usuarios de prueba — que además
// chocaría con «no dar de alta inactivos en el padrón».
//
// ═══ LA REGLA QUE GOBIERNA TODO ESTO: SÓLO RESTRINGE, NUNCA AMPLÍA ═══
//
// 1. La lente sólo la enciende quien YA es `direccion`, y eso se comprueba contra `perfiles` —no
//    contra la cookie que la lente misma escribe—. Un rol que no es Dirección no puede encenderla:
//    la ruta que la prende se lo niega y el middleware borra la cookie si aparece igual.
// 2. Los roles mirables son los de MENOS alcance que Dirección. `direccion` no está en la lista
//    (sería no hacer nada) y `cliente` tampoco: el portal es otra aplicación, con otra sesión
//    —una cookie firmada propia— y no un rol con menos permisos.
// 3. CON LA LENTE PUESTA NO SE ESCRIBE. Ni con la identidad imitada —eso sería suplantación— ni
//    con la real —nadie tiene que descubrir a mitad de camino con qué firma quedó lo que cargó—.
//    El middleware rechaza toda petición que no sea de lectura mientras la lente está puesta.
//
// ═══ ESTO ES UNA LENTE DE PANTALLA, NO UNA AUDITORÍA DE PERMISOS ═══
//
// La app decide QUÉ DIBUJA con el rol; la base decide QUÉ DATOS SALEN con `es_administracion()`,
// `ve_economia()`, `ve_obra()` y `mi_persona_id()`, que siguen viendo al usuario REAL — Dirección.
// Por lo tanto: si con la lente puesta una pantalla se ve vacía, eso prueba que la pantalla la
// esconde; si se ve llena, NO prueba que el otro rol podría leerla. Para probar la cerradura hay
// que pegarle a PostgREST con el token de ese rol. La pantalla lo dice con todas las letras
// (`AvisoVerComo`), porque si no alguien va a confundir «se ve bien» con «está cerrado».
//
// La firma es la misma técnica que `rol-cache.ts` (HMAC-SHA256 con Web Crypto, porque esto corre
// en el Edge), con un PROPÓSITO adentro del cuerpo firmado: así una cookie de rol no vale como
// cookie de lente ni al revés, aunque las dos usen el mismo secreto.

import type { Rol } from '@/features/auth/types'

export const COOKIE_VER_COMO = 'os_ver_como'

/** Media jornada: lo suficiente para probar, poco para olvidárselo puesto de un día para el otro. */
export const VIDA_VER_COMO_SEGUNDOS = 4 * 60 * 60

/** El único rol que puede encender la lente. */
export const ROL_QUE_MIRA: Rol = 'direccion'

/** Los roles que se pueden mirar. Todos ven MENOS que Dirección; ninguno ve algo que ella no vea. */
export const ROLES_MIRABLES = ['administracion', 'jefe_obra', 'campo'] as const
export type RolMirable = (typeof ROLES_MIRABLES)[number]

export function esRolMirable(v: string | null | undefined): v is RolMirable {
  return !!v && (ROLES_MIRABLES as readonly string[]).includes(v)
}

const PROPOSITO = 'vercomo'
const enc = new TextEncoder()

async function firma(texto: string, secreto: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secreto), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(texto))
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** El valor de la cookie: `vercomo.rol.uid.vence.firma`. Nada de esto es secreto; lo que importa es que no se pueda inventar. */
export async function sellarVerComo(
  { uid, rol, ahora = Date.now() }: { uid: string; rol: RolMirable; ahora?: number },
  secreto: string,
): Promise<string> {
  const vence = Math.floor(ahora / 1000) + VIDA_VER_COMO_SEGUNDOS
  const cuerpo = `${PROPOSITO}.${rol}.${uid}.${vence}`
  return `${cuerpo}.${await firma(cuerpo, secreto)}`
}

/**
 * El rol que la lente afirma, o `null` si no se puede confiar en ella: vencida, de otro usuario,
 * firma que no cierra, propósito ajeno, o un rol que no es mirable. Nunca lanza, y falla CERRADO:
 * ante la duda no hay lente, que es el estado en el que la app se comporta como siempre.
 */
export async function leerVerComo(
  cookie: string | undefined | null,
  { uid, ahora = Date.now() }: { uid: string; ahora?: number },
  secreto: string,
): Promise<RolMirable | null> {
  if (!cookie) return null
  const partes = cookie.split('.')
  if (partes.length !== 5) return null
  const [proposito, rol, uidCookie, venceTxt, sig] = partes
  if (proposito !== PROPOSITO || uidCookie !== uid || !esRolMirable(rol)) return null
  const vence = Number(venceTxt)
  if (!Number.isFinite(vence) || vence * 1000 <= ahora) return null
  const esperada = await firma(`${proposito}.${rol}.${uidCookie}.${venceTxt}`, secreto)
  if (esperada.length !== sig.length) return null
  let dif = 0
  for (let i = 0; i < esperada.length; i++) dif |= esperada.charCodeAt(i) ^ sig.charCodeAt(i)
  return dif === 0 ? rol : null
}

/** La ruta que prende y apaga la lente. Es GET a propósito: con la lente puesta no pasa nada que no sea lectura, y apagarla tiene que poder hacerse SIEMPRE. */
export const RUTA_VER_COMO = '/ver-como'

/**
 * ¿Esta petición ESCRIBE? Todo lo que no sea leer. Los Server Actions de Next viajan como POST al
 * mismo path de la pantalla, así que no alcanza con mirar la URL: se mira el método, que es lo
 * único que ningún formulario puede disfrazar.
 */
export function esPeticionDeEscritura(metodo: string): boolean {
  return metodo !== 'GET' && metodo !== 'HEAD' && metodo !== 'OPTIONS'
}
