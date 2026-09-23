// Clases compartidas de formularios, en un módulo SIN 'use client': un Server Component puede
// importar una constante de estilo sin arrastrar un módulo cliente (regla frontera-servidor-cliente).

/** Las clases de un input/select/textarea, en un solo lugar: catorce formularios iguales. */
// EN EL TELÉFONO EL CONTROL MIDE 48 (dueño, 23/09/2026: vistas mobile por nivel): `py-1.5` daba ~30 px,
// que con el pulgar se falla. Bajo `md` toma el alto del token del teléfono y 16 px de letra, que es
// el mínimo con el que iOS no hace zoom al enfocar. En escritorio no cambia nada.
export const CTRL =
  'mt-1 w-full min-w-0 rounded-control border border-line bg-white px-2 py-1.5 text-[13px] text-ink placeholder:text-faint max-md:min-h-control-movil max-md:text-[16px]'
