// EL HORIZONTE DEL CASH FLOW SEMANAL: 13 SEMANAS RODANTES, NO EL AÑO CALENDARIO.
//
// ═══ LA DECISIÓN, Y POR QUÉ ═══
//
// Hasta hoy el Semanal abría 53 columnas —el año calendario entero— y NO proyectaba los egresos:
// sólo mostraba lo que ya tenía fecha cargada en Compras. El Mensual abría 12 columnas y SÍ
// proyectaba. Los dos contestaban la misma pregunta —"¿cuánto varía el efectivo en 2026?"— y daban
// $125.500.568 de diferencia, con signo opuesto.
//
// Eso no es un error de fórmula: es que el año tenía DOS dueños. La regla de REALIDAD ÚNICA del OS
// dice que un concepto crítico se define una sola vez, y "el efectivo al cierre de 2026" es un
// concepto crítico. Emparejar los dos cuadros hoy los haría coincidir hoy y volverían a divergir con
// el primer cambio de criterio en cualquiera de los dos: la divergencia no se arregla, se elimina
// sacándole a uno la pregunta.
//
// Se la sacamos al Semanal, y no al revés, porque la skill de tesorería es explícita sobre para qué
// sirve un cuadro semanal: "el horizonte de referencia profesional es el forecast rodante de 13
// semanas (o 8 si la volatilidad de obra lo justifica): se actualiza cada semana quitando la que ya
// pasó, agregando una al final". Un cuadro de 53 semanas fijas del año no es rodante ni es forecast:
// es la misma grilla del Mensual con peor resolución. Ahora el Semanal contesta "¿en qué semana no
// alcanza la plata?" y el Mensual contesta "¿cómo cierra el año?" — una pregunta cada uno.
//
// ═══ Y DENTRO DE LAS 13 SEMANAS SÍ SE PROYECTA, CON EL MISMO CRITERIO QUE EL MENSUAL ═══
//
// Un forecast que proyecta lo que se cobra y no lo que se paga es optimista, que es el peor sesgo
// posible en tesorería. Las cobranzas esperadas ya sumaban en el Semanal; los egresos no. Acá se
// completa la simetría SIN inventar un criterio nuevo: la proyección del mes sale de la MISMA
// función que usa el Mensual (expresionProyeccionMes), y lo único que agrega este archivo es cómo se
// reparte ese mes entre las semanas que lo tocan.
//
// LA IDENTIDAD QUE LO HACE VERIFICABLE, y por eso el reparto es así y no de otra forma:
//
//     semana = real(semana) + falta(mes) × parteDeLaSemana(mes)
//     falta(mes) = MAX(0; proyección(mes) − real(mes))
//
// Sumando las semanas de un mes entero: Σ real(semana) + falta(mes) × 1 = real(mes) + MAX(0; proy −
// real) = MAX(real; proy) — que es EXACTAMENTE la fórmula del Mensual. Las dos pestañas no pueden
// discrepar sobre un mes completo: coinciden por construcción, no por casualidad.
//
// APROXIMACIÓN DECLARADA: el reparto dentro del mes es por DÍAS RESTANTES, porque el dato no tiene
// timing intra-mes. Lo que ya está cargado cae en su fecha real; lo que falta cargar se supone
// parejo. El total del mes es exacto; el día de la semana dentro del mes es un supuesto.

import { expresionReal, expresionProyeccionMes } from './cash-flow-lineas.mjs'

// ═══ EL DUEÑO PIDIÓ LAS 51 SEMANAS DE VUELTA (05/08) ═══
//
// El horizonte se había acortado a 13 —el rodante que pide la skill de tesorería— porque el semanal
// no proyectaba nada y contradecía al mensual en $140.350.436, con SIGNO OPUESTO en el aumento neto
// del año. La causa de esa contradicción NO era el largo del horizonte: era que el semanal sólo
// sumaba lo ya cargado. Acortarlo tapaba el síntoma escondiendo los meses donde se veía.
//
// Ese defecto ya está resuelto —`formulaLineaSemana` proyecta con el mismo criterio que el mensual—
// así que el horizonte largo vuelve a ser sostenible: las 51 semanas cubren el año y cada una
// proyecta, en vez de mostrar cero hasta que alguien cargue la factura.
//
// Lo que se pierde y hay que decirlo: una proyección semanal a cuarenta semanas vista es mucho menos
// confiable que a cuatro. El cuadro las marca en itálica como proyectadas; la confianza la pone quien
// lo lee, no el número.
export const SEMANAS_HORIZONTE = 51
/** Cuántas semanas ya cerradas mira el contraste "lo esperado contra lo que ocurrió". */
export const SEMANAS_CERRADAS = 4

/** El lunes de la semana que contiene `d`. UTC, para que no dependa del huso del proceso. */
export function lunesDe(d) {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  while (x.getUTCDay() !== 1) x.setUTCDate(x.getUTCDate() - 1)
  return x
}

/**
 * Las `n` semanas del horizonte, arrancando en la SEMANA EN CURSO (la que contiene hoy).
 * Rodante de verdad: mañana devuelve lo mismo, la semana que viene corre una y agrega una al final.
 */
export function semanasRodantes(hoy, n = SEMANAS_HORIZONTE) {
  const d = lunesDe(hoy)
  return Array.from({ length: n }, (_, i) => new Date(d.getTime() + i * 7 * 86400000))
}

/**
 * Las `n` semanas que YA CERRARON, de la más vieja a la más reciente. Es la ventana del contraste:
 * la única donde "lo que se esperaba" y "lo que ocurrió" son dos hechos comparables.
 */
export function semanasCerradas(hoy, n = SEMANAS_CERRADAS) {
  const d = lunesDe(hoy)
  return Array.from({ length: n }, (_, i) => new Date(d.getTime() - (n - i) * 7 * 86400000))
}

/**
 * Qué parte del mes `M` le toca a la ventana [desde, hasta), medida sobre los días que TODAVÍA NO
 * PASARON. Los días ya transcurridos del mes en curso no reciben proyección: lo que iba a pasar en
 * ellos ya pasó y está —o no— cargado en Compras. Sin este recorte, la primera semana del horizonte
 * cobraría proyección por días que ya son historia y el cuadro contaría dos veces esa plata.
 */
function parteDelMes(desde, hasta, M) {
  const finMes = `EOMONTH(${M};0)+1`
  const restantes = `MAX(0;${finMes}-MAX(${M};TODAY()))`
  const propios = `MAX(0;MIN(${hasta};${finMes})-MAX(${desde};${M};TODAY()))`
  return `IF(${restantes}=0;0;${propios}/${restantes})`
}

/**
 * NÚCLEO PURO: la fórmula de una línea del cuadro para UNA SEMANA del horizonte, con proyección.
 *
 * Una semana puede caer entera dentro de un mes o pisar dos. Se resuelven los dos meses que puede
 * tocar —el del lunes y el del domingo— y el segundo término se anula solo cuando son el mismo, así
 * que no hay una fórmula distinta para "las semanas que parten un mes": hay una sola.
 *
 * @param {object} l línea del CUADRO
 * @param {string} desde expresión del lunes (ej. 'B$3') · @param {string} hasta límite EXCLUYENTE ('B$3+7')
 * @param {Object<string,number>} filasTabla {pestaña: fila del total}
 * @param {number} anio el año del cuadro
 * @returns {string|null} fórmula es-AR CON el '=', o null si la línea la resuelve el generador
 */
export function formulaLineaSemana(l, desde, hasta, filasTabla = {}, anio = 2026) {
  const real = expresionReal(l, desde, hasta)
  if (real === null) return null // cheques, calendario fiscal, descubierto, comisiones, impuesto al cheque
  const M1 = `EOMONTH(${desde};-1)+1`
  // El domingo de la semana: `desde+6`. Con `hasta` (el lunes siguiente) el mes saldría corrido una
  // semana entera cada vez que el mes termina un domingo.
  const M2 = `EOMONTH(${desde}+6;-1)+1`
  const proy1 = expresionProyeccionMes(l, M1, filasTabla, anio)
  if (proy1 === null) return `=${real}`
  const proy2 = expresionProyeccionMes(l, M2, filasTabla, anio)
  const falta = (M, proy) => `MAX(0;${proy}-${expresionReal(l, M, `EOMONTH(${M};0)+1`)})`
  const tramo = (M, proy) => `${falta(M, proy)}*${parteDelMes(desde, hasta, M)}`
  return `=${real}+${tramo(M1, proy1)}+IF(${M2}=${M1};0;${tramo(M2, proy2)})`
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// LA CLASIFICACIÓN EXPLÍCITA DE CADA MOVIMIENTO
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
// Regla absoluta de la skill de tesorería, textual: "Todo movimiento se clasifica explícitamente como
// uno de: REAL · COMPROMETIDO · PROYECTADO · ESTIMADO · VENCIDO · PAGADO · COBRADO · CONCILIADO.
// Nunca se suman dos categorías distintas en la misma columna sin distinguirlas."
//
// Hasta hoy los dos cuadros mezclaban real y proyectado en la misma fila y la única marca era la
// itálica de la columna — que dice CUÁNDO, no QUÉ. Un cobro esperado de un cliente y un cheque ya
// emitido caen los dos en una columna futura y salen los dos en itálica, pero uno es una promesa y
// el otro es una orden de pago firmada. No son la misma cosa y no se leen igual.
//
// La naturaleza es una propiedad de la FUENTE del dato (de dónde sale el número); el tiempo lo sigue
// diciendo la columna. Las dos juntas dan la clasificación completa.

/** La naturaleza de la fuente de cada línea. PURA. */
export function naturalezaLinea(l) {
  if (l.bancoNat || l.desdeCompras) return 'MEMO'
  if (l.cobranzas) return l.modo === 'esperado' ? 'ESPERADO' : 'COBRADO'
  if (l.cheques) return 'EMITIDO'
  if (l.calendarioImpuestos) return 'DDJJ'
  if (l.descubierto || l.comisionesBancarias || l.impuestoCheque) return 'MODELO'
  if (l.rubro === 'Nómina · Jornales de obra' || l.rubro === 'Nómina · Sueldos administración') return 'PLANILLA'
  return 'COMPROBANTE'
}

/** Cómo se escribe cada naturaleza en la columna del cuadro. Corta: entran ~46 caracteres. */
export const GLOSA_NATURALEZA = {
  COBRADO: 'COBRADO · ya entró, con fecha de cobro',
  ESPERADO: 'PROYECTADO · el cliente todavía no pagó',
  EMITIDO: 'COMPROMETIDO · cheque/tarjeta ya emitido',
  DDJJ: 'COMPROMETIDO · DDJJ del calendario fiscal',
  MODELO: 'ESTIMADO · lo modela el OS, sin comprobante',
  PLANILLA: 'COMPROMETIDO · quincenas de la planilla',
  COMPROBANTE: 'PAGADO/COMPROMETIDO · comprobante cargado',
  MEMO: 'MEMO · no suma al flujo',
}

/**
 * Las cuatro cajas en las que se parte el flujo del horizonte. El cuadro prueba que la partición es
 * exacta: si las cuatro no suman la variación neta, la clasificación se rompió y hay que mirarla.
 */
export const CAJAS_NATURALEZA = [
  { clave: 'comprobante', rotulo: 'Con comprobante cargado (pagado o comprometido)', naturalezas: ['COBRADO', 'EMITIDO', 'DDJJ', 'PLANILLA', 'COMPROBANTE'] },
  { clave: 'esperado', rotulo: 'Esperado de clientes, todavía sin cobrar', naturalezas: ['ESPERADO'] },
  { clave: 'modelo', rotulo: 'Modelado por el OS, sin comprobante', naturalezas: ['MODELO'] },
]
