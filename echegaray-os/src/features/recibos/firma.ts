// LA FIRMA CON EL DEDO — lo que se decide del trazo, sin canvas ni React.
//
// ═══ EL MISMO FORMATO QUE LA CONFORMIDAD DEL EFECTIVO ═══
//
// La conformidad de una entrega de efectivo (`src/features/efectivo/campo/firma.ts`, otra rama al 22/09)
// guarda la firma igual: un SVG chico y autocontenido con un solo `<path>`. Este archivo es la misma
// regla —mismos umbrales, mismo SVG, byte por byte— para que al unificar quede uno solo sin migrar datos:
// `firmar_recibo_pago()` valida el trazo con la expresión exacta de `svgDeFirma`.
//
// Vale como conformidad interna (dueño, 22/09): conviven esta firma y el papel firmado.

export interface Punto { x: number; y: number }
export type Trazo = Punto[]

/** Menos que esto es un toque, no una firma. */
export const MIN_PUNTOS = 12
/** La firma tiene que ocupar algo del recuadro, no un punto en una esquina. */
export const MIN_LADO = 40
/** Tope del texto que viaja a la base (el mismo de la función). */
export const MAX_CARACTERES = 60_000

/** ¿Es una firma o un toque? Puntos suficientes, un recuadro que no sea un punto y algo de recorrido. */
export function firmaValida(trazos: readonly Trazo[]): boolean {
  const puntos = trazos.flat()
  if (puntos.length < MIN_PUNTOS) return false
  const xs = puntos.map((p) => p.x)
  const ys = puntos.map((p) => p.y)
  const ancho = Math.max(...xs) - Math.min(...xs)
  const alto = Math.max(...ys) - Math.min(...ys)
  return Math.max(ancho, alto) >= MIN_LADO && recorrido(trazos) >= MIN_LADO * 2
}

function recorrido(trazos: readonly Trazo[]): number {
  let total = 0
  for (const t of trazos) {
    for (let i = 1; i < t.length; i++) total += Math.hypot(t[i].x - t[i - 1].x, t[i].y - t[i - 1].y)
  }
  return total
}

/** Un trazo como comandos de path: `M10 20L11 22L…`. Enteros: el medio píxel no cambia una firma. */
export function pathDeTrazos(trazos: readonly Trazo[]): string {
  return trazos
    .filter((t) => t.length > 0)
    .map((t) => {
      const [p0, ...resto] = t.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) }))
      if (!resto.length) return `M${p0.x} ${p0.y}l0 0`
      return `M${p0.x} ${p0.y}` + resto.map((p) => `L${p.x} ${p.y}`).join('')
    })
    .join('')
}

/** El SVG que se guarda en `recibo_pago.trazo`. `null` cuando no es firma o se pasa del tope. */
export function svgDeFirma(trazos: readonly Trazo[], ancho: number, alto: number): string | null {
  if (!firmaValida(trazos)) return null
  const d = pathDeTrazos(trazos)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${Math.round(ancho)} ${Math.round(alto)}">` +
    `<path d="${d}" fill="none" stroke="#1F1F1E" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`
  return svg.length <= MAX_CARACTERES ? svg : null
}
