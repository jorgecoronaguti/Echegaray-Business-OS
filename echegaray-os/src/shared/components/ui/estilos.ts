// Clases compartidas de formularios, en un módulo SIN 'use client': un Server Component puede
// importar una constante de estilo sin arrastrar un módulo cliente (regla frontera-servidor-cliente).

/** Las clases de un input/select/textarea, en un solo lugar: catorce formularios iguales. */
export const CTRL =
  'mt-1 w-full min-w-0 rounded-control border border-line bg-white px-2 py-1.5 text-[13px] text-ink placeholder:text-faint'
