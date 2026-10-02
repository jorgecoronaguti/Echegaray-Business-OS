// DÓNDE VA EL PANEL DEL PUNTO AMARILLO. Pura, para poder probarla sin navegador.
//
// Se calcula contra la VENTANA y se dibuja con `position: fixed`: la tabla de Liquidación tiene scroll horizontal y
// cada celda corta lo que desborda (`overflow: hidden`), así que un panel `absolute` pegado al punto se cortaría
// justo donde más se necesita leerlo. A 390 px, además, el ancho de la ventana es lo único que manda.
//
// ═══ EL ÁREA VISIBLE ES LA QUE QUEDA ENTRE LAS DOS BARRAS (QA 02/10/2026) ═══
//
// En el teléfono el cuadro se abría bajo la cabecera de la app y tras la barra inferior: parte del contenido quedaba
// detrás de una barra y el resto bajo un scroll interno que no hacía falta. `reservaArriba` y `reservaAbajo` recortan
// la ventana a la zona donde se puede leer; el alto máximo es esa zona y sólo scrollea por dentro si de verdad no entra.
//
// ═══ EN PC, AL COSTADO (`preferirCostado`) ═══
//
// Abierto encima o debajo del punto, el cuadro tapaba los importes de las filas vecinas de la MISMA columna. Al costado
// de la celda tapa otras columnas de esa fila y no la columna que se está comparando.

/** Aire contra el borde de la ventana: 8 px, la grilla del sistema. */
export const MARGEN = 8
/** Separación entre el punto y el panel. */
export const SEPARACION = 4

export interface Rect { left: number; right: number; top: number; bottom: number }

export interface Ubicacion {
  left: number
  top: number
  ancho: number
  /** Alto hasta el que crece antes de scrollear por dentro. */
  altoMaximo: number
  arriba: boolean
  lado: 'costado' | 'vertical'
}

export function ubicarPanel({ ancla, ventana, panel, preferirCostado = false }: {
  ancla: Rect
  /** `reservaArriba`/`reservaAbajo`: píxeles que otra barra fija ya ocupa (cabecera de la app, navegación del teléfono). */
  ventana: { ancho: number; alto: number; reservaAbajo?: number; reservaArriba?: number }
  panel: { ancho: number; alto: number }
  preferirCostado?: boolean
}): Ubicacion {
  const ancho = Math.min(panel.ancho, ventana.ancho - 2 * MARGEN)
  const zonaArriba = (ventana.reservaArriba ?? 0) + MARGEN
  const zonaAbajo = ventana.alto - (ventana.reservaAbajo ?? 0) - MARGEN
  const altoZona = Math.max(0, zonaAbajo - zonaArriba)

  // Al costado: a la derecha del punto si entra entero, si no a la izquierda; alineado al renglón del punto y
  // desplazado lo justo para no salirse de la zona visible.
  if (preferirCostado) {
    const aLaDerecha = ancla.right + SEPARACION + ancho <= ventana.ancho - MARGEN
    const aLaIzquierda = ancla.left - SEPARACION - ancho >= MARGEN
    if (aLaDerecha || aLaIzquierda) {
      const alto = Math.min(panel.alto, altoZona)
      const top = Math.max(zonaArriba, Math.min(ancla.top, zonaAbajo - alto))
      const left = aLaDerecha ? ancla.right + SEPARACION : ancla.left - SEPARACION - ancho
      return { left, top, ancho, altoMaximo: zonaAbajo - top, arriba: false, lado: 'costado' }
    }
  }

  // CENTRADO EN EL PUNTO Y LUEGO ENCERRADO EN LA VENTANA.
  const centro = (ancla.left + ancla.right) / 2
  const left = Math.max(MARGEN, Math.min(centro - ancho / 2, ventana.ancho - ancho - MARGEN))
  const lugarAbajo = zonaAbajo - ancla.bottom - SEPARACION
  const lugarArriba = ancla.top - SEPARACION - zonaArriba
  // ABAJO SI ENTRA; SI NO, ARRIBA SI ENTRA.
  if (panel.alto <= lugarAbajo) return { left, top: ancla.bottom + SEPARACION, ancho, altoMaximo: lugarAbajo, arriba: false, lado: 'vertical' }
  if (panel.alto <= lugarArriba) return { left, top: ancla.top - SEPARACION - panel.alto, ancho, altoMaximo: lugarArriba, arriba: true, lado: 'vertical' }
  // NO ENTRA NI ARRIBA NI ABAJO: se usa la zona visible entera (tapando el punto, que ya se tocó) y sólo scrollea por
  // dentro si ni así alcanza. Quedarse pegado al punto con 80 px de alto mostraba un cuadro casi vacío.
  const top = Math.max(zonaArriba, Math.min(ancla.top, zonaAbajo - Math.min(panel.alto, altoZona)))
  return { left, top, ancho, altoMaximo: zonaAbajo - top, arriba: false, lado: 'vertical' }
}
