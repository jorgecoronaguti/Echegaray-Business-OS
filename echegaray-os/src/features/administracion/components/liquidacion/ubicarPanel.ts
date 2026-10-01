// DÓNDE VA EL PANEL DEL PUNTO ÁMBAR. Pura, para poder probarla sin navegador.
//
// Se calcula contra la VENTANA y se dibuja con `position: fixed`: la tabla de Liquidación tiene scroll horizontal y
// cada celda corta lo que desborda (`overflow: hidden`), así que un panel `absolute` pegado al punto se cortaría
// justo donde más se necesita leerlo. A 390 px, además, el ancho de la ventana es lo único que manda.

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
}

export function ubicarPanel({ ancla, ventana, panel }: {
  ancla: Rect
  ventana: { ancho: number; alto: number }
  panel: { ancho: number; alto: number }
}): Ubicacion {
  const ancho = Math.min(panel.ancho, ventana.ancho - 2 * MARGEN)
  // CENTRADO EN EL PUNTO Y LUEGO ENCERRADO EN LA VENTANA.
  const centro = (ancla.left + ancla.right) / 2
  const left = Math.max(MARGEN, Math.min(centro - ancho / 2, ventana.ancho - ancho - MARGEN))
  const lugarAbajo = ventana.alto - ancla.bottom - SEPARACION - MARGEN
  const lugarArriba = ancla.top - SEPARACION - MARGEN
  // ABAJO SALVO QUE NO ENTRE Y ARRIBA SÍ: leer hacia abajo es lo natural, y subir sólo cuando no queda otra.
  const arriba = panel.alto > lugarAbajo && lugarArriba > lugarAbajo
  const altoMaximo = Math.max(0, arriba ? lugarArriba : lugarAbajo)
  const alto = Math.min(panel.alto, altoMaximo)
  const top = arriba ? ancla.top - SEPARACION - alto : ancla.bottom + SEPARACION
  return { left, top, ancho, altoMaximo, arriba }
}
