// LO QUE LA PANTALLA DE PENDIENTES CALCULA SIN PREGUNTARLE A NADIE.
//
// ═══ POR QUÉ LOS CONTADORES SE MUEVEN ANTES DE QUE VUELVA EL SERVIDOR ═══
//
// Resolver un texto es una sola escritura en `obra_alias`, y su efecto sobre el resumen es
// aritmética cerrada: las N filas que decían ese texto dejan de estar «pendientes» y pasan a «a una
// obra» o a «estructura» según lo que la persona acaba de contestar. No hay nada que adivinar.
//
// Eso NO es inventar un dato: es aplicar el efecto de una escritura que el servidor ya confirmó
// con `ok`. Si la escritura falla, no se aplica nada. Y el `router.refresh()` que va detrás pisa
// esta cuenta con la del servidor, así que si alguna vez difirieran, gana la base.
//
// La alternativa era dejar los cinco números quietos hasta que volviera el render del servidor:
// medio segundo en el que la pantalla dice «1 sin resolver» sobre una cola que ya está vacía. Eso
// sí es mostrar un dato falso.

import type { GrupoPendiente, ResumenFuente, TipoFuente } from './imputacionService'

/** Las cuatro respuestas que el servicio acepta — las mismas del enum de `resolverImputacion`.
 *  No hay una quinta, y una que no esté acá la rechaza Zod antes de tocar la base. */
export const CLASIFICACIONES = [
  { clave: 'obra', rotulo: 'Una obra', pideObra: true },
  { clave: 'mantenimiento', rotulo: 'Un mantenimiento', pideObra: true },
  { clave: 'indirecto', rotulo: 'Costo de estructura', pideObra: false },
  { clave: 'excluido', rotulo: 'No corresponde contarlo', pideObra: false },
] as const

export type Clasificacion = (typeof CLASIFICACIONES)[number]['clave']

/** Si esta clasificación necesita una obra destino. Es la misma regla que `actionsImputacion`
 *  vuelve a aplicar del lado del servidor: acá sólo decide qué se dibuja. */
export const pideObra = (c: Clasificacion): boolean =>
  CLASIFICACIONES.find((k) => k.clave === c)?.pideObra ?? false

/** Lo que ya se resolvió en esta sesión de pantalla: la clave y en qué columna cayó. */
export interface Resuelto {
  clave: string
  clasificacion: Clasificacion
}

/** Cuántas filas del grupo salieron de cada fuente. Un mismo texto aparece en más de una. */
export function filasPorTipo(grupo: GrupoPendiente): Partial<Record<TipoFuente, number>> {
  const cuenta: Partial<Record<TipoFuente, number>> = {}
  for (const f of grupo.filas) cuenta[f.tipo] = (cuenta[f.tipo] ?? 0) + 1
  return cuenta
}

/**
 * El resumen de las cuatro fuentes después de aplicar lo que se resolvió sin recargar.
 *
 * `total` y `sin_texto` no se tocan nunca: resolver un texto no crea ni borra filas, y una fila sin
 * texto no la puede resolver ningún alias.
 */
export function resumenTrasResolver(
  resumen: ResumenFuente[], grupos: GrupoPendiente[], resueltos: Resuelto[],
): ResumenFuente[] {
  if (resueltos.length === 0) return resumen
  const porClave = new Map(grupos.map((g) => [g.clave, g]))
  const ajuste = new Map<TipoFuente, { obra: number; estructura: number }>()
  for (const r of resueltos) {
    const g = porClave.get(r.clave)
    if (!g) continue
    const destino = pideObra(r.clasificacion) ? 'obra' : 'estructura'
    for (const [tipo, n] of Object.entries(filasPorTipo(g)) as [TipoFuente, number][]) {
      const a = ajuste.get(tipo) ?? { obra: 0, estructura: 0 }
      a[destino] += n
      ajuste.set(tipo, a)
    }
  }
  return resumen.map((r) => {
    const a = ajuste.get(r.tipo)
    if (!a) return r
    const movidas = a.obra + a.estructura
    return {
      ...r,
      // `Math.max(0, …)` no es defensa decorativa: si el servidor ya devolvió el resumen sin ese
      // pendiente —porque el refresh llegó primero— restarlo otra vez daría un negativo.
      pendiente: Math.max(0, r.pendiente - movidas),
      obra: r.obra + a.obra,
      estructura: r.estructura + a.estructura,
    }
  })
}

/** Los tres tramos de la barra de una fuente, en porcentaje del total. El tramo ámbar nunca baja de
 *  2 % cuando hay algo pendiente: un pendiente sobre 875 filas mide 0,1 px y desaparecería. */
export function segmentosDeFuente(r: ResumenFuente): { obra: string; estructura: string; pendiente: string } {
  const t = r.total
  if (t <= 0) return { obra: '0%', estructura: '0%', pendiente: '0%' }
  const p = r.pendiente > 0 ? Math.max((r.pendiente / t) * 100, 2) : 0
  return {
    obra: `${((r.obra / t) * 100).toFixed(1)}%`,
    estructura: `${((r.estructura / t) * 100).toFixed(1)}%`,
    pendiente: `${p.toFixed(1)}%`,
  }
}

/** El desglose completo de una fuente, para el tooltip de su barra. Los cinco números, siempre:
 *  la barra muestra tres tramos y sin este texto «total» no se puede reconstruir. */
export const desgloseDeFuente = (r: ResumenFuente, etiqueta: string): string =>
  `${etiqueta}: ${r.obra} a una obra · ${r.estructura} estructura · ${r.pendiente} pendiente(s) · `
  + `${r.sin_texto} sin texto · ${r.total} en total`
