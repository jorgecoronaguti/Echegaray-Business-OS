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
const anchoActual = () => window.innerWidth
/** En el servidor no hay ventana: se asume escritorio, que es donde nacieron estas pantallas. La
 *  primera pintura del navegador corrige el valor sin parpadeo perceptible. */
const anchoServidor = () => 1600

export function useAnchoVentana(): number {
  return useSyncExternalStore(suscribirAncho, anchoActual, anchoServidor)
}
