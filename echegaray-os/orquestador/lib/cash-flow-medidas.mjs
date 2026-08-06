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

/** El filtro que se le pide al libro para una medida dentro de una ventana. PURO. */
export function filtroDeMedida(m, desde, hasta) {
  return { desde, hasta, signo: m.signo, estados: [...m.estados], medida: m.medida }
}

/**
 * EL FILTRO DE LAS DEVOLUCIONES de una medida: lo que ENTRA con un rubro de EGRESO. PURO.
 *
 * Es el MISMO término para el ingreso y para el egreso del mismo estado —lo que el ingreso deja de
 * mostrar es exactamente lo que el egreso netea—, y eso es lo que hace que el Resultado no se mueva ni
 * un peso. Escrito dos veces con dos filtros parecidos, la identidad se rompería sin dar un solo error.
 */
const filtroDevoluciones = (m, desde, hasta) =>
  ({ desde, hasta, signo: 1, estados: [...m.estados], rubros: [...RUBROS_EGRESO], medida: 'neto' })

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
 */
export function terminosDeMedida(m, desde, hasta) {
  return [
    { coef: 1, filtro: filtroDeMedida(m, desde, hasta) },
    { coef: -1, filtro: filtroDevoluciones(m, desde, hasta) },
  ]
}

/**
 * NÚCLEO ESTRUCTURAL: los términos de UNA sub-línea de rubro.
 *
 * · Rubro de INGRESO → lo que entra con ese rubro. Igual que siempre.
 * · Rubro de EGRESO  → el NETO del rubro, con signo cambiado: lo pagado menos lo devuelto. SIN filtro
 *   de signo, que es justamente lo que deja entrar la nota de crédito para que reste. Un egreso neto
 *   de sus devoluciones es lo que de verdad costó ese rubro en el período.
 */
export function terminosDeRubro(m, desde, hasta, rubro) {
  return RUBROS_EGRESO.includes(rubro)
    ? [{ coef: -1, filtro: { desde, hasta, estados: [...m.estados], rubros: [rubro], medida: 'neto' } }]
    : [{ coef: 1, filtro: { ...filtroDeMedida(m, desde, hasta), rubros: [rubro] } }]
}

/** La expresión de una lista de términos, en el orden en que se declaran. PURA. */
export const expresionDeTerminos = (terminos) => terminos
  .map((t, i) => `${t.coef < 0 ? '-' : (i === 0 ? '' : '+')}${terminoLibro(t.filtro)}`)
  .join('')

/** La fórmula de una medida sobre una ventana. `desde` incluida, `hasta` EXCLUIDA. PURA. */
export function formulaMedida(m, desde, hasta) {
  return `=${expresionDeTerminos(terminosDeMedida(m, desde, hasta))}`
}

/** La fórmula de UN rubro dentro de una medida. PURA. */
export function formulaRubro(m, desde, hasta, rubro) {
  return `=${expresionDeTerminos(terminosDeRubro(m, desde, hasta, rubro))}`
}
