// EL HISTORIAL DE EDICIONES DEL DUEÑO — mirar quién tocó el archivo antes de escribirle encima.
//
// ═══ POR QUÉ EXISTE (23/07) ═══
//
// El dueño: "no se está respetando mi regla de oro de revisar el historial de mis modificaciones en
// las pestañas y respetarlas al momento de cambiarme algo". Tenía razón y era medible: el OS tenía
// TRES mecanismos para no pisar ediciones —la Regla 0 (respetar-ediciones), el centinela VACIO
// (preservar-anotaciones) y el snapshot de deshacer (sheet-snapshot)— y los tres comparan CONTENIDO.
// Ninguno miraba nunca el historial: quién editó el archivo, y cuándo. La skill de Sheets lo pedía
// explícitamente ("revisar el historial de revisiones antes y después de editar") y no se hacía.
//
// ═══ LO QUE ESTA API DA, Y LO QUE NO (honestidad sobre el límite) ═══
//
// Google COLAPSA el historial de un Sheet: `drive.revisions.list` devuelve un puñado de revisiones
// (en el archivo real, 2), no el detalle celda por celda que se ve en "Ver historial de versiones".
// Entonces esto NO puede decir "el dueño cambió la celda B7". Lo que SÍ dice, y es lo que importa
// para no pisarlo: **una persona tocó este archivo DESPUÉS de la última escritura del OS**.
//
// Con esa señal el generador deja de escribir a ciegas: avisa, y la Regla 0 —que compara el contenido
// vivo contra lo que el OS escribió la vez pasada— decide celda por celda qué es del dueño.

/** El OS escribe siempre con la cuenta de servicio. Todo lo demás es una persona. */
export const ES_CUENTA_OS = /gserviceaccount\.com$/i

/**
 * NÚCLEO PURO: separa las revisiones del OS de las de personas y devuelve la última de cada lado.
 * @param {Array<{modifiedTime:string, lastModifyingUser?:{displayName?:string, emailAddress?:string}}>} revisiones
 */
export function clasificarRevisiones(revisiones = []) {
  const os = []; const personas = []
  for (const r of revisiones) {
    if (!r?.modifiedTime) continue
    const email = r?.lastModifyingUser?.emailAddress ?? ''
    const item = { cuando: r.modifiedTime, quien: r?.lastModifyingUser?.displayName || email || 'desconocido', email }
    if (ES_CUENTA_OS.test(email)) os.push(item); else personas.push(item)
  }
  const ultima = (l) => (l.length ? l.reduce((a, b) => (new Date(a.cuando) >= new Date(b.cuando) ? a : b)) : null)
  return { os: ultima(os), persona: ultima(personas), total: revisiones.length }
}

/**
 * NÚCLEO PURO: ¿una persona editó DESPUÉS de la última escritura del OS?
 *
 * Sin revisión del OS pero con revisión de una persona, la respuesta es SÍ: no se puede probar que el
 * OS haya escrito después, y ante la duda se protege al dueño.
 *
 * @returns {{hubo:boolean, quien?:string, cuando?:string, desdeOS?:string|null}}
 */
export function edicionHumanaPosterior({ os, persona } = {}) {
  if (!persona) return { hubo: false, desdeOS: os?.cuando ?? null }
  if (!os) return { hubo: true, quien: persona.quien, cuando: persona.cuando, desdeOS: null }
  const hubo = new Date(persona.cuando) > new Date(os.cuando)
  return hubo
    ? { hubo: true, quien: persona.quien, cuando: persona.cuando, desdeOS: os.cuando }
    : { hubo: false, desdeOS: os.cuando }
}

/** Una sola consulta por archivo y por proceso: un generador escribe muchas pestañas del mismo Sheet. */
const cache = new Map()

/**
 * Lee el historial de revisiones del archivo y dice si una persona editó después del OS.
 * Si la consulta falla (permisos, red), NO bloquea la escritura: devuelve `desconocido` y el que
 * llama sigue con la Regla 0, que es la que protege celda por celda.
 *
 * @param {object} google cliente con apiGetSheets (GET autenticado genérico)
 * @param {string} fileId
 */
export async function historialEdiciones(google, fileId) {
  if (cache.has(fileId)) return cache.get(fileId)
  let r
  try {
    const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`
      + '/revisions?pageSize=200&fields=revisions(id,modifiedTime,lastModifyingUser(displayName,emailAddress))'
    const j = await google.apiGetSheets(url)
    const clasificado = clasificarRevisiones(j?.revisions ?? [])
    r = { ...clasificado, ...edicionHumanaPosterior(clasificado), desconocido: false }
  } catch (e) {
    r = { hubo: false, desconocido: true, motivo: String(e?.message ?? e).slice(0, 120) }
  }
  cache.set(fileId, r)
  return r
}

/** Para tests y corridas largas: olvidar lo cacheado. */
export function limpiarCacheHistorial() { cache.clear() }

/** El aviso que ve el dueño cuando el OS va a escribir sobre un archivo que él tocó. */
export function avisoEdicionHumana(h) {
  if (!h?.hubo) return null
  const cuando = h.cuando ? new Date(h.cuando).toLocaleString('es-AR') : 'hace poco'
  return `✋ ${h.quien} editó este archivo ${cuando}${h.desdeOS ? ' (después de la última escritura del OS)' : ''}`
    + ' — la Regla 0 decide celda por celda qué es suyo y no se pisa.'
}
