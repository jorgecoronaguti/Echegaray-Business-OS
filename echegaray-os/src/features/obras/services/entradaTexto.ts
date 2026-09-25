// LO QUE SE TIPEA EN LOS CONTROLES DEL DISEÑO (B03 · B05 · 02b): fechas como texto y plata con miles.
// Módulo PURO, sin `@/`, para `node --test`.

/** ISO `aaaa-mm-dd` → «dd/mm/aaaa». */
export function isoADdmmaaaa(iso: string | null | undefined): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return ''
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`
}

/**
 * «1/9», «01/09/26», «01/09/2026», «010926», «01092026» → ISO; null si no es una fecha real.
 * Sin año, el de `anioBase` (el del plazo de la obra o el actual).
 */
export function textoAIso(texto: string, anioBase: number = new Date().getFullYear()): string | null {
  const t = texto.trim()
  if (!t) return null
  let d: number, m: number, a: number
  const partes = t.split(/[/.\-\s]+/).filter(Boolean)
  if (partes.length >= 2) {
    d = Number(partes[0]); m = Number(partes[1]); a = partes[2] ? Number(partes[2]) : anioBase
  } else if (/^\d{4}$|^\d{6}$|^\d{8}$/.test(t)) {
    d = Number(t.slice(0, 2)); m = Number(t.slice(2, 4)); a = t.length > 4 ? Number(t.slice(4)) : anioBase
  } else return null
  if (!Number.isInteger(d) || !Number.isInteger(m) || !Number.isInteger(a)) return null
  if (a < 100) a += 2000
  if (m < 1 || m > 12 || d < 1 || d > 31 || a < 1900 || a > 2200) return null
  const f = new Date(Date.UTC(a, m - 1, d))
  if (f.getUTCMonth() !== m - 1) return null
  return `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/** B03: el costo se lee como plata mientras se escribe — «1775059» → «1.775.059» (coma decimal). */
export function conMiles(v: string): string {
  const limpio = v.replace(/[^\d,]/g, '')
  const [ent, ...resto] = limpio.split(',')
  const entero = ent.replace(/^0+(?=\d)/, '')
  const miles = entero ? Number(entero).toLocaleString('es-AR', { maximumFractionDigits: 0 }) : ''
  return resto.length ? `${miles || '0'},${resto.join('').slice(0, 2)}` : miles
}
