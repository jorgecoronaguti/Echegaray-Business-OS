// LA CABECERA DE "Cheques Recibidos" — ¿CUÁNTO ME DEBEN EN VALORES, Y QUÉ DÍA ENTRA CADA PESO?
//
// ═══ QUÉ ES ESTA PESTAÑA Y QUÉ NO ES ═══
//
// De la fila 27 para abajo vive el REGISTRO, y no es una tabla escrita: es el derrame de UNA sola
// QUERY puesta en A28 sobre `_CHEQUES_RAW`. Escribir un valor adentro de ese rectángulo no da un
// error de escritura: deja la QUERY entera en `#REF!` y la pestaña se queda sin registro. Por eso
// este archivo declara una GEOMETRÍA CERRADA —filas 1 a 26 y ni una más— y el test la vigila.
//
// De la fila 1 a la 26 va la cabecera, que es lo único que se rehace acá: siete indicadores, un
// calendario del mes y un resumen por tramos. Ni una cifra pegada: todo sale por fórmula de
// `_CHEQUES_RAW`, la misma réplica que alimenta el registro y a CAJA.
//
// ═══ POR QUÉ SE REHIZO (06/08) ═══
//
// La cabecera anterior tenía cuatro defectos que se tapaban entre ellos:
//
//   1. DOS MERGES HUÉRFANOS (A18:J18 y A24:J24) sobre filas de DATO. Una celda combinada sólo acepta
//      escritura en su ancla, así que las tres fórmulas que caían en el resto del merge (B18, C18,
//      B24) no se escribían nunca — en silencio, sin un solo error.
//   2. FORMATOS CORRIDOS DOS FILAS: B17 y B23 mostraban fechas donde iba plata. Un importe dibujado
//      como fecha no se lee mal: se lee como otra cosa.
//   3. UN `MATCH` EXACTO contra "Valores a depositar" cuando el rótulo de CAJA ya decía "Valores a
//      depositar ‖ no suma al total". Un contrato entre pestañas escrito sobre un texto que alguien
//      puede reescribir. Esa cita SE ELIMINÓ: la cartera se calcula de la fuente, no se importa.
//   4. LA FRESCURA PEGADA A MANO en A2, vencida. Un rótulo de corte que no es fórmula miente el día
//      siguiente, y se lee como un hecho.
//
// ═══ LAS DOS DECISIONES DE DISEÑO QUE HAY QUE ENTENDER ANTES DE TOCAR ESTO ═══
//
// · LA PARTICIÓN. Las filas 18 a 22 tienen que sumar EXACTAMENTE la fila 17 (lo que está en cartera):
//   son tramos contiguos —el `hasta` de uno es el `desde` del siguiente— más los cheques SIN fecha de
//   pago, que no caen en ningún tramo porque una celda vacía no compara contra un borde. Sin esa
//   última pieza un valor real desaparece de la vista sin romper ninguna suma. Una regla condicional
//   pinta el bloque en rojo si alguna vez deja de cerrar: el control no se escribe, se ve.
//
// · UNA CIFRA, UN CÁLCULO. Las cuatro líneas del resumen que repiten una tarjeta (en cartera,
//   depositados, endosados, rechazados) CITAN la celda de la tarjeta en vez de recalcular. Dos
//   fórmulas equivalentes para el mismo número es la forma más barata de que la pestaña se
//   contradiga a sí misma el día que una de las dos se toque.
//
// Locale es-AR: separador `;`, la coma es decimal. Ver memoria formula-por-api-va-en-locale.

import {
  formulaCartera, formulaCuentaCartera, formulaCarteraTramo, formulaCuentaTramo,
  formulaCarteraDia, formulaCuentaDia, formulaSinFecha, formulaCuentaSinFecha,
  formulaPorEstado, formulaCuentaPorEstado, formulaMaximoDiario, ESTADOS,
} from './cartera-cheques.mjs'
import { PESTAÑA as RAW } from '../scripts/cheques-raw-pestana.mjs'
import { rotuloAlDia } from './fecha-de-frescura.mjs'
import { sub } from './patron-pestana.mjs'

/** Alto EXACTO de la cabecera. La fila 27 es el encabezado del registro y la 28 el derrame. */
export const BANDA = 26
/** El ancho de la pestaña: A..J. La J queda vacía; el registro derrama hasta la I. */
export const ANCHO = 10
/** Dónde vive el registro. No se escribe: se comprueba antes de tocar nada. */
export const FILA_HDR_REGISTRO = 27
export const FILA_QUERY_REGISTRO = 28
/** El rótulo y el prefijo que identifican al registro. Si no están, este generador ABORTA. */
export const ANCLA_REGISTRO = 'N° de cheque'
export const PREFIJO_QUERY = '=IFERROR(QUERY('
/** Las dos columnas del registro cuyo formato numérico se repara (E fecha, F importe). Sólo formato:
 *  un solo valor escrito ahí adentro deja la QUERY en #REF!. */
export const COL_FECHA_REGISTRO = 4
export const COL_IMPORTE_REGISTRO = 5

// ── La geometría de la cabecera, en filas 1-based ────────────────────────────────────────────────
export const FILA_TITULO = 1
export const FILA_FRESCURA = 2
export const FILA_ROTULOS = 4
export const FILA_VALORES = 5
export const FILA_CAL = 7          // rótulo + selector de mes en B
export const FILA_DIAS = 8         // L M M J V S D
export const FILA_SEM0 = 9         // primera semana
export const SEMANAS = 6           // seis: un mes que arranca domingo necesita la sexta
export const FILA_RESUMEN = 16     // rótulos de columna del resumen
export const FILA_CARTERA = 17     // el total del que cuelga la partición
export const FILA_TRAMO0 = 18
export const FILA_ESTADO0 = 23
export const FILA_REGISTRO = 26    // el rótulo "REGISTRO", justo arriba del encabezado real
/** La columna del selector de mes y la primera del calendario (0-based): B. */
export const COL_CAL0 = 1
export const COL_CAL1 = COL_CAL0 + 7 // exclusivo: B..H

/** El borde que separa "este mes" de "más adelante". `MAX` para que el tramo no se invierta cuando
 *  faltan menos de siete días para fin de mes. */
const FIN_MES = 'MAX(TODAY()+7;EOMONTH(TODAY();0)+1)'

/**
 * LOS TRAMOS SON UNA PARTICIÓN, NO UNA LISTA DE FILTROS.
 *
 * El `hasta` de cada uno es el `desde` del siguiente (intervalos [desde; hasta): el borde pertenece
 * al tramo de arriba), el primero no tiene piso y el último no tiene techo. Así ningún cheque puede
 * caer en dos tramos ni quedarse sin tramo, que es la única forma de que la suma cierre contra el
 * total sin escribir un control aparte.
 *
 * El último se lleva además los que NO tienen fecha de pago. Es una decisión de tesorería, no de
 * programación: un valor que no se puede fechar NO se puede contar como que entra pronto. Ponerlo en
 * el tramo más lejano no adelanta plata que quizás no venga; ponerlo en "vencidos" inventaría una
 * alarma. Y el rótulo lo dice, para que nadie tenga que leer este comentario.
 */
export const TRAMOS = Object.freeze([
  { rotulo: 'Vencidos', desde: null, hasta: 'TODAY()' },
  { rotulo: 'Hoy', desde: 'TODAY()', hasta: 'TODAY()+1' },
  { rotulo: 'Próximos 7 días', desde: 'TODAY()+1', hasta: 'TODAY()+7' },
  { rotulo: 'Resto del mes', desde: 'TODAY()+7', hasta: FIN_MES },
  { rotulo: 'Posteriores o sin fecha', desde: FIN_MES, hasta: null, sinFecha: true },
])

/** Los estados terminales: se muestran, no se suman a la cartera. */
export const TERMINALES = Object.freeze([
  { rotulo: 'Depositados', estado: ESTADOS.depositado },
  { rotulo: 'Endosados', estado: ESTADOS.endosado },
  { rotulo: 'Rechazados', estado: ESTADOS.rechazado },
])

/**
 * LOS SIETE INDICADORES, en el orden en que se leen (A..G).
 *
 * "PRÓX. 7 DÍAS" usa los MISMOS bordes que los tramos "Hoy" + "Próximos 7 días" del resumen: es el
 * intervalo [TODAY(); TODAY()+7) partido en dos filas más abajo. Si alguien mueve un borde en
 * `TRAMOS` y no acá, el test lo caza — dos definiciones de "los próximos siete días" en la misma
 * pantalla es exactamente el tipo de contradicción que hace que el dueño deje de creerle al archivo.
 */
export const INDICADORES = Object.freeze([
  { rotulo: 'EN CARTERA', formula: () => formulaCartera() },
  { rotulo: 'DEPOSITADO', formula: () => formulaPorEstado(ESTADOS.depositado) },
  { rotulo: 'ENDOSADO', formula: () => formulaPorEstado(ESTADOS.endosado) },
  { rotulo: 'RECHAZADO', formula: () => formulaPorEstado(ESTADOS.rechazado) },
  { rotulo: 'PRÓX. 7 DÍAS', formula: () => formulaCarteraTramo('TODAY()', 'TODAY()+7') },
  { rotulo: 'PRÓX. 30 DÍAS', formula: () => formulaCarteraTramo('TODAY()', 'TODAY()+30') },
  { rotulo: 'MAYOR INGRESO DIARIO', formula: () => formulaMaximoDiario() },
])

/** La celda del selector de mes, en notación A1 anclada. */
export const CELDA_SELECTOR = `$${String.fromCharCode(65 + COL_CAL0)}$${FILA_CAL}`
/** El mes por defecto: el corriente, VIVO. Mientras el dueño no tipee nada, el calendario se pasa
 *  solo al mes que viene el día 1°. En cuanto tipea, gana él (y si borra la celda, vuelve esto). */
export const SELECTOR_DEFECTO = '=EOMONTH(TODAY();-1)+1'

/** El primer día del mes que muestra el calendario, sea lo que sea que tipeó el dueño en el selector. */
const PRIMER_DIA = `EOMONTH(${CELDA_SELECTOR};-1)+1`
/** El lunes de la primera semana. WEEKDAY(…;3) devuelve 0 el lunes: la semana argentina empieza ahí. */
const PRIMER_LUNES = `${PRIMER_DIA}-WEEKDAY(${PRIMER_DIA};3)`

/** La fecha de la celda número `n` del calendario (0 = el lunes de la primera semana). */
export const fechaDeCelda = (n) => `(${PRIMER_LUNES}+${Number(n)})`

/**
 * La fecha de la celda donde se está evaluando una REGLA CONDICIONAL.
 *
 * Una regla no puede recibir la posición por parámetro: se evalúa celda por celda. `ROW()`/`COLUMN()`
 * la reconstruyen sin depender de dónde quedó anclada la regla, así que la misma expresión sirve para
 * las 42 celdas.
 */
export const fechaPorPosicion = () => `(${PRIMER_LUNES}+(ROW()-${FILA_SEM0})*7+(COLUMN()-${COL_CAL0 + 1}))`

/**
 * NÚCLEO PURO: el contenido de una celda-día del calendario.
 *
 * Tres estados y ninguna explicación: fuera del mes, vacía; sin cheques, sólo el número del día; con
 * cheques, el día, el monto en millones y cuántos son. La PRESENCIA se decide por la cantidad y no
 * por el importe: un cheque de $0 existe igual — "el 0 no es vacío".
 */
export function celdaDia(n) {
  const f = fechaDeCelda(n)
  const monto = formulaCarteraDia(f).slice(1)
  const cant = formulaCuentaDia(f).slice(1)
  const cifra = `TEXT(${monto}/1000000;"$0,00")&"M · "&TEXT(${cant};"0")`
  return `=IF(MONTH(${f})<>MONTH(${PRIMER_DIA});"";TEXT(DAY(${f});"0")&IF(${cant}=0;"";CHAR(10)&${cifra}))`
}

/**
 * NÚCLEO PURO: la frescura de la réplica, leída de la propia réplica.
 *
 * `_CHEQUES_RAW!A1` dice "… · corte 2026-08-05 · réplica del …". De ahí sale la fecha, y de ahí sola:
 * un rótulo de corte escrito por este generador se congela el día que el pipeline se detiene, que es
 * justo el día en que hay que enterarse. Si el rótulo de la réplica cambia de forma, esto devuelve 0
 * y la celda dice "sin datos" — no inventa una fecha.
 *
 * La conversión NO usa DATEVALUE: sobre un ISO en un archivo es-AR puede leer el mes por el día sin
 * dar error. `DATE(…)` no depende del locale de nadie.
 */
export function exprFrescura() {
  const celda = `${RAW}!$A$1`
  const patron = 'corte (\\d{4}-\\d{2}-\\d{2})'
  const iso = `REGEXEXTRACT(${celda};"${patron}")`
  const fecha = `DATE(VALUE(LEFT(${iso};4));VALUE(MID(${iso};6;2));VALUE(MID(${iso};9;2)))`
  return `IF(NOT(REGEXMATCH(${celda}&"";"${patron}"));0;${fecha})`
}

/**
 * NÚCLEO PURO: qué se escribe en el selector de mes.
 *
 * Es la ÚNICA celda de captura de la cabecera, y la cabecera se escribe como un rectángulo entero:
 * si no se re-emitiera su contenido, cada corrida le borraría el mes que el dueño eligió. Se re-emite
 * lo que había, en su especie:
 *
 *   · una fórmula vuelve como fórmula (lo normal: el default vivo de la corrida anterior);
 *   · una fecha tipeada vuelve como NÚMERO. Volver a escribirla como el texto "01/09/2026" la
 *     convertiría en TEXTO y el calendario entero pasaría a #VALUE! sin que nadie escribiera nada mal;
 *   · un texto vuelve como texto (el dueño escribió cualquier cosa: es suyo, no se corrige acá);
 *   · vacío ⇒ el default vivo.
 *
 * @param {{formula?:unknown, crudo?:unknown}} previo lo leído con render FORMULA y sin formato
 */
export function valorSelector({ formula = '', crudo = '' } = {}) {
  const f = String(formula ?? '').trim()
  if (f.startsWith('=')) return f
  // El 0 de una celda vacía leída como número no es una fecha: sería el 30/12/1899. Y se descarta
  // ANTES de pasar por String(), donde se volvía el texto "0" y entraba igual — el test lo cazó.
  if (typeof crudo === 'number') return crudo > 0 ? crudo : SELECTOR_DEFECTO
  const t = String(crudo ?? '').trim()
  return t || SELECTOR_DEFECTO
}

/** El monto de un tramo. El último suma además lo que no tiene fecha (ver TRAMOS). */
const montoTramo = (t) => (t.sinFecha
  ? `${formulaCarteraTramo(t.desde, t.hasta)}+${formulaSinFecha().slice(1)}`
  : formulaCarteraTramo(t.desde, t.hasta))
const cuentaTramo = (t) => (t.sinFecha
  ? `${formulaCuentaTramo(t.desde, t.hasta)}+${formulaCuentaSinFecha().slice(1)}`
  : formulaCuentaTramo(t.desde, t.hasta))

/**
 * LA GRILLA DE LA CABECERA. Pura: sin red, sin base, sin escribir una celda.
 *
 * @param {{selector?:string|number}} opts el valor a poner en el selector de mes (ver valorSelector)
 * @returns {{filas:Array<Array<string|number>>}} exactamente BANDA filas de ANCHO columnas
 */
export function grilla({ selector = SELECTOR_DEFECTO } = {}) {
  const filas = Array.from({ length: BANDA }, () => Array.from({ length: ANCHO }, () => ''))
  const set = (f, c, v) => { filas[f - 1][c] = v }

  // 1 · EL TÍTULO Y LA FRESCURA. Nada más arriba: el ojo tiene que llegar a los números en la fila 5.
  set(FILA_TITULO, 0, 'CHEQUES RECIBIDOS')
  set(FILA_FRESCURA, 0, rotuloAlDia('Cartera de terceros', exprFrescura(), { cola: 'en pesos' }))

  // 2 · LOS SIETE INDICADORES. Rótulo arriba, cifra abajo: es una fila de tarjetas, no una tabla.
  INDICADORES.forEach((ind, i) => {
    set(FILA_ROTULOS, i, ind.rotulo)
    set(FILA_VALORES, i, ind.formula())
  })

  // 3 · EL CALENDARIO. El mes lo elige el dueño en B7; todo lo demás cuelga de esa celda.
  set(FILA_CAL, 0, 'CALENDARIO')
  set(FILA_CAL, COL_CAL0, selector)
  'LMMJVSD'.split('').forEach((d, i) => set(FILA_DIAS, COL_CAL0 + i, d))
  for (let s = 0; s < SEMANAS; s++) {
    for (let d = 0; d < 7; d++) set(FILA_SEM0 + s, COL_CAL0 + d, celdaDia(s * 7 + d))
  }

  // 4 · EL RESUMEN. El total, su partición indentada, y los estados terminales aparte.
  set(FILA_RESUMEN, 1, 'Monto')
  set(FILA_RESUMEN, 2, 'Cheques')
  set(FILA_CARTERA, 0, 'En cartera')
  set(FILA_CARTERA, 1, `=$A$${FILA_VALORES}`)
  set(FILA_CARTERA, 2, formulaCuentaCartera())
  TRAMOS.forEach((t, i) => {
    set(FILA_TRAMO0 + i, 0, sub(t.rotulo))
    set(FILA_TRAMO0 + i, 1, montoTramo(t))
    set(FILA_TRAMO0 + i, 2, cuentaTramo(t))
  })
  TERMINALES.forEach((e, i) => {
    // El monto CITA su tarjeta (B5, C5, D5) en vez de recalcularlo: una cifra, un cálculo.
    const col = String.fromCharCode(66 + i)
    set(FILA_ESTADO0 + i, 0, e.rotulo)
    set(FILA_ESTADO0 + i, 1, `=$${col}$${FILA_VALORES}`)
    set(FILA_ESTADO0 + i, 2, formulaCuentaPorEstado(e.estado))
  })

  set(FILA_REGISTRO, 0, 'REGISTRO')
  return { filas }
}

/** Un rango de la pestaña, en la forma que pide la API. */
const rango = (sheetId, r0, r1, c0, c1) => ({
  sheetId, startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1,
})

/**
 * NÚCLEO PURO: CUÁLES DE LAS REGLAS CONDICIONALES QUE HAY EN LA PESTAÑA SON MÍAS.
 *
 * `addConditionalFormatRule` SIEMPRE agrega: sin borrar primero, cada corrida deja un juego más. Pero
 * esta pestaña la comparte la cabecera con un registro que no es de este generador, así que borrarlas
 * todas —lo que hace CAJA, que sí es íntegramente suya— borraría reglas ajenas.
 *
 * La propiedad se decide por GEOMETRÍA: una regla es mía si TODOS sus rangos viven adentro de la
 * banda. Una regla sin `endRowIndex` (hasta el final de la hoja) no es mía por definición.
 *
 * @returns {number[]} los índices a borrar, en orden DESCENDENTE — borrar reindexa lo que queda.
 */
export function reglasABorrar(reglas = []) {
  const mia = (r) => {
    const rangos = r?.ranges || []
    if (!rangos.length) return false
    return rangos.every((g) => Number.isInteger(g?.endRowIndex) && g.endRowIndex <= BANDA
      && (g.startRowIndex ?? 0) >= 0)
  }
  return reglas.map((r, i) => (mia(r) ? i : -1)).filter((i) => i >= 0).reverse()
}

const ROJO = { red: 0.72, green: 0.11, blue: 0.11 }
const ROJO_FONDO = { red: 0.99, green: 0.92, blue: 0.92 }
const AMBAR = { red: 0.72, green: 0.42, blue: 0.05 }
const ACENTO = { red: 0.11, green: 0.23, blue: 0.37 }
const CELESTE = { red: 0.90, green: 0.94, blue: 0.98 }

/**
 * NÚCLEO PURO: las cuatro reglas condicionales de la cabecera.
 *
 * Ninguna es decorativa: cada una dice algo que de otro modo habría que calcular a mano mirando.
 *   0 · HOY, para no tener que buscar el día en la grilla.
 *   1 · EL DÍA DE MAYOR CONCENTRACIÓN — el que la tarjeta G nombra en pesos, ubicado en el calendario.
 *   2 · UN DÍA YA PASADO CON PLATA ADENTRO: el cheque venció y sigue en custodia. Es una pregunta
 *       para el dueño ("¿por qué no se depositó?"), no un color lindo.
 *   3 · LA PARTICIÓN QUE DEJÓ DE CERRAR. Si 18+…+22 ≠ 17, el bloque entero se pinta de rojo. Es el
 *       único control de esta pestaña y no gasta ni una fila: o está invisible, o grita.
 */
export function reglasCondicionales(sheetId) {
  const cal = [rango(sheetId, FILA_SEM0 - 1, FILA_SEM0 - 1 + SEMANAS, COL_CAL0, COL_CAL1)]
  const ancla = `${String.fromCharCode(65 + COL_CAL0)}${FILA_SEM0}`
  const fecha = fechaPorPosicion()
  const monto = `ROUND(${formulaCarteraDia(fecha).slice(1)})`
  const maximo = `ROUND($G$${FILA_VALORES})`
  const suma = `ROUND(SUM($B$${FILA_TRAMO0}:$B$${FILA_TRAMO0 + TRAMOS.length - 1}))`
  const regla = (ranges, formula, format) => ({
    ranges,
    booleanRule: { condition: { type: 'CUSTOM_FORMULA', values: [{ userEnteredValue: formula }] }, format },
  })
  return [
    regla(cal, `=AND(${ancla}<>"";${fecha}=TODAY())`, { backgroundColor: CELESTE, textFormat: { bold: true } }),
    regla(cal, `=AND(${monto}>0;${monto}=${maximo})`, { textFormat: { bold: true, foregroundColor: ACENTO } }),
    regla(cal, `=AND(${fecha}<TODAY();${monto}>0)`, { textFormat: { foregroundColor: AMBAR } }),
    regla([rango(sheetId, FILA_CARTERA - 1, FILA_TRAMO0 - 1 + TRAMOS.length, 0, 3)],
      `=${suma}<>ROUND($B$${FILA_CARTERA})`,
      { backgroundColor: ROJO_FONDO, textFormat: { bold: true, foregroundColor: ROJO } }),
  ].map((rule, index) => ({ addConditionalFormatRule: { index, rule } }))
}
