// LAS CUATRO MAGNITUDES DE LA PRODUCCIÓN — una sola definición para todo el OS.
//
// ═══ POR QUÉ EXISTE ESTE ARCHIVO ═══
//
// Hasta el 22/08/2026 la pantalla llamaba RENDIMIENTO a 36,5 hs/m³. No lo es, y no es una discusión
// de vocabulario: 36,5 hs/m³ es un ESFUERZO, y un esfuerzo **mejora cuando baja**. Un rendimiento
// mejora cuando sube. Con el rótulo equivocado, «el rendimiento subió de 30 a 36,5» se lee como una
// buena noticia cuando es exactamente lo contrario — la tarea pasó a costar un 22 % más de mano de
// obra. Ese es el número con el que se cotiza.
//
// Las cuatro son magnitudes DISTINTAS y contestan preguntas distintas:
//
//   ESFUERZO               hs/unidad        ¿cuánta mano de obra pide una unidad?   ↓ mejor
//   PRODUCTIVIDAD          unidad/hs        ¿cuánto sale de una hora?               ↑ mejor
//   PRODUCCIÓN DE CUADRILLA unidad/jornada  ¿cuánto hace esta cuadrilla en un día?  ↑ mejor
//   DURACIÓN               días             ¿cuánto tarda el trabajo?               ↓ mejor
//
// Las dos primeras son propiedades de la TAREA (viven en la base maestra y cotizan todas las
// obras). Las dos últimas no existen sin una obra: dependen de la dotación, de la jornada y del
// calendario, y por eso la base maestra no las puede mostrar sin inventarlas.
//
// La DURACIÓN no se calcula acá: ya vive en `features/obras/services/panelTarea.ts` (`duracionDias`),
// que además sabe de tiempo técnico y de tope de frente. Duplicarla sería tener dos plazos para la
// misma actividad.

/** Cómo se rotula cada magnitud, y con qué unidad. Los rótulos salen de acá y no de cada pantalla:
 *  el día que el dueño quiera otra palabra, se cambia una vez. */
export const MAGNITUD = {
  esfuerzo: { rotulo: 'Esfuerzo', unidad: (u: string | null) => `hs/${u ?? 'un'}` },
  productividad: { rotulo: 'Productividad', unidad: (u: string | null) => `${u ?? 'un'}/hs` },
  produccion: { rotulo: 'Producción de cuadrilla', unidad: (u: string | null) => `${u ?? 'un'}/jornada` },
  duracion: { rotulo: 'Duración', unidad: () => 'días' },
} as const

/**
 * PRODUCTIVIDAD = 1 / ESFUERZO. Es la misma medición leída al derecho.
 *
 * `null` cuando el esfuerzo no está cargado, y también cuando es 0: un esfuerzo de cero horas diría
 * que la tarea no lleva mano de obra, y dividir por él publicaría un infinito con cara de dato.
 */
export function productividad(esfuerzoHsPorUnidad: number | null): number | null {
  if (esfuerzoHsPorUnidad == null || esfuerzoHsPorUnidad <= 0) return null
  return 1 / esfuerzoHsPorUnidad
}

/**
 * PRODUCCIÓN DE CUADRILLA = capacidad × jornada / esfuerzo, en unidades por jornada.
 *
 * La CAPACIDAD y no la cantidad de cabezas: dos oficiales y dos ayudantes son cuatro personas y 3,2
 * de capacidad (`cuadrilla_capacidad`). Contar cabezas deja la producción un 20 % optimista, que es
 * el mismo error que ya estaba medido en el cálculo de duración.
 *
 * `null` si falta cualquiera de los tres: una producción estimada sobre un supuesto no declarado no
 * se distingue de una medida.
 */
export function produccionDeCuadrilla(
  esfuerzoHsPorUnidad: number | null,
  capacidadCuadrilla: number | null,
  jornadaHoras: number | null,
): number | null {
  if (esfuerzoHsPorUnidad == null || esfuerzoHsPorUnidad <= 0) return null
  if (capacidadCuadrilla == null || capacidadCuadrilla <= 0) return null
  if (jornadaHoras == null || jornadaHoras <= 0) return null
  return (capacidadCuadrilla * jornadaHoras) / esfuerzoHsPorUnidad
}

/**
 * EL ESFUERZO OBSERVADO de un trabajo ya hecho: horas imputadas sobre cantidad ejecutada.
 *
 * Necesita LAS DOS PUNTAS. Con horas y sin producción física el cociente sería infinito; con
 * producción y sin horas, cero — y cero horas por metro cúbico es la afirmación de que la tarea no
 * lleva mano de obra. Las dos son mentiras con formato de número.
 */
export function esfuerzoObservado(
  hhReal: number | null, cantidadEjecutada: number | null,
): number | null {
  if (hhReal == null || hhReal <= 0) return null
  if (cantidadEjecutada == null || cantidadEjecutada <= 0) return null
  return hhReal / cantidadEjecutada
}
