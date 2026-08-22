// LAS CUATRO MANERAS DE MIRAR EL PLAN. Módulo NEUTRAL a propósito: sin `'use client'`.
//
// ═══ POR QUÉ NO VIVE EN `TabCronograma.tsx` ═══
//
// Vivía ahí, y la página —que es un Server Component— lo importaba para validar la query `sub`. Eso
// COMPILA, pasa el typecheck y pasa el build, y explota en producción con
// `SUBVISTAS.some is not a function`: lo que cruza la frontera de React Server Components desde un
// módulo `'use client'` no es el valor, es una referencia al módulo cliente. Los componentes se
// proxean; un array no.
//
// La regla que deja esto: un dato que necesitan las dos orillas no puede vivir en un archivo
// `'use client'`. Vive en uno neutral y lo importan las dos.

// ═══ LISTA, TABLERO Y PRÓXIMOS SE RETIRARON (22/08/2026 · overhaul UX) ═══
//
// Eran cuatro representaciones del MISMO dataset compitiendo por el mismo lugar, y el dueño pidió
// eliminar la redundancia: «las vistas son VISTAS, no módulos distintos». Queda el Cronograma
// (tabla + Gantt + panel), que es el único que mostraba algo que el árbol de Tareas no muestra.
// Las URLs viejas (`?sub=lista|tablero|proximos`) caen acá vía el alias de `vistasObra.ts`.
export type SubVista = 'gantt'

export const SUBVISTAS: { id: SubVista; label: string }[] = [
  { id: 'gantt', label: 'Cronograma' },
]

/** La ventana de «próximas semanas» de la franja del cronograma. */
export type Ventana = '1' | '2' | '6'

export const esSubVista = (v: string | undefined): v is SubVista =>
  SUBVISTAS.some((s) => s.id === v)
