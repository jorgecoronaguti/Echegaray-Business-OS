// LOS SUBS DE OPERACIÓN — módulo puro (sin `@/`), probado con `node --test`.
//
// CLIMA DEJA DE SER SUB-SOLAPA (diseño ERP Obras aprobado, 23/09/2026 · H1): los once tipos siguen en
// `obra_restriccion.tipo` —clima incluido como DATO— y se miran en Impedimentos, que es donde frenan la
// obra. `?sub=clima` cae en Impedimentos por `SUB_LEGACY`, no en silencio.
export const SUBS_OPERACION = ['impedimentos', 'pedidos', 'equipos', 'compras'] as const
export type SubOperacion = (typeof SUBS_OPERACION)[number]

/**
 * Las URLs viejas siguen andando. `?sub=herramientas` y `?sub=movimientos` están en marcadores, en
 * enlaces pegados en Mattermost y en los tests de navegador: caer al sub por defecto dejaría a
 * alguien mirando Impedimentos convencido de que su enlace apuntaba ahí.
 */
const SUB_LEGACY: Record<string, SubOperacion> = { herramientas: 'equipos', movimientos: 'equipos', clima: 'impedimentos' }

/** El sub que pide la URL, o el primero. Único lugar donde se traduce el query string. */
export function subDeLaUrl(sub: string | undefined): SubOperacion {
  if (!sub) return SUBS_OPERACION[0]
  return SUBS_OPERACION.find((x) => x === sub) ?? SUB_LEGACY[sub] ?? SUBS_OPERACION[0]
}

