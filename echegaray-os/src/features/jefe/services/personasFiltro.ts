// J05 · LOS CHIPS DE «QUIÉN ESTÁ HOY» — qué parte del plantel estoy mirando.
//
// ═══ POR QUÉ NO HAY UN CHIP «AUSENTES» ═══
//
// Es la regla entera de esta pantalla, y por eso vive en el código y no en un comentario de la
// vista: **«sin fichar» no es «ausente»**. Un operario sin teléfono, uno que no le dio permiso al
// GPS y uno que faltó de verdad se ven EXACTAMENTE IGUAL desde acá — el sistema no sabe cuál es
// cuál, sabe que no hay marca. Un chip rotulado «Ausentes» convertiría esa ignorancia en una
// acusación, y encima en una que después se usa para liquidar. La falta la declara una persona, en
// Administración, donde eso sí es una novedad.
//
// ═══ EL CONTADOR ES DE FILAS QUE SE VEN, NO DE PERSONAS QUE HAY ═══
//
// «Sin fichar 0» significa «ninguna fila para mostrar», no «no falta nadie»: si la obra no tiene
// plantel asignado, nadie puede aparecer como sin fichar porque no hay contra qué comparar. Ese
// hueco lo declara la tarjeta de arriba de la pantalla con un guión, no este contador — mezclar las
// dos cosas es lo que hace que un cero se lea como un hecho verificado.

export type FiltroPersonas = 'todos' | 'fichados' | 'sin-fichar'

export const FILTROS_PERSONAS: readonly FiltroPersonas[] = ['todos', 'fichados', 'sin-fichar']

export const FILTRO_PERSONAS_LABEL: Record<FiltroPersonas, string> = {
  todos: 'Todos',
  fichados: 'Fichados',
  // NO «Ausentes». Ver arriba: no es una preferencia de redacción, es la diferencia entre un dato y
  // una acusación fabricada.
  'sin-fichar': 'Sin fichar',
}

/** Cuántas filas deja ver cada chip. `todos` es la suma porque los dos bloques son disjuntos: una
 *  persona con marca no puede estar además en la lista de los que no marcaron. */
export function conteoPersonas(
  fichados: number, sinFichar: number,
): Record<FiltroPersonas, number> {
  return { todos: fichados + sinFichar, fichados, 'sin-fichar': sinFichar }
}

/** Si el bloque de los que ficharon —las cuadrillas— entra en este filtro. */
export const muestraFichados = (f: FiltroPersonas) => f !== 'sin-fichar'

/** Si el bloque de los que no tienen marca entra en este filtro. */
export const muestraSinFichar = (f: FiltroPersonas) => f !== 'fichados'

/**
 * Si el filtro elegido deja la pantalla vacía y hay que decirlo.
 *
 * Un filtro que abre en blanco se lee como «no hay nadie en la obra», que es una afirmación sobre el
 * mundo que nadie hizo. Se distingue del vacío real —nadie marcó y no hay plantel— porque en este
 * caso alcanza con tocar otro chip.
 */
export function vacioPorFiltro(f: FiltroPersonas, fichados: number, sinFichar: number): boolean {
  return conteoPersonas(fichados, sinFichar)[f] === 0 && fichados + sinFichar > 0
}
