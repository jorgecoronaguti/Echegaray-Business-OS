// LAS SOLAPAS DEL PANEL DE LA TAREA (04) — módulo NEUTRAL: las necesita el workspace (server,
// para resolver la URL) y el panel (cliente, para dibujarlas). Un valor exportado desde un archivo
// `'use client'` no cruza esa frontera; ver `subvistas.ts`.
//
// ═══ SEIS SOLAPAS, LAS DEL DESIGN 23/08 (04 · Tarea Panel lateral) ═══
//
//   Resumen · Avance · Dependencias · Rendimiento · Historial · Documentos
//
// «General» pasó a llamarse Resumen y ABSORBE Recursos (las filas Cuadrilla/Equipos/Dotación con su
// detalle plegado) y Subcontrato (una fila cuando la actividad es de un tercero): eran solapas para
// datos que el 04 muestra como filas del resumen. Las URLs viejas siguen abriendo donde abrían.

export const SOLAPAS = [
  ['resumen', 'Resumen'],
  ['avance', 'Avance'],
  ['dependencias', 'Dependencias'],
  ['rendimiento', 'Rendimiento'],
  ['historial', 'Historial'],
  ['documentos', 'Documentos'],
] as const

export type Solapa = (typeof SOLAPAS)[number][0]

export function esSolapa(v: unknown): v is Solapa {
  return typeof v === 'string' && SOLAPAS.some(([id]) => id === v)
}

/** Las solapas retiradas: sus URLs caen donde su contenido vive hoy. */
const ALIAS: Record<string, Solapa> = {
  general: 'resumen',
  recursos: 'resumen',
  subcontrato: 'resumen',
}

export function resolverSolapa(v: string | undefined | null, porDefecto: Solapa = 'resumen'): Solapa {
  if (esSolapa(v)) return v
  return (v && ALIAS[v]) || porDefecto
}
