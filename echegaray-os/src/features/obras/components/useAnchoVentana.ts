'use client'

import { useSyncExternalStore } from 'react'

// EL ANCHO DE LA VENTANA COMO DATO DE REACT, sin `setState` dentro de un efecto. Las pantallas
// «porte literal» del canon (03, 07, 08) deciden con `window.innerWidth` y no con puntos de corte
// de CSS porque miden en píxeles en línea. Vivía dentro de `TabTareas`; desde el 23/09/2026 lo
// comparten el cronograma y el simulador de dotación, que en el teléfono cambian de medidas.
const suscribirAncho = (cb: () => void) => {
  window.addEventListener('resize', cb)
  return () => window.removeEventListener('resize', cb)
}
// EL ANCHO ES EL DEL DISPOSITIVO, NO EL DE LA VENTANA ALEJADA. En el teléfono el servidor pinta
// escritorio (abajo), el contenido sale de 650–850 px, el navegador se aleja para mostrarlo entero y
// `innerWidth` pasa a valer ese ancho: la pantalla nunca volvía al modo teléfono (capturas 23/09:
// Cartera 656, Gantt 801, Nueva obra 846). `screen.width` es el ancho del dispositivo en px CSS y no
// cambia con el zoom; en escritorio la ventana siempre es igual o más angosta que la pantalla.
const anchoActual = () => Math.min(window.innerWidth, window.screen?.width || window.innerWidth)
/** En el servidor no hay ventana: se asume escritorio, que es donde nacieron estas pantallas. La
 *  primera pintura del navegador corrige el valor sin parpadeo perceptible. */
const anchoServidor = () => 1600

export function useAnchoVentana(): number {
  return useSyncExternalStore(suscribirAncho, anchoActual, anchoServidor)
}
