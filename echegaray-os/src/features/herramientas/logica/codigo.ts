// EL CÓDIGO DE UN ACTIVO — lo que codifica el QR y lo que se tipea a mano.
//
// La etiqueta lleva `https://app.ecsas.com.ar/h/AMO-007` en el QR y `AMO-007` en texto. Leído con la
// cámara del teléfono llega la URL entera; tipeado a mano llega «amo 7», «amo-007 », «AMO007».
// Las dos cosas tienen que terminar en el mismo código, o el camino manual no es equivalente al QR.
//
// EL FORMATO (dueño, 22/09: «por lo menos las primeras tres letras de cada herram o equipo y se pueda
// editar pero q te vaya guiando»): tres letras + guion + número de 3 cifras (4 si pasa de 999). Las
// letras salen del nombre (`prefijoDeNombre`, espejo de `public.prefijo_de_nombre`); el número lo pone
// la base. Los códigos anteriores (HER-0042, ROD-0001) siguen abriendo la ficha por
// `activo_por_codigo`, y conservan sus 4 cifras.

export const ORIGEN_QR = 'https://app.ecsas.com.ar'

/** La URL que va en el QR. El código viaja tal cual (ya es mayúsculas y guiones). */
export function urlDeEtiqueta(codigo: string): string {
  return `${ORIGEN_QR}/h/${encodeURIComponent(codigo)}`
}

/** Los prefijos del primer esquema (21/09): sus números tenían 4 cifras y así quedaron como anteriores. */
const ANTERIORES = new Set(['HER', 'EQU', 'ROD'])
const PROPIO = /^([A-Z]{3})[\s_-]*0*(\d{1,4})$/
/** El formato que la base acepta (`activo_codigo_formato_chk`). */
export const FORMATO_CODIGO = /^[A-Z]{3}-\d{3,4}$/

/**
 * Normaliza un código tipeado: «amo 7» → AMO-007, «her 42» → HER-0042 (esquema anterior, 4 cifras).
 * Uno ajeno (una etiqueta que ya estaba pegada, `ECS-7741-QX`) se deja como vino, en mayúsculas y sin
 * espacios de más, para que la pantalla diga que no existe. Vacío → null.
 */
export function normalizarCodigo(crudo: string): string | null {
  const t = crudo.trim().toUpperCase().replace(/\s+/g, ' ')
  if (!t) return null
  const m = PROPIO.exec(t)
  if (m) return `${m[1]}-${m[2].padStart(ANTERIORES.has(m[1]) ? 4 : 3, '0')}`
  return t.replace(/ /g, '-')
}

const ACENTOS: Record<string, string> = { Á: 'A', À: 'A', Ä: 'A', Â: 'A', É: 'E', È: 'E', Ë: 'E', Ê: 'E', Í: 'I', Ì: 'I', Ï: 'I', Î: 'I', Ó: 'O', Ò: 'O', Ö: 'O', Ô: 'O', Ú: 'U', Ù: 'U', Ü: 'U', Û: 'U', Ñ: 'N', Ç: 'C' }

/** Las tres letras que sugiere un nombre: «Amoladora Bosch» → AMO. Igual que `public.prefijo_de_nombre`. */
export function prefijoDeNombre(nombre: string): string {
  const letras = nombre.toUpperCase().replace(/[ÁÀÄÂÉÈËÊÍÌÏÎÓÒÖÔÚÙÜÛÑÇ]/g, (c) => ACENTOS[c]).replace(/[^A-Z]/g, '')
  return letras.slice(0, 3).padEnd(3, 'X')
}

/**
 * Lo que se va tipeando en el campo del prefijo, limpio mientras se escribe: sólo letras, sin acentos,
 * mayúsculas, a lo sumo tres. No hay forma de dejar ahí un número, un guion o un espacio.
 */
export function limpiarPrefijo(tipeado: string): string {
  return tipeado.toUpperCase().replace(/[ÁÀÄÂÉÈËÊÍÌÏÎÓÒÖÔÚÙÜÛÑÇ]/g, (c) => ACENTOS[c]).replace(/[^A-Z]/g, '').slice(0, 3)
}

/** Si el prefijo se puede usar, null; si no, qué falta, dicho para quien lo está escribiendo. */
export function problemaDelPrefijo(prefijo: string): string | null {
  if (prefijo.length === 0) return 'Escribí tres letras'
  if (prefijo.length < 3) return prefijo.length === 2 ? 'Falta 1 letra' : `Faltan ${3 - prefijo.length} letras`
  return /^[A-Z]{3}$/.test(prefijo) ? null : 'Sólo letras, sin acentos ni números'
}

/**
 * Lo que leyó la cámara (o se pegó) → el código. Acepta la URL de la etiqueta (con o sin https, con
 * barra final, con consulta) o el código pelado. Una URL de OTRO sitio no es un código: devuelve null
 * para que la pantalla diga «no es una etiqueta de Echegaray», nunca que busque ese texto.
 */
export function codigoDeLectura(leido: string): string | null {
  const t = leido.trim()
  if (!t) return null
  const url = /^(?:https?:\/\/)?([^/\s]+)(\/[^\s?#]*)?/i.exec(t)
  const pareceUrl = /^https?:\/\//i.test(t) || /^[a-z0-9-]+(\.[a-z0-9-]+)+\//i.test(t)
  if (url && pareceUrl) {
    const host = url[1].toLowerCase()
    if (host !== 'app.ecsas.com.ar' && !host.startsWith('localhost')) return null
    const m = /^\/h\/([^/]+)\/?$/.exec(url[2] ?? '')
    if (!m) return null
    try {
      return normalizarCodigo(decodeURIComponent(m[1]))
    } catch {
      return null
    }
  }
  if (t.length > 40) return null
  return normalizarCodigo(t)
}
