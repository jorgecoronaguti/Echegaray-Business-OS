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

export type SubVista = 'gantt' | 'lista' | 'tablero' | 'proximos'

export const SUBVISTAS: { id: SubVista; label: string }[] = [
  { id: 'gantt', label: 'Gantt' },
  { id: 'lista', label: 'Lista' },
  { id: 'tablero', label: 'Tablero' },
  { id: 'proximos', label: 'Próximos' },
]

export const esSubVista = (v: string | undefined): v is SubVista =>
  SUBVISTAS.some((s) => s.id === v)
