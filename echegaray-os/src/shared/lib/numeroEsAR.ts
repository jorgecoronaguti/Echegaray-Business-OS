// UN NÚMERO SE LEE COMO SE ESCRIBE ACÁ: «266.000», «$ 266.000», «266.000,50», «8,5».
//
// Dueño, 15/09/2026: *«me aparecen unas flechas para arriba y abajo q no son utiles»*. Eran el spinner de
// `<input type="number">`, que además descarta «266.000» y «$ 266.000» sin avisar. Las celdas editables pasan a
// `type="text"` con `inputMode="decimal"` y todas leen con esta función, una sola vez.
//
// ═══ EL PUNTO: MILES O DECIMAL ═══
//
// Con coma, la coma es el decimal y los puntos son miles («266.000,50»). Sin coma, un solo punto seguido de
// EXACTAMENTE tres dígitos es de miles («266.000» → 266000) y cualquier otro es decimal («8.5» → 8,5 horas): así
// una hora con punto no se convierte en 85. Varios puntos sin coma sólo valen como miles («1.234.567»).

export type LecturaDeNumero = { ok: true; valor: number | null } | { ok: false }

const DIGITOS = /^\d+$/
const MILES = /^\d{1,3}(\.\d{3})+$/

function sinSigno(c: string): string | null {
  if (c.includes(',')) {
    if ((c.match(/,/g) ?? []).length > 1) return null
    const [entero, decimales] = c.split(',')
    if (!(DIGITOS.test(entero) || MILES.test(entero)) || !DIGITOS.test(decimales)) return null
    return `${entero.replace(/\./g, '')}.${decimales}`
  }
  const puntos = (c.match(/\./g) ?? []).length
  if (puntos === 0) return DIGITOS.test(c) ? c : null
  if (puntos === 1) {
    const [a, b] = c.split('.')
    if (!DIGITOS.test(a) || !DIGITOS.test(b)) return null
    return b.length === 3 ? `${a}${b}` : `${a}.${b}`
  }
  return MILES.test(c) ? c.replace(/\./g, '') : null
}

/** Vacío = `{ ok: true, valor: null }` (vuelve al calculado). Texto que no es número = `{ ok: false }`. */
export function leerNumeroEsAR(texto: string): LecturaDeNumero {
  const t = String(texto ?? '').trim().replace(/^\$\s*/, '').replace(/\s+/g, '')
  if (t === '') return { ok: true, valor: null }
  const negativo = t.startsWith('-')
  const normal = sinSigno(negativo ? t.slice(1) : t)
  if (normal == null) return { ok: false }
  const n = Number(normal)
  if (!Number.isFinite(n)) return { ok: false }
  return { ok: true, valor: negativo ? -n : n }
}

/**
 * TAB PASA A LA SIGUIENTE CELDA EDITABLE DE LA FILA (Shift+Tab, a la anterior). `null` en el borde o si la celda
 * no está en la fila: no se salta a otra fila ni se inventa un destino.
 */
export function indiceDeLaSiguiente(total: number, actual: number, atras: boolean): number | null {
  if (actual < 0 || actual >= total) return null
  const i = atras ? actual - 1 : actual + 1
  return i >= 0 && i < total ? i : null
}
