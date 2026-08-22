// LAS FECHAS DE UNA ACTIVIDAD — el contrato de la vista `actividad_fechas`.
//
// Vive en su propio archivo porque es UN concepto con dueño: la vista. Cuando estas doce líneas
// estaban sueltas dentro de `Actividad`, cada pantalla se servía la que le quedaba a mano y la
// misma obra publicaba dos fines de plan distintos en la misma página.
//
// Las cuatro cosas que NO son la misma:
//
//   LÍNEA BASE  `inicio_base`/`fin_base`   sellada; sin sello no existe, y sin ella no hay desvío.
//   PLAN        `inicio_plan`/`fin_plan`   editable; contra lo que se trabaja hoy.
//   REAL        `inicio_real`/`fin_real`   SÓLO evidencia (parte de avance · imputación de HH), y
//                                          nunca futuro: un real posterior a hoy no es un hecho.
//   FORECAST    `forecast_fin`             calculado al ritmo medido; nunca antes de hoy si sigue
//                                          abierta.

/**
 * EN QUÉ PUNTO DEL TIEMPO ESTÁ UNA ACTIVIDAD, según `actividad_fechas` y nadie más.
 *
 * `terminada` (el trabajo está hecho) · `en_curso` (hay evidencia de trabajo) · `planificada` (hay
 * plan, todavía sin evidencia) · `sin_fecha` (ni plan, ni línea base sellada, ni un parte encima).
 * Es la única definición de SIN FECHA del OS: cada pantalla que inventaba la suya —«no tiene
 * inicio_plan»— dejaba a la misma actividad con fecha en el Gantt y sin fecha en la lista.
 */
export type EstadoFecha = 'sin_fecha' | 'planificada' | 'en_curso' | 'terminada'

/** Lo que `actividad_fechas` agrega a una actividad. Si un campo viene `null`, la respuesta es SIN
 *  FECHA: no se rellena con la de al lado. */
export interface FechasDeActividad {
  /** Lo escrito a mano (o arrastrado del Sheet). NO es `inicio_real`: se rotula «declarado». */
  inicio_real_declarado: string | null
  fin_real_declarado: string | null
  /** De qué evidencia salió: `parte de avance` o `imputación de HH`. */
  origen_inicio_real: string | null
  origen_fin_real: string | null
  /** Cuándo termina al ritmo medido. Nunca anterior a hoy si todavía no terminó. */
  forecast_fin: string | null
  /** Con qué se calculó — CÁLCULO, INFERENCIA o ESTIMACIÓN, con todas las letras. */
  base_del_forecast: string | null
  dias_restantes: number | null
  /** Tiene ALGUNA fecha publicable (plan, línea base sellada o evidencia). */
  tiene_fecha: boolean
  tiene_fecha_plan: boolean
  estado_fecha: EstadoFecha
  /** `fin_plan − fin_base` y `forecast_fin − fin_plan`, en días. */
  desvio_plan_dias: number | null
  desvio_forecast_dias: number | null
}
