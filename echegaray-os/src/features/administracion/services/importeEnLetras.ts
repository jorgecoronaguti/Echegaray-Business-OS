// EL NETO EN LETRAS, COMO LO ESCRIBE EL RECIBO DEL ESTUDIO.
//
// El recibo oficial (Q2-08/2026, TELLO) dice «IMPORTE EN LETRAS: Son Pesos Doscientos Treinta Mil Doscientos
// Cuarenta Con 12/100» para $ 230.240,12: cada palabra con mayúscula y los centavos en fracción. Se copia esa
// forma y no la de un cheque («pesos doscientos treinta mil…»), porque el papel que se imprime quiere parecerse
// al del contador. Puro: sin base, sin React.

const UNIDADES = ['', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve',
  'diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve',
  'veinte', 'veintiuno', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco', 'veintiséis', 'veintisiete',
  'veintiocho', 'veintinueve']
const DECENAS = ['', '', '', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa']
const CENTENAS = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos',
  'setecientos', 'ochocientos', 'novecientos']

const apocopar = (s: string): string => s.replace(/uno$/, 'un').replace(/veintiun$/, 'veintiún')

/** 0–999 en palabras. `apocope`: «uno» → «un» / «veintiuno» → «veintiún» delante de «mil» o «millones». */
function hastaMil(n: number, apocope: boolean): string {
  if (n === 100) return 'cien'
  const c = Math.floor(n / 100)
  const r = n % 100
  let resto: string
  if (r < 30) resto = UNIDADES[r]
  else resto = DECENAS[Math.floor(r / 10)] + (r % 10 ? ` y ${UNIDADES[r % 10]}` : '')
  const texto = [CENTENAS[c], resto].filter(Boolean).join(' ')
  return apocope ? apocopar(texto) : texto
}

function entero(n: number): string {
  if (n === 0) return 'cero'
  const millones = Math.floor(n / 1_000_000)
  const miles = Math.floor((n % 1_000_000) / 1000)
  const resto = n % 1000
  const partes: string[] = []
  if (millones) partes.push(millones === 1 ? 'un millón' : `${apocopar(entero(millones))} millones`)
  if (miles) partes.push(miles === 1 ? 'mil' : `${hastaMil(miles, true)} mil`)
  if (resto) partes.push(hastaMil(resto, false))
  return partes.join(' ')
}

const titulo = (s: string): string => s.split(' ').map((p) => (p === 'y' ? p : p.charAt(0).toUpperCase() + p.slice(1))).join(' ')

/** «Son Pesos Doscientos Treinta Mil Doscientos Cuarenta Con 12/100». `null` si el importe no es un número ≥ 0. */
export function importeEnLetras(importe: number | null | undefined): string | null {
  if (importe == null || !Number.isFinite(importe) || importe < 0) return null
  const centavosTotales = Math.round(importe * 100)
  const pesos = Math.floor(centavosTotales / 100)
  const centavos = centavosTotales % 100
  return `Son Pesos ${titulo(entero(pesos))} Con ${String(centavos).padStart(2, '0')}/100`
}
