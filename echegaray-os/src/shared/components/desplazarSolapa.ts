// CUÁNTO CORRER LA BARRA DE SOLAPAS PARA QUE SE VEA LA ACTIVA.
//
// A 390px la barra de nivel 1 no entra entera (`barra-corrible` la hace deslizable) y la solapa activa
// de la cuarta área, Analíticas, quedaba del otro lado del borde: estabas en una pantalla cuyo nombre
// no se veía (auditoría 17/09/2026, D7). Pura, para que `node --test` la mire: el efecto del header
// sólo lee medidas y aplica lo que esto devuelve.

export interface Medidas {
  /** Ancho visible de la barra. */
  ancho: number
  /** `scrollLeft` actual. */
  scroll: number
  /** Borde izquierdo de la solapa medido desde el inicio del contenido de la barra (no del viewport). */
  izquierda: number
  anchoSolapa: number
}

/** El `scrollLeft` nuevo, o `null` si la solapa ya se ve entera: no se mueve nada que no haga falta. */
export function scrollParaMostrar(m: Medidas, margen = 16): number | null {
  const derecha = m.izquierda + m.anchoSolapa
  if (m.izquierda >= m.scroll && derecha <= m.scroll + m.ancho) return null
  if (m.izquierda < m.scroll) return Math.max(0, m.izquierda - margen)
  return derecha - m.ancho + margen
}
