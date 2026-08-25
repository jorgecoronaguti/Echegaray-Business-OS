// BAJAR UN OBJETO DE SUPABASE STORAGE DESDE LA VM — sin el SDK y sin adivinar el nombre de la clave.
//
// El worker corre en la VM con `~/.config/echegaray-orq/worker.env`, que hoy sólo tiene
// `DATABASE_URL`. Para leer un archivo que la pantalla dejó en un bucket PRIVADO hacen falta dos
// cosas más: la URL del proyecto y una clave de servicio. Las dos se declaran acá y, si faltan, se
// dice CUÁL falta — nunca se devuelve un archivo vacío que después se lea como «no se pudo leer la
// foto».
//
// ═══ POR QUÉ EL NOMBRE DE LA CLAVE SE BUSCA Y NO SE FIJA ═══
//
// `src/lib/supabase/admin.ts` ya pagó esto en producción: `/administracion/usuarios` daba 500 porque
// leía un nombre fijo (`SUPABASE_SERVICE_ROLE_KEY`) y el despliegue la tenía como
// `SUPABASE_SECRET_KEY`. Misma regla acá, y por la misma razón: un entorno que la tiene bajo otro
// nombre está, para este código, sin clave, y el síntoma sería un comprobante que no se procesa
// nunca sin que nada diga por qué.
//
// NUNCA se lee, se registra ni se devuelve el VALOR de una clave. Sólo su nombre.

/** Los nombres conocidos, en orden de preferencia. Ninguno es `NEXT_PUBLIC_*`. */
export const NOMBRES_CLAVE = Object.freeze(['SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_KEY'])

/** La forma de un nombre de clave de servicio (la integración de Vercel le pone prefijo de tienda). */
const FORMA_CLAVE = /^SUPABASE_[A-Z0-9_]*(SERVICE_ROLE_KEY|SECRET_KEY|SERVICE_KEY)$/

/** Los nombres conocidos de la URL del proyecto, en orden. */
export const NOMBRES_URL = Object.freeze(['SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL'])

/** Qué nombre de clave de servicio está definido en este entorno, o null. Devuelve el NOMBRE. */
export function nombreDeLaClaveDeServicio(env = process.env) {
  for (const n of NOMBRES_CLAVE) if (env?.[n]) return n
  return Object.keys(env ?? {}).find((k) => FORMA_CLAVE.test(k) && env[k]) ?? null
}

/**
 * Lo que hace falta para hablar con Storage, o qué falta.
 * @returns {{ok:true, base:string, clave:string}|{ok:false, falta:string}}
 */
export function accesoAStorage(env = process.env) {
  const base = NOMBRES_URL.map((n) => env?.[n]).find(Boolean)
  if (!base) return { ok: false, falta: `la URL del proyecto (${NOMBRES_URL.join(' o ')})` }
  const nombre = nombreDeLaClaveDeServicio(env)
  if (!nombre) return { ok: false, falta: `la clave de servicio (${NOMBRES_CLAVE.join(' · ')})` }
  return { ok: true, base: String(base).replace(/\/+$/, ''), clave: env[nombre] }
}

/**
 * La URL REST de un objeto. Cada tramo de la ruta se codifica por separado: un nombre con espacios
 * o con `#` rompería la URL, y los nombres los pone el teléfono de quien saca la foto.
 */
export function urlDeObjeto(base, bucket, path) {
  const tramos = String(path ?? '').split('/').filter(Boolean).map(encodeURIComponent).join('/')
  return `${String(base).replace(/\/+$/, '')}/storage/v1/object/${encodeURIComponent(bucket)}/${tramos}`
}

/**
 * Baja un objeto y lo devuelve en la forma que el circuito de comprobantes espera de un adjunto.
 *
 * DEVUELVE `{ok:false, error}` EN VEZ DE LANZAR, igual que `bajarAdjunto` de Mattermost: un archivo
 * que no se puede bajar no puede tumbar a los otros tres de la misma tanda.
 *
 * @param {{bucket:string, path:string, nombre?:string, mediaType?:string}} o
 * @param {{env?:object, fetchImpl?:Function}} [dep]
 */
export async function bajarDeStorage(o = {}, dep = {}) {
  const env = dep.env ?? process.env
  const traer = dep.fetchImpl ?? fetch
  const acceso = accesoAStorage(env)
  if (!acceso.ok) {
    return { ok: false, nombre: o.nombre ?? o.path, error: `no puedo leer el archivo: falta ${acceso.falta} en la VM` }
  }
  try {
    const r = await traer(urlDeObjeto(acceso.base, o.bucket, o.path), {
      headers: { authorization: `Bearer ${acceso.clave}`, apikey: acceso.clave },
    })
    if (!r?.ok) {
      return { ok: false, nombre: o.nombre ?? o.path, error: `Storage contestó ${r?.status ?? '?'} al bajar el archivo` }
    }
    const buf = Buffer.from(await r.arrayBuffer())
    if (!buf.length) return { ok: false, nombre: o.nombre ?? o.path, error: 'el archivo vino vacío' }
    return {
      ok: true,
      nombre: o.nombre ?? o.path,
      // El tipo declarado al subir MANDA sobre el que contesta Storage: es el que la pantalla validó
      // contra la lista del bucket, y el mismo criterio que usa el bot con la extensión del nombre.
      mediaType: o.mediaType || String(r.headers?.get?.('content-type') ?? '').split(';')[0].trim(),
      data: buf.toString('base64'),
      bytes: buf.length,
    }
  } catch (e) {
    return { ok: false, nombre: o.nombre ?? o.path, error: `no pude bajar el archivo: ${String(e?.message ?? e).slice(0, 120)}` }
  }
}
