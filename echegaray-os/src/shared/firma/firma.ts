// LA FIRMA CON EL DEDO — lo que se decide del trazo, sin canvas ni React.
//
// El componente junta puntos; acá se decide si eso es una firma y cómo se guarda. Se guarda como un
// SVG chico y autocontenido (`<svg viewBox…><path d="M… L…"/></svg>`): se puede dibujar tal cual en
// cualquier pantalla o PDF, pesa pocos kB, y no depende de la resolución del teléfono que firmó.
//
// Vale como conformidad interna (dueño, 22/09): conviven esta firma y el papel firmado.

export interface Punto { x: number; y: number }
export type Trazo = Punto[]

/** Menos que esto es un toque, no una firma. Medido contra un garabato mínimo de dos letras. */
export const MIN_PUNTOS = 12
/** La firma tiene que ocupar algo del recuadro, no un punto en una esquina. */
export const MIN_LADO = 40
/** Tope del texto que viaja a la base: una firma real con coordenadas enteras queda muy por debajo. */
export const MAX_CARACTERES = 60_000

/**
 * ¿ES UNA FIRMA O UN TOQUE?
 *
 * Tres condiciones: puntos suficientes, un recuadro que no sea un punto, y algo de recorrido. Confirmar
 * con el recuadro en blanco —o con un toque sin querer— dejaría una conformidad sin trazo, que es lo
 * que la base rechaza con «falta la firma»; mejor que el botón no se encienda.
 */
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
      // Un trazo de un solo punto se dibuja como un punto: una «i» también es firma.
      if (!resto.length) return `M${p0.x} ${p0.y}l0 0`
      return `M${p0.x} ${p0.y}` + resto.map((p) => `L${p.x} ${p.y}`).join('')
    })
    .join('')
}

/**
 * EL SVG QUE SE GUARDA en `efectivo_entrega.conformidad_trazo`.
 *
 * `null` cuando no es firma o cuando se pasa del tope: la pantalla lo trata como «firmá de nuevo», y
 * así nunca viaja a la base algo que ella misma tendría que rechazar.
 */
export function svgDeFirma(trazos: readonly Trazo[], ancho: number, alto: number): string | null {
  if (!firmaValida(trazos)) return null
  const d = pathDeTrazos(trazos)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${Math.round(ancho)} ${Math.round(alto)}">` +
    `<path d="${d}" fill="none" stroke="#1F1F1E" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`
  return svg.length <= MAX_CARACTERES ? svg : null
}

/** Lo mismo que mira la acción del servidor: un SVG con un path, no cualquier texto. */
export function esTrazoGuardable(s: string): boolean {
  return s.length > 0 && s.length <= MAX_CARACTERES && /^<svg [^>]*viewBox="0 0 \d+ \d+">/.test(s)
    && /<path d="M[\d ML l-]+"/.test(s) && s.endsWith('</svg>')
}
