// LA JORNADA DE OBRA — CUÁNTAS HORAS SE DEBEN POR DÍA, Y POR QUÉ NO SON OCHO.
//
// ═══ LA RESPUESTA DEL DUEÑO (27/08/2026) ═══
//
// *"9 h de lunes a jueves y 8 h el viernes"*, y es la REGLA GENERAL: no varía por obra — *"todo igual
// y así"*. Son **44 h semanales**, que es la jornada de la construcción.
//
// ═══ QUÉ ESTABA MAL ANTES, Y CUÁNTO COSTABA ═══
//
// Esta constante nació el 27/08 valiendo 8 h parejas de lunes a viernes: 40 h semanales. Se declaró
// entonces como "un piso DEL piso" —la limitación estaba escrita— pero una limitación declarada no
// deja de ser un número corto: la proyección del piso del convenio quedaba **10% abajo** de la
// obligación, todos los meses. El dueño contestó la pregunta y ahora hay con qué corregirlo.
//
// ═══ EL SÁBADO ES UN SUPUESTO, Y VIAJA COMO SUPUESTO ═══
//
// La evidencia del propio espejo `_J_OBREROS` dice que el sábado SE TRABAJA, con carga variable:
//
//   · en el bloque de diciembre, los sábados están cargados con **4 h para todo el plantel**;
//   · en agosto, el sábado 22 está en blanco para casi todos, pero Sosa tiene 8 h el 8/8.
//
// O sea: no es cero y no es una jornada entera. Se toma **4 h** —el medio día habitual de la
// construcción— y se declara COMO SUPUESTO en la fila donde se lee, no como un hecho verificado.
// Por eso el sábado vive en una CELDA de la pestaña y no adentro de la fórmula: el día que el dueño
// mida otra cosa, corrige la celda y la proyección se mueve sola. Las 9 y las 8 son su regla; las 4
// son la mejor lectura que tiene el OS de un dato que varía.
//
// Con el sábado adentro son 48 h semanales. Eso NO afirma que 48 sea la jornada legal: afirma que
// esas horas se trabajan y se pagan, que es la pregunta que la proyección de caja contesta.
//
// ═══ POR QUÉ VIVE ACÁ Y NO EN CADA PESTAÑA ═══
//
// La jornada la usan tres consumidores que no se hablan entre sí: el piso del convenio en Jornales,
// el valor de un día de vacaciones en Cargas Sociales, y la conversión HH→duración del cronograma
// (`obra_canonica.jornada_horas`). Escrita tres veces, el día que el dueño la cambie se mueven dos y
// la tercera sigue publicando el número viejo — sin dar un solo error. Es REALIDAD ÚNICA aplicada a
// un número que parece trivial y multiplica una masa salarial de un semestre.

/**
 * HORAS QUE SE DEBEN POR DÍA, INDEXADAS COMO `Date.getDay()`: 0 = domingo … 6 = sábado.
 *
 * El índice es el de JavaScript a propósito: cualquier otra convención obliga a un `+1` en el punto
 * de uso, y ese `+1` es exactamente el error que corre una semana entera sin dar error.
 */
export const HORAS_POR_DIA_DE_SEMANA = Object.freeze([0, 9, 9, 9, 9, 8, 4])

/** Lo que el dueño fijó como regla. El sábado no está acá porque no es su regla: es el supuesto. */
export const HORAS_LUNES_A_JUEVES = 9
export const HORAS_VIERNES = 8
/** SUPUESTO — la mejor lectura del espejo, no una regla declarada. Editable en la pestaña. */
export const HORAS_SABADO_SUPUESTO = 4

/** 44 h: la semana que el dueño declaró, sin el sábado. Es el número que se puede afirmar. */
export const HORAS_SEMANA_DECLARADA = HORAS_LUNES_A_JUEVES * 4 + HORAS_VIERNES
/** 48 h: lo que efectivamente se trabaja y se paga, con el supuesto del sábado adentro. */
export const HORAS_SEMANA_CON_SABADO = HORAS_SEMANA_DECLARADA + HORAS_SABADO_SUPUESTO

/**
 * HORAS POR DÍA HÁBIL (L-V) — lo que le corresponde a `obra_canonica.jornada_horas`.
 *
 * El cronograma convierte HH en duración dividiendo por esta cifra, y su calendario de obra es
 * `dias_habiles = {1,2,3,4,5}`: lunes a viernes. Entonces lo que ahí corresponde es la jornada
 * PROMEDIO de un día hábil, 44/5 = 8,8 — no las 9 del lunes ni las 8 del viernes, que describen
 * días distintos.
 *
 * EL SÁBADO NO ENTRA ACÁ, Y LA DISTINCIÓN NO ES UN DETALLE. Meterlo obligaría a agregar el 6 a
 * `dias_habiles` de todas las obras, y eso mueve el cronograma entero de cada una — un efecto que el
 * dueño NO pidió. El sábado es un supuesto de NÓMINA (cuánto se paga), no un día del plan de obra
 * (cuándo termina una tarea). Son dos preguntas y este archivo las mantiene separadas.
 */
export const HORAS_POR_DIA_HABIL = HORAS_SEMANA_DECLARADA / 5

/**
 * NÚCLEO PURO: las horas de jornada que se deben entre dos fechas, inclusive.
 *
 * Recorre día por día y no multiplica un promedio por una cuenta de días: una quincena empieza y
 * termina en cualquier día de la semana, así que "11 días hábiles × 8,8" y la suma real difieren
 * según dónde caigan los viernes. La diferencia es chica y silenciosa, que es la peor combinación.
 *
 * NO CONTEMPLA FERIADOS — el Sheet no tiene calendario de feriados y ninguna pestaña lo tiene;
 * inventarlo acá sería una fuente nueva sin dueño. El sesgo va hacia arriba (proyecta de más).
 *
 * @param {Date} desde
 * @param {Date} hasta
 * @param {number[]} tabla horas por día de semana; el sábado se puede pisar con el valor del dueño
 * @returns {number}
 */
export function horasDeJornada(desde, hasta, tabla = HORAS_POR_DIA_DE_SEMANA) {
  if (!(desde instanceof Date) || !(hasta instanceof Date)) return 0
  if (Number.isNaN(desde.getTime()) || Number.isNaN(hasta.getTime()) || hasta < desde) return 0
  let h = 0
  const d = new Date(desde.getFullYear(), desde.getMonth(), desde.getDate())
  const fin = new Date(hasta.getFullYear(), hasta.getMonth(), hasta.getDate())
  while (d <= fin) {
    h += Number(tabla[d.getDay()]) || 0
    d.setDate(d.getDate() + 1)
  }
  return h
}

/**
 * LAS TRES MÁSCARAS DE `NETWORKDAYS.INTL`, ESCRITAS UNA VEZ.
 *
 * Siete caracteres, de LUNES a domingo, con 1 = no cuenta. Se escriben acá y no en el punto de uso
 * porque un `1` de más corre un día entero de la semana y la fórmula sigue devolviendo un número
 * plausible — el modo de falla favorito de este libro.
 */
export const MASCARAS = Object.freeze({
  lunesAJueves: '"0000111"',
  viernes: '"1111011"',
  sabado: '"1111101"',
})

/**
 * NÚCLEO PURO: LA MISMA CUENTA, COMO EXPRESIÓN es-AR PARA LA PESTAÑA.
 *
 * Se escribe al lado de la versión JS a propósito: son dos caminos al mismo criterio y el test los
 * compara sobre las quincenas reales. Si un día se separan, el número de la pestaña y el del log
 * dejan de ser el mismo número — que es como un control empieza a validarse contra lo que produce.
 *
 * Las tres horas entran por CELDA y no como literales: el sábado tiene que ser corregible por el
 * dueño sin tocar código, y si el sábado es una celda las otras dos también deben serlo — una fila
 * donde dos números se editan y el tercero no es una trampa para el que la lea.
 *
 * @param {{celdaDesde:string, celdaHasta:string,
 *          celdaLJ:string, celdaV:string, celdaS:string}} d
 * @returns {string} la expresión (sin `=`), separador es-AR
 */
export function expresionHorasDeJornada({ celdaDesde, celdaHasta, celdaLJ, celdaV, celdaS }) {
  const n = (mascara) => `NETWORKDAYS.INTL(${celdaDesde};${celdaHasta};${mascara})`
  return `(${n(MASCARAS.lunesAJueves)}*${celdaLJ}`
    + `+${n(MASCARAS.viernes)}*${celdaV}`
    + `+${n(MASCARAS.sabado)}*${celdaS})`
}
