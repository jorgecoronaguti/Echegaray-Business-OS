// QUÉ SUMA CADA FILA DE PLATA DE LAS DOS VISTAS DE CASH FLOW — el filtro, no el lugar.
//
// ═══ POR QUÉ ESTÁ SEPARADO DE `cash-flow-matriz.mjs` (06/08/2026) ═══
//
// Aquel archivo contesta DÓNDE va cada cosa: qué fila, qué columna, qué footprint. Éste contesta QUÉ
// suma cada una. Son dos preguntas distintas y las tocan manos distintas: agregar un rubro o cambiar
// cómo se trata una devolución no mueve una sola fila, y correr el cuadro dos renglones no cambia un
// solo filtro. Vivían juntos y el archivo pasó las 500 líneas del estándar del repo.
//
// La dirección de la dependencia es `matriz → medidas`, nunca al revés: las medidas no saben en qué
// fila se muestran, y por eso se pueden probar sin geometría (ver `cash-flow-neteo.test.mjs`).
//
// TODO NÚMERO SIGUE SALIENDO DE `terminoLibro` SOBRE `_MOVIMIENTOS`. Acá no se calcula plata: se
// construyen los filtros con los que la hoja la va a calcular.

import { terminoLibro } from './libro-sumas.mjs'
import { sumar } from './libro-movimientos.mjs'
import { RUBROS_EGRESO } from './cash-flow-rubros.mjs'

/** Lo que YA pasó: entró o salió de la cuenta. */
export const ESTADOS_REALES = Object.freeze(['REAL'])
/**
 * Lo que TODAVÍA NO pasó, en las tres formas en que el libro lo registra. Los tres van juntos en la
 * línea "proyectado" porque los tres son plata que no está en la cuenta; la diferencia entre un cheque
 * emitido (COMPROMETIDO) y un cobro esperado (PROYECTADO) se lee en el detalle, no en el saldo.
 * VENCIDO entra acá y no en real: una fecha que pasó sin conciliar NO es plata que se movió.
 */
export const ESTADOS_PENDIENTES = Object.freeze(['PROYECTADO', 'VENCIDO', 'COMPROMETIDO'])

/**
 * LAS CUATRO MEDIDAS DE FLUJO. El orden es el de las filas de la matriz: primero lo que entra.
 *
 * `signoNeto` es cómo entra la medida en el resultado; `medida:'magnitud'` es cómo se MUESTRA. Los
 * egresos se muestran en positivo —un pago de $3M se lee "$3.000.000", no "($3.000.000)"— y restan igual.
 *
 * `signo` es el signo del movimiento que la medida MIRA, no la lista entera de lo que muestra: desde
 * el 06/08 los subtotales le restan las devoluciones (ver `terminosDeMedida`), que entran con signo +1
 * y viven del lado del egreso. La partición por ESTADO sigue siendo exacta, y ésa es la que importa acá.
 */
export const MEDIDAS = Object.freeze([
  { clave: 'ingresoReal', signo: 1, estados: ESTADOS_REALES, medida: 'neto', signoNeto: 1 },
  { clave: 'ingresoProyectado', signo: 1, estados: ESTADOS_PENDIENTES, medida: 'neto', signoNeto: 1 },
  { clave: 'egresoReal', signo: -1, estados: ESTADOS_REALES, medida: 'magnitud', signoNeto: -1 },
  { clave: 'egresoProyectado', signo: -1, estados: ESTADOS_PENDIENTES, medida: 'magnitud', signoNeto: -1 },
])

/** ¿Es la medida de lo YA ocurrido? Se deriva de sus estados: dos listas serían dos verdades. PURA. */
export const esMedidaReal = (m) => m.estados.includes('REAL')

/**
 * EL ESTADO QUE NO PERTENECE A LA VENTANA DE SU FECHA. Se nombra una sola vez: la regla de abajo lo
 * saca de TODAS las ventanas, y un literal repetido en cuatro lugares es cuatro lugares donde falla.
 */
export const VENCIDO = 'VENCIDO'

/**
 * ¿ESTA COLUMNA ES LA DEL ANCLA? — la condición, en las dos formas en que hace falta. PURA.
 *
 * ═══ POR QUÉ UN VENCIDO NO VA EN LA VENTANA DE SU FECHA (10/09/2026) ═══
 *
 * Medido en el archivo vivo: `Cash Flow Mensual!M50` publicaba $61.410.282 y `Cash Flow Semanal!BB50`
 * $70.410.282 — $9.000.000 de diferencia sobre el MISMO libro y el MISMO período. La causa es que las
 * columnas anteriores a la del ancla NO están en la cadena de saldos (van vacías o se despejan hacia
 * atrás), así que lo que cae en ellas no llega al cierre. El único VENCIDO del libro —un retiro de
 * Dirección del 01/09— caía en una columna de septiembre: la semanal lo perdía y la mensual no,
 * porque el ancla del 07/09 vive dentro del mes de septiembre y fuera de la semana del 01/09.
 *
 * Un VENCIDO es plata que ESTABA prevista para una fecha que ya pasó y que nadie concilió: no se movió
 * ese día y no se va a mover ese día. Su fecha ya no dice cuándo ocurre — dice cuándo debería haber
 * ocurrido. La escalera de CAJA lo trata así desde el 17/08 (su tramo del pasado abre en el serial 0,
 * `caja-calendario.mjs`), y acá se hace lo mismo: sale de la ventana de TODAS las columnas y entra
 * ENTERO en la del ancla, que es la columna del presente — la única desde la que arranca la cadena.
 *
 * Con eso las dos vistas suman el mismo vencido exactamente una vez, en la única columna que las dos
 * comparten sin importar cómo esté partido el tiempo, y el cierre del período vuelve a coincidir.
 *
 * ⚠ LÍMITE DECLARADO: sin `ancla` no hay columna del presente y el vencido vuelve a la ventana de su
 * fecha, que es el comportamiento histórico. Pasa cuando el cuadro se genera sin los rangos con nombre
 * de CAJA — y en ese caso la pestaña tampoco publica un solo saldo y lo dice en su hero, así que no hay
 * cadena que romper. Lo que NO hace es inventar una columna: un ancla fuera del ejercicio deja el
 * vencido afuera del cuadro, igual que deja afuera toda la cadena de saldos.
 *
 * @param {string|number} desde borde inferior de la ventana (expresión de fórmula o serial)
 * @param {string|number} hasta borde superior EXCLUIDO
 * @param {string|number|null} ancla la fecha del saldo declarado (`CAJA_FECHA_SALDO` o su serial)
 * @returns {string|1|0|null} la expresión de la condición, su valor ya resuelto, o `null` si no hay ancla
 */
export function condicionAncla(desde, hasta, ancla) {
  if (ancla === null || ancla === undefined || ancla === '') return null
  const esNumero = (x) => typeof x === 'number' && Number.isFinite(x)
  if (esNumero(desde) && esNumero(hasta) && esNumero(ancla)) return desde <= ancla && ancla < hasta ? 1 : 0
  // MEZCLAR SERIAL Y EXPRESIÓN NO SE RESUELVE "COMO SE PUEDA": `'B$3' <= 46272` compara un texto con un
  // número y devuelve algo plausible. Los tres bordes vienen del mismo mundo o el llamador se equivocó.
  if (esNumero(desde) || esNumero(hasta) || esNumero(ancla)) {
    throw new Error('cash-flow-medidas: la ventana y el ancla tienen que ser las dos de fórmula o las dos de serial')
  }
  return `(${desde}<=${ancla})*(${hasta}>${ancla})`
}

/** El filtro que se le pide al libro para una medida dentro de una ventana. PURO. */
export function filtroDeMedida(m, desde, hasta, estados = m.estados) {
  return { desde, hasta, signo: m.signo, estados: [...estados], medida: m.medida }
}

/**
 * EL FILTRO DE LAS DEVOLUCIONES de una medida: lo que ENTRA con un rubro de EGRESO. PURO.
 *
 * Es el MISMO término para el ingreso y para el egreso del mismo estado —lo que el ingreso deja de
 * mostrar es exactamente lo que el egreso netea—, y eso es lo que hace que el Resultado no se mueva ni
 * un peso. Escrito dos veces con dos filtros parecidos, la identidad se rompería sin dar un solo error.
 */
const filtroDevoluciones = (m, desde, hasta, estados = m.estados) =>
  ({ desde, hasta, signo: 1, estados: [...estados], rubros: [...RUBROS_EGRESO], medida: 'neto' })

/** Los estados de la medida que SÍ se filtran por la ventana de la columna. PURA. */
const enLaVentana = (m) => m.estados.filter((e) => e !== VENCIDO)

/**
 * NÚCLEO ESTRUCTURAL: los TÉRMINOS de un subtotal — cada uno un filtro del libro y su coeficiente.
 *
 * Existe separado de la fórmula porque es lo que se puede EVALUAR: un test corre estos filtros sobre
 * un libro sintético y comprueba que el Resultado del período sigue siendo el neto del libro. Contra
 * una cadena de texto eso no se puede probar, y la identidad quedaría afirmada y no verificada.
 *
 *   ingresos = todo lo que entra            − lo que entra con rubro de EGRESO
 *   egresos  = magnitud de todo lo que sale − lo que entra con rubro de EGRESO
 *
 * El segundo término es EL MISMO en las dos, así que se cancela en `ingresos − egresos`.
 *
 * Los términos con `ancla` valen SÓLO en la columna del ancla y no llevan ventana: son el vencido, que
 * no pertenece a la ventana de su fecha (ver `condicionAncla`). El par —lo que suma y su devolución—
 * se parte igual que el de la ventana, así que la cancelación en el Resultado sigue siendo exacta.
 */
export function terminosDeMedida(m, desde, hasta, { ancla = null } = {}) {
  const cond = condicionAncla(desde, hasta, ancla)
  const estados = cond === null ? m.estados : enLaVentana(m)
  const terminos = [
    { coef: 1, filtro: filtroDeMedida(m, desde, hasta, estados) },
    { coef: -1, filtro: filtroDevoluciones(m, desde, hasta, estados) },
  ]
  if (cond === null || !m.estados.includes(VENCIDO)) return terminos
  return [
    ...terminos,
    { coef: 1, ancla: cond, filtro: filtroDeMedida(m, null, null, [VENCIDO]) },
    { coef: -1, ancla: cond, filtro: filtroDevoluciones(m, null, null, [VENCIDO]) },
  ]
}

/**
 * NÚCLEO ESTRUCTURAL: los términos de UNA sub-línea de rubro.
 *
 * · Rubro de INGRESO → lo que entra con ese rubro. Igual que siempre.
 * · Rubro de EGRESO  → el NETO del rubro, con signo cambiado: lo pagado menos lo devuelto. SIN filtro
 *   de signo, que es justamente lo que deja entrar la nota de crédito para que reste. Un egreso neto
 *   de sus devoluciones es lo que de verdad costó ese rubro en el período.
 *
 * El vencido se parte igual que en el subtotal, y no por simetría estética: "Otros" se despeja de
 * `subtotal − SUM(rubros)`, así que un vencido que estuviera en el subtotal y no en su rubro
 * reaparecería adentro de "Otros" — plata real, en la fila equivocada, sin un solo error.
 */
export function terminosDeRubro(m, desde, hasta, rubro, { ancla = null } = {}) {
  const cond = condicionAncla(desde, hasta, ancla)
  const estados = cond === null ? m.estados : enLaVentana(m)
  const uno = (d, h, ests, extra) => (RUBROS_EGRESO.includes(rubro)
    ? { coef: -1, ...extra, filtro: { desde: d, hasta: h, estados: [...ests], rubros: [rubro], medida: 'neto' } }
    : { coef: 1, ...extra, filtro: { ...filtroDeMedida(m, d, h, ests), rubros: [rubro] } })
  const terminos = [uno(desde, hasta, estados, {})]
  if (cond === null || !m.estados.includes(VENCIDO)) return terminos
  return [...terminos, uno(null, null, [VENCIDO], { ancla: cond })]
}

/**
 * La expresión de una lista de términos, en el orden en que se declaran. PURA.
 *
 * Un término del ancla se multiplica por su condición, que vale 1 en una sola columna y 0 en todas las
 * demás. No es un `IF`: adentro de un SUMPRODUCT una condición escalar multiplica el término entero, y
 * un cero lo apaga sin evaluar nada raro. Así la MISMA fórmula sirve para las 53 columnas.
 */
export const expresionDeTerminos = (terminos) => terminos
  .map((t, i) => `${t.coef < 0 ? '-' : (i === 0 ? '' : '+')}${factorEnFormula(t.ancla)}${terminoLibro(t.filtro)}`)
  .join('')

/** El `(cond)*` que precede a un término del ancla. Un ancla ya resuelta a número no es una fórmula. */
function factorEnFormula(ancla) {
  if (ancla === undefined || ancla === null) return ''
  if (typeof ancla !== 'string') {
    throw new Error('cash-flow-medidas: la fórmula necesita la CONDICIÓN del ancla, no su valor resuelto')
  }
  return `(${ancla})*`
}

/**
 * NÚCLEO PURO: el valor de una lista de términos sobre un libro ya leído, en JS.
 *
 * ═══ POR QUÉ VIVE ACÁ Y NO EN QUIEN LO USA ═══
 *
 * Porque es la SEGUNDA forma de leer los mismos términos, y la primera es `expresionDeTerminos`. Las
 * dos tienen que entender igual qué es un término del ancla: si el gemelo JS lo ignorara, Postgres
 * sumaría el vencido en las 53 columnas y la hoja en una sola, y ningún error lo diría. Vivía suelto
 * en `flujo-persistencia.mjs` como una reducción de tres líneas, y ahí es exactamente donde se olvida.
 */
export function valorDeTerminos(libro = [], terminos = []) {
  return terminos.reduce((total, t) => {
    const factor = factorEnJs(t.ancla)
    return factor === 0 ? total : total + t.coef * sumar(libro, t.filtro).total
  }, 0)
}

/** El 1/0 de un término del ancla. Una condición sin resolver no se puede evaluar en JS: revienta. */
function factorEnJs(ancla) {
  if (ancla === undefined || ancla === null) return 1
  if (typeof ancla === 'string') {
    throw new Error('cash-flow-medidas: para evaluar en JS el ancla tiene que venir como serial, no como expresión')
  }
  return ancla ? 1 : 0
}

/** La fórmula de una medida sobre una ventana. `desde` incluida, `hasta` EXCLUIDA. PURA. */
export function formulaMedida(m, desde, hasta, opciones = {}) {
  return `=${expresionDeTerminos(terminosDeMedida(m, desde, hasta, opciones))}`
}

/** La fórmula de UN rubro dentro de una medida. PURA. */
export function formulaRubro(m, desde, hasta, rubro, opciones = {}) {
  return `=${expresionDeTerminos(terminosDeRubro(m, desde, hasta, rubro, opciones))}`
}
