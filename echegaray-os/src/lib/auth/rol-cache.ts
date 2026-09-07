// EL ROL DEL USUARIO, FIRMADO Y CON VENCIMIENTO, PARA QUE EL MIDDLEWARE NO VIAJE A `perfiles` EN CADA REQUEST.
//
// ═══ EL DEFECTO MEDIDO (07/09/2026) ═══
//
// El middleware corre en el documento, en cada payload RSC y en cada prefetch, y en todos hacía
// `from('perfiles').select('rol')`: un viaje serial a Postgres —~85 ms local, ~120 ms desde Vercel—
// ANTES de que la página empezara a renderizar. El dueño: «no se puede trabajar con app.ecsas.com.ar,
// la plataforma es lenta, carga todo el tiempo todo».
//
// ═══ LA REGLA ═══
//
// El rol se lee de Postgres UNA vez y viaja en una cookie httpOnly firmada con HMAC-SHA256, atada al
// usuario y con vencimiento corto. Mientras la firma valga y el `sub` coincida, el middleware no vuelve
// a la base. Vencida, alterada o de otro usuario, se ignora y se vuelve a leer: el costo de una cookie
// rota es un viaje, nunca un permiso.
//
// ESTO ES LA PUERTA, NO LA CERRADURA. El RLS en Postgres sigue decidiendo qué datos ve cada uno; la
// cookie sólo evita repetir la pregunta «¿a qué pantalla lo mando?». Por eso el vencimiento puede ser
// corto sin ser cero: un cambio de rol tarda como mucho VIDA_ROL_SEGUNDOS en llegar al middleware.
//
// Web Crypto y no `node:crypto`: el middleware corre en el Edge runtime.

/** Cuánto vive el rol cacheado. Cinco minutos: un cambio de rol se ve antes de que nadie lo note. */
export const VIDA_ROL_SEGUNDOS = 300
export const COOKIE_ROL = 'os_rol'

const enc = new TextEncoder()

async function firma(texto: string, secreto: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secreto), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(texto))
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** El valor de la cookie: `rol.uid.vence.firma`. El rol y el uid van tal cual; nada acá es secreto. */
export async function sellarRol(
  { uid, rol, ahora = Date.now() }: { uid: string; rol: string; ahora?: number },
  secreto: string,
): Promise<string> {
  const vence = Math.floor(ahora / 1000) + VIDA_ROL_SEGUNDOS
  const cuerpo = `${rol}.${uid}.${vence}`
  return `${cuerpo}.${await firma(cuerpo, secreto)}`
}

/**
 * El rol que la cookie afirma, o `null` si no se puede confiar en ella: vencida, de otro usuario,
 * firma que no cierra, o forma que no es la esperada. Nunca lanza: una cookie rota vale un viaje.
 */
export async function leerRol(
  cookie: string | undefined | null,
  { uid, ahora = Date.now() }: { uid: string; ahora?: number },
  secreto: string,
): Promise<string | null> {
  if (!cookie) return null
  const partes = cookie.split('.')
  if (partes.length !== 4) return null
  const [rol, uidCookie, venceTxt, sig] = partes
  if (!rol || uidCookie !== uid) return null
  const vence = Number(venceTxt)
  if (!Number.isFinite(vence) || vence * 1000 <= ahora) return null
  const esperada = await firma(`${rol}.${uidCookie}.${venceTxt}`, secreto)
  if (esperada.length !== sig.length) return null
  // Comparación de largo constante: no es paranoia, es lo que cuesta no tener un canal lateral gratis.
  let dif = 0
  for (let i = 0; i < esperada.length; i++) dif |= esperada.charCodeAt(i) ^ sig.charCodeAt(i)
  return dif === 0 ? rol : null
}

/** El secreto con el que se firma. El del portal ya existe en producción; no se inventa uno nuevo. */
export function secretoDelRol(env: Record<string, string | undefined> = process.env): string | null {
  return env.OS_ROL_SECRETO ?? env.PORTAL_SECRETO ?? env.SUPABASE_SERVICE_ROLE_KEY ?? null
}
