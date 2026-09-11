// A QUÉ OBRA SE LE IMPUTA UN DÍA QUE TODAVÍA NO EXISTE.
//
// ═══ POR QUÉ ESTO ES UNA FUNCIÓN PURA Y NO UN `?? ` DENTRO DE LA ACCIÓN ═══
//
// Porque mueve COSTO DE MANO DE OBRA. Una hora cargada en la obra equivocada sale del margen de una
// obra y entra al de otra, y nadie lo ve hasta el cierre económico. La regla tiene que poder ponerse
// en rojo sin levantar una base: los casos que importan —la persona con asignación vigente, la que
// tiene dos asignaciones abiertas el mismo día, la que no tiene ninguna pero sí historial, la que no
// tiene nada— son cuatro tests de milisegundos.
//
// ═══ LA CELDA VACÍA DE LA PLANILLA ES LA QUE EL DUEÑO TECLEA ═══
//
// Hasta hoy la grilla sólo dejaba CORREGIR un día que ya existía (`edicionDeGrillaHoras.ts`), y un
// día sin cargar mandaba al panel «porque crear un registro exige decir a qué obra se imputa». En la
// planilla JORNALES ese gesto es el normal: se escribe el 8 en la celda del martes y la obra es la
// que dice la fila. Acá la obra se DEDUCE de lo que el OS ya sabe de esa persona, y la deducción se
// declara en la pantalla y en el acuse — nunca se elige en silencio.
//
// ═══ Y CUANDO NO SE PUEDE DEDUCIR, NO SE ADIVINA ═══
//
// Dos asignaciones abiertas el mismo día son dos candidatas igual de válidas: elegir la primera
// sería exactamente lo que esta función existe para no hacer. Se devuelve el motivo y la pantalla
// manda al panel, que pregunta.

/** Un tramo de `obra_asignacion`. `hasta` nulo es «sigue abierto». */
export interface AsignacionDeObra {
  obraId: string
  desde: string
  /** `null` = tramo abierto. No es «hasta hoy»: es «todavía no terminó». */
  hasta: string | null
}

/** Una fila de `registros_hh` que ya tiene obra. Las ausencias no la llevan y no sirven de pista. */
export interface DiaYaImputado {
  fecha: string
  obraId: string
}

export type MotivoDeObra = 'asignacion' | 'ultima-obra' | 'proxima-obra'

export type ObraDelDia =
  | { ok: true; obraId: string; porque: MotivoDeObra }
  | { ok: false; porque: 'varias-asignaciones' | 'sin-obra-conocida' }

/** ¿Ese tramo cubre el día? `desde` inclusive, `hasta` inclusive, abierto si no hay `hasta`. */
const cubre = (a: AsignacionDeObra, fecha: string): boolean =>
  a.desde <= fecha && (a.hasta == null || fecha <= a.hasta)

/**
 * LA OBRA DE ESE DÍA, EN EL ORDEN EN QUE LA EVIDENCIA MANDA.
 *
 *   1. LA ASIGNACIÓN VIGENTE ESE DÍA. Es una decisión que alguien tomó con fecha: le gana a
 *      cualquier deducción. Si hay más de una abierta, no se elige.
 *   2. LA ÚLTIMA OBRA CONOCIDA ANTES DE ESE DÍA. Es la pista más fuerte que queda: una cuadrilla no
 *      cambia de obra porque alguien cargue una hora.
 *   3. LA PRIMERA OBRA CONOCIDA DESPUÉS. Sólo cuando no hay pasado — cargar el primer día de una
 *      persona cuya obra ya está imputada los días siguientes. Se distingue del caso 2 porque la
 *      pantalla lo dice con otras palabras: mirar hacia adelante es una deducción más débil.
 *
 * Las tres se devuelven con su `porque`, y la pantalla lo publica. Una imputación sin origen a la
 * vista no se puede discutir con nadie.
 */
export function obraParaElDia(
  fecha: string,
  asignaciones: readonly AsignacionDeObra[],
  diasYaImputados: readonly DiaYaImputado[],
): ObraDelDia {
  const vigentes = [...new Set(asignaciones.filter((a) => cubre(a, fecha)).map((a) => a.obraId))]
  if (vigentes.length === 1) return { ok: true, obraId: vigentes[0], porque: 'asignacion' }
  if (vigentes.length > 1) return { ok: false, porque: 'varias-asignaciones' }

  const antes = diasYaImputados.filter((d) => d.fecha <= fecha)
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
  if (antes.length > 0) {
    return { ok: true, obraId: antes[antes.length - 1].obraId, porque: 'ultima-obra' }
  }
  const despues = diasYaImputados.filter((d) => d.fecha > fecha)
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
  if (despues.length > 0) return { ok: true, obraId: despues[0].obraId, porque: 'proxima-obra' }

  return { ok: false, porque: 'sin-obra-conocida' }
}

/** Lo que la pantalla y el acuse escriben sobre de dónde salió la obra. Nunca queda muda. */
export const TEXTO_DE_MOTIVO: Record<MotivoDeObra, string> = {
  asignacion: 'la obra asignada ese día',
  'ultima-obra': 'la última obra en la que estuvo',
  'proxima-obra': 'la primera obra que tiene cargada después de ese día',
}

/** Por qué NO se pudo deducir, con lo que hay que hacer. Un error sin salida obliga a adivinar. */
export const TEXTO_SIN_OBRA: Record<'varias-asignaciones' | 'sin-obra-conocida', string> = {
  'varias-asignaciones':
    'Tiene más de una obra asignada ese día: no elijo por vos. Cargalo desde el panel de la persona.',
  'sin-obra-conocida':
    'No sé a qué obra imputarle ese día: no tiene obra asignada ni horas cargadas en ninguna. '
    + 'Asignala a una obra y volvé a intentar.',
}
