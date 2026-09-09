// QUIÉN APARECE EN LA LIQUIDACIÓN DE ESTA QUINCENA — Y QUIÉN NO, SIN QUE NADIE SE BORRE.
//
// Pedido del dueño (09/09/2026, textual): *«solo dejame en plantel quienes estén activos esta
// quincena y sacá a los que no, cuidado con eso»*. El «cuidado» es la parte importante y está en el
// código, no en un comentario: esto NO ESCRIBE NADA. No da de baja, no toca `personas`, no cambia
// `en_la_empresa`. Filtra una lectura y publica cuántos quedaron afuera.
//
// ═══ POR QUÉ EL FILTRO ES UNA UNIÓN DE TRES EVIDENCIAS Y NO UN CAMPO ═══
//
// «Activo» no es un estado guardado: es una conclusión sobre una ventana de tiempo. Una persona está
// activa esta quincena si aparece en alguna de las tres cosas que la empresa hace con ella:
//
//   · le liquidó la quincena anterior (línea en la última cerrada — la fuente que el dueño usa),
//   · le cargó horas o presencia en la quincena en curso,
//   · le acordó una tarifa que empieza dentro de la quincena.
//
// Un campo `activo` habría que mantenerlo a mano y quedaría viejo el día que alguien se olvide; las
// tres evidencias se actualizan solas porque son el trabajo del módulo.
//
// ═══ LOS QUE NO APARECEN NO DESAPARECEN ═══
//
// El contador «N sin actividad esta quincena» existe para que sacar gente de la vista no sea lo
// mismo que perderla. Una lista que se acorta en silencio es indistinguible de una que se rompió.

export interface PersonaDelPlantel {
  id: string
  nombre: string
}

export interface EvidenciaDeActividad {
  /** `persona_id` con línea en la última quincena CERRADA. */
  conLineaEnLaAnterior: ReadonlySet<string>
  /** `persona_id` con al menos un registro de horas en la quincena en curso. */
  conHoras: ReadonlySet<string>
  /** `persona_id` con presencia declarada (presente, ausente o licencia) en la quincena. */
  conAsistencia: ReadonlySet<string>
  /** `persona_id` con una tarifa cuyo `desde` cae dentro de la quincena. */
  conTarifaNueva: ReadonlySet<string>
}

export interface PlantelDeLaQuincena<P extends PersonaDelPlantel> {
  activas: P[]
  /** Los que no aparecen. Se devuelven enteros, no contados: el enlace «verlas» los necesita. */
  sinActividad: P[]
}

/**
 * PARTE EL PLANTEL EN DOS. Ni una escritura, y por eso se puede correr en cada carga de pantalla.
 */
export function plantelDeLaQuincena<P extends PersonaDelPlantel>(
  personas: readonly P[], e: EvidenciaDeActividad,
): PlantelDeLaQuincena<P> {
  const activa = (id: string): boolean =>
    e.conLineaEnLaAnterior.has(id) || e.conHoras.has(id)
    || e.conAsistencia.has(id) || e.conTarifaNueva.has(id)
  return {
    activas: personas.filter((p) => activa(p.id)),
    sinActividad: personas.filter((p) => !activa(p.id)),
  }
}

export interface TarifaHeredada {
  personaId: string
  valorHora: number
  desde: string
  origen: string
}

/** Una línea de la última quincena cerrada: la única fuente del $/h que el dueño quiere heredar. */
export interface LineaDeLaAnterior {
  personaId: string
  valorHora: number | null
}

export const ORIGEN_HEREDADO = 'jornales · quincena anterior'

/**
 * EL $/h QUE ARRANCA LA QUINCENA NUEVA: EL DE LA ANTERIOR.
 *
 * Dueño, 09/09/2026: *«los precios por hora que tenés que poner esta quincena son los que salen de
 * la anterior»*. No es una estimación: es el precio acordado que se pagó quince días atrás, y es la
 * única forma de que Alaniz, Castillo y Zogbe —hoy «sin tarifa» en la pantalla— dejen de estar sin
 * precio sin que nadie invente un número.
 *
 * `desde` es el PRIMER DÍA DE LA QUINCENA EN CURSO y no la fecha de hoy, porque `tarifaVigenteAl`
 * elige por fecha: sembrada al 9 de septiembre, la quincena que arrancó el 1 la vería como futura y
 * seguiría liquidando sin tarifa hasta el día 9.
 *
 * Una línea sellada en `valor_hora` NULL no hereda nada: heredar un NULL escribiría una tarifa que
 * el CHECK de la base rechaza, y forzarla a cero liquidaría a esa persona en $ 0.
 */
export function tarifasHeredadas(
  lineas: readonly LineaDeLaAnterior[], desdeLaQuincenaEnCurso: string,
): TarifaHeredada[] {
  const porPersona = new Map<string, number>()
  for (const l of lineas) {
    if (l.valorHora == null || !(l.valorHora > 0)) continue
    porPersona.set(l.personaId, l.valorHora)
  }
  return [...porPersona].map(([personaId, valorHora]) => ({
    personaId, valorHora, desde: desdeLaQuincenaEnCurso, origen: ORIGEN_HEREDADO,
  }))
}
