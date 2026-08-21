// CÓMO SE ORDENA UNA TABLA DEL OS — el núcleo, sin saber de qué habla la tabla.
//
// ═══ POR QUÉ SUBIÓ A `shared/` (21/08/2026) ═══
//
// Vivía en `features/obras/services/ordenObras.ts` con los campos del portafolio adentro, y las
// tres decisiones de abajo no son del portafolio: son de CUALQUIER tabla del OS. Cada tabla que se
// escribiera aparte volvería a decidirlas, casi siempre distinto, y la primera que se equivoque va
// a poner arriba justamente lo que nadie cargó.
//
//   1. **Lo que no está cargado va último, SIEMPRE — también al invertir.** Un nulo no compite: se
//      va al fondo y espera. Si compitiera, ordenar por importe descendente pondría arriba las
//      filas vacías, que es al revés de lo que busca el que ordena.
//   2. **El empate lo desempata un criterio final.** Sin orden total, dos filas iguales se
//      intercambian entre corridas y la tabla "parpadea" al recargar.
//   3. **Cada campo abre con la dirección que contesta la pregunta**: los textos de la A a la Z,
//      los números y el riesgo de mayor a menor.
//
// Núcleo puro: entra un arreglo y sale otro. Sin React, sin base y sin el reloj.

export type Direccion = 'asc' | 'desc'

/** El valor por el que se compara una fila. `null` = sin cargar. */
export type ValorOrden = string | number | null

/**
 * La dirección con la que hay que abrir un campo, o la contraria si ya está abierto.
 * `primera` la decide el dominio: sólo él sabe si su campo es un texto o un riesgo.
 */
export function proximaDireccion<C extends string>(
  campo: C, campoActual: C | null, dirActual: Direccion | null, primera: (c: C) => Direccion,
): Direccion {
  if (campo !== campoActual || !dirActual) return primera(campo)
  return dirActual === 'asc' ? 'desc' : 'asc'
}

/**
 * Ordena una COPIA. No muta el arreglo que recibe: el que llega suele ser el de la lectura
 * compartida, y otras partes de la pantalla lo siguen usando.
 */
export function ordenarPor<T>(
  filas: readonly T[],
  valorDe: (f: T) => ValorOrden,
  dir: Direccion,
  desempate: (f: T) => string,
): T[] {
  const copia = [...filas]
  const signo = dir === 'asc' ? 1 : -1
  return copia.sort((a, b) => {
    const va = valorDe(a)
    const vb = valorDe(b)
    // EL NULO NO COMPITE: va al fondo en las dos direcciones. Ver la decisión 1 de la cabecera.
    if (va === null && vb === null) return desempate(a).localeCompare(desempate(b), 'es-AR')
    if (va === null) return 1
    if (vb === null) return -1
    const cmp = typeof va === 'string' && typeof vb === 'string'
      ? va.localeCompare(String(vb), 'es-AR', { sensitivity: 'base' })
      : Number(va) - Number(vb)
    if (cmp !== 0) return cmp * signo
    return desempate(a).localeCompare(desempate(b), 'es-AR')
  })
}
