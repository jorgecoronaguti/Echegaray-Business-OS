// EL MODO DE «CREAR LA ESTRUCTURA», SIN 'use client'. Lo lee la página (Server Component) para
// decidir qué monta, y lo leen los componentes de cliente. Vivía dentro de `Estructura.tsx`, que es
// un módulo de cliente: importar una FUNCIÓN desde un módulo 'use client' en un Server Component
// entrega una referencia de cliente, y llamarla en el servidor rompe la página entera (producción
// 23/09/2026: «No se pudo cargar la ficha de la obra · Minified React error #441» en toda obra).

export type ModoCrear = 'presupuesto' | 'planilla' | 'mano'
export type PanelEstructura = 'ponderacion' | 'frentes' | 'subtareas'

export interface ModoEstructura {
  crear: ModoCrear | null
  panel: PanelEstructura | null
  act: string | null
  sel: boolean
  /** El padre del ítem nuevo (`?nuevo=<id>` · `raiz`). */
  nuevo: string | null
}

export function esModoEstructura(m: ModoEstructura): boolean {
  // B07: la ponderación de la obra entera no mira un ítem (`?panel=ponderacion` sin `act`).
  return m.crear != null || m.panel === 'ponderacion' || (m.panel != null && m.act != null) || m.sel
}
