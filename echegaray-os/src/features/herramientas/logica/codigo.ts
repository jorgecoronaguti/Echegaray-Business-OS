// EL CÓDIGO DE UN ACTIVO — lo que codifica el QR y lo que se tipea a mano.
//
// La etiqueta lleva `https://app.ecsas.com.ar/h/HER-0042` en el QR y `HER-0042` en texto. Leído con la
// cámara del teléfono llega la URL entera; tipeado a mano llega «her 42», «her-0042 », «HER0042».
// Las dos cosas tienen que terminar en el mismo código, o el camino manual no es equivalente al QR.

export const ORIGEN_QR = 'https://app.ecsas.com.ar'

/** La URL que va en el QR. El código viaja tal cual (ya es mayúsculas y guiones). */
export function urlDeEtiqueta(codigo: string): string {
  return `${ORIGEN_QR}/h/${encodeURIComponent(codigo)}`
}

const PROPIO = /^(HER|EQU|ROD)[\s_-]*0*(\d{1,6})$/

/**
 * Normaliza un código tipeado. Los propios (HER/EQU/ROD) se completan a 4 dígitos: «her 42» → HER-0042.
 * Uno ajeno (una etiqueta que ya estaba pegada, `ECS-7741-QX`) se deja como vino, en mayúsculas y sin
 * espacios de más. Vacío → null.
 */
export function normalizarCodigo(crudo: string): string | null {
  const t = crudo.trim().toUpperCase().replace(/\s+/g, ' ')
  if (!t) return null
  const m = PROPIO.exec(t)
  if (m) return `${m[1]}-${m[2].padStart(4, '0')}`
  return t.replace(/ /g, '-')
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
