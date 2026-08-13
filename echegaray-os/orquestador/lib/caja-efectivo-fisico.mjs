// LA CAJA FÍSICA: EL EFECTIVO COBRADO TIENE QUE APARECER EN "CAJA EN PESOS".
//
// ═══ EL PEDIDO (31/07) ═══
//
// El dueño: "se realiza una cobranza marcada en esa pestaña como en 'efectivo', ese valor tiene q
// cargarse en 'caja' directamente. ahora lo suma pero no carga en la celda de 'caja en pesos' como
// corresponde".
//
// Las dos mitades de la frase son ciertas y describen exactamente el estado del archivo, medido en
// vivo el 31/07 sobre CAJA:
//
//   C13  "Movimientos de efectivo posteriores al arqueo" ...  $19.789.659,73   ← lo CALCULA bien
//   E14  "Total disponibilidades" = SUM(E7:E13) − E11 ......  lo SUMA bien
//   C7/E7  "Caja en pesos" ...............................            $0      ← acá no llega
//
// Los $19.789.659,73 son las dos cobranzas en efectivo de LA ESTRELLA del 31/07 (f35 $2.313.579,74 y
// f36 $17.476.079,99). La arquitectura del arqueo-como-ancla ya estaba bien y ya estaba viva: lo que
// faltaba era el último tramo, que la línea de movimientos llegara a la celda que dice cuánta plata
// hay en el cajón. Hoy son dos renglones separados, y el que el dueño mira dice cero.
//
// ═══ POR QUÉ NO SE ARREGLA "SUMANDO COBRANZAS EN CAJA EN PESOS" ═══
//
// Porque el efectivo COBRADO no es el efectivo que ESTÁ en la caja. Se cobra en efectivo, y después
// ese mismo billete se deposita en el banco, se usa para pagarle a un proveedor, o se queda en el
// cajón. Una fórmula que sume cobros sin restar lo que salió hace crecer la caja para siempre y
// muestra una plata que no existe.
//
// Está medido con el archivo real, y el número es contundente. Toda la historia de este año:
//
//   cobrado en efectivo (Cobranzas, estado Cobrado) ......  $137.935.305,73
//   pagado en efectivo (Compras, Pagado/Efectivo) ........  $137.291.028,34
//
// El 99,5% del efectivo que entra se vuelve a ir en efectivo. Una "Caja en pesos" que sólo sumara
// cobros habría declarado $137,9 millones en un cajón que tiene una fracción de eso.
//
// ═══ EL MODELO QUE CIERRA ═══
//
//     efectivo en caja  =  ARQUEO
//                       +  cobrado en efectivo   DESPUÉS del arqueo
//                       −  depositado en el banco DESPUÉS del arqueo
//                       −  pagado en efectivo     DESPUÉS del arqueo
//
// El ARQUEO es el ancla: un conteo físico, con fecha, que el dueño tipea. Es la única forma de saber
// cuánta plata hay en un cajón, y su edición manual es verdad definitiva — ninguna suma automática lo
// pisa nunca. De esa fecha para adelante el efectivo se mueve solo, y sólo en la ventana que el
// arqueo no cubre (`> arqueo`, exclusiva). Cuando el dueño toma un arqueo NUEVO, todo lo anterior
// colapsa dentro de él y sale de la ventana solo.
//
// POR QUÉ NO SE PUEDE RECONSTRUIR LA HISTORIA EN VEZ DE PEDIR UN ARQUEO. Se probó con los números
// reales: cobrado − pagado − depositado sobre TODA la historia da −$9.315.722,61. Una caja física no
// puede tener saldo negativo. La diferencia no es un error de carga: el extracto sólo cubre del 22/06
// al 31/07, así que las extracciones de efectivo del banco anteriores a junio —la plata con la que se
// pagaron esos $137M en efectivo— no están en ninguna fuente del archivo. Sin arqueo no hay caja
// física calculable, y por eso el arqueo no es un lujo del modelo: es su requisito.
//
// ═══ POR QUÉ ESTA CELDA Y NO OTRA ═══
//
// Medido quién lee qué, en el archivo real:
//   · FUERA de CAJA nadie lee "Caja en pesos". Los dos cash flow leen el rango con nombre
//     CAJA_TOTAL_DISPONIBLE ("Total disponibilidades"); Cheques Recibidos y Cheques Emitidos buscan
//     "Valores a depositar" y "Total disponibilidades" por RÓTULO. Ninguno toca la fila del arqueo.
//   · DENTRO de CAJA la referencian tres celdas: el total (`=SUM(E7:E13)-E11`), la alerta 4.6
//     ("Declarado hoy en caja física", `=E7`) y la exposición al dólar (que usa la columna C, no la E).
//
// Así que mover el número a "Caja en pesos" es seguro para todo lo de afuera, y adentro obliga a dos
// cosas que este módulo hace explícitas: que la línea de movimientos DEJE de aportar su propio valor
// al total (o el mismo peso se contaría dos veces), y que la alerta 4.6 apunte al ARQUEO CRUDO y no a
// la celda nueva (o restaría movimientos de una ventana distinta de la suya).

import {
  COB, CMP, DEP,
  formulaCobrosEfectivoPosteriores, formulaComprasEfectivoPosteriores,
  formulaDepositosEfectivoPosteriores,
} from './caja-posterior-al-corte.mjs'

/** La identidad del modelo, escrita una sola vez para que el test y la pestaña citen lo mismo. */
export const IDENTIDAD = 'efectivo en caja = arqueo + cobrado en efectivo − depositado − pagado en efectivo, todo con fecha POSTERIOR al arqueo'

/**
 * NÚCLEO PURO: la aritmética del modelo, sin Sheet en el medio.
 *
 * Existe separada de las fórmulas por una razón práctica: una fórmula se puede verificar por su
 * TEXTO (que tenga rango abierto, que use `;`, que filtre por estado) pero eso no prueba que el
 * modelo CIERRE. Esto sí, y con números concretos — ver el test `el modelo cierra`.
 *
 * @param {{arqueo?:number, cobrado?:number, depositado?:number, pagado?:number}} m
 * @returns {number} el efectivo que tiene que haber en el cajón
 */
export function efectivoEnCaja({ arqueo = 0, cobrado = 0, depositado = 0, pagado = 0 } = {}) {
  return arqueo + cobrado - depositado - pagado
}

/**
 * NÚCLEO PURO: la fórmula de "Caja en pesos", columna del SALDO EN PESOS.
 *
 * = arqueo (convertido si tuviera tipo de cambio) + el neto de movimientos posteriores al arqueo.
 *
 * POR QUÉ REFERENCIA LA CELDA DEL NETO Y NO REPITE SU FÓRMULA. El neto ya se calcula en la línea
 * "Movimientos de efectivo posteriores al arqueo" y se muestra ahí, desglosado, para que el número se
 * pueda auditar. Repetir el cálculo acá crearía dos fuentes del mismo concepto que pueden empezar a
 * decir cosas distintas — exactamente lo que la regla de la fuente única prohíbe. Una sola cuenta,
 * dos lugares que la muestran.
 *
 * POR QUÉ `N()` SOBRE EL ARQUEO. La celda del arqueo la tipea una persona y puede tener un guion, un
 * texto o un formato que muestra el cero como "—". `N()` lleva cualquiera de esos casos a 0 en vez de
 * tumbar la fórmula con #VALUE! y arrastrar al total de disponibilidades y a los dos cash flow.
 *
 * POR QUÉ NO QUEDA VACÍA CUANDO EL ARQUEO ESTÁ VACÍO. Porque desde este cambio esta celda es la ÚNICA
 * que aporta el efectivo al total: si devolviera "" con movimientos cargados, el total perdería esa
 * plata en silencio. Sólo queda vacía cuando no hay ni arqueo ni movimientos, que es el único caso en
 * que de verdad no hay nada que decir.
 *
 * @param {{arqueo:string, tc:string, neta:string}} refs referencias A1 (ej. '$C$7', '$D$7', '$C$13')
 * @returns {string} fórmula con el `=` adelante, separador es-AR
 */
export function formulaCajaEnPesos({ arqueo, tc, neta }) {
  if (!arqueo || !tc || !neta) throw new Error('formulaCajaEnPesos necesita las tres referencias: arqueo, tc, neta')
  return `=IF(AND(${arqueo}="";${neta}=0);"";N(${arqueo})*IF(${tc}="";1;${tc})+${neta})`
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// LOS TRES SUMANDOS, EXPUESTOS PARA EL DESGLOSE
//
// La celda de arriba muestra UN número. Un número solo en una planilla de plata no se puede discutir:
// hay que poder abrirlo. Estas tres funciones son las mismas que arma la línea neta —se importan, no
// se reescriben— y sirven para escribir el desglose debajo, cada renglón con su signo.

// ═══ EL DESGLOSE TIENE QUE ESTAR GUARDADO POR EL MISMO ARQUEO QUE EL TOTAL (01/08) ═══
//
// VISTO EN LA PESTAÑA REAL, con la fecha de arqueo vacía: el total decía "—" y los renglones de abajo
// decían "(−) pagado en efectivo −$126.617.300" y "(−) depositado −$9.960.000". Números enormes,
// falsos, y que no sumaban el total que tenían encima.
//
// LA CAUSA es una asimetría de Sheets que no se ve leyendo una fórmula sola: contra una celda VACÍA,
// `SUMIFS(...;">"&$F$6)` no matchea nada (criterio ">" sin operando) mientras que el `(fecha>$F$6)` de
// un SUMPRODUCT trata el vacío como CERO y da verdadero para TODAS las fechas. El mismo arqueo vacío
// devolvía 0 en la línea de cobros y el histórico COMPLETO en las de pagos y depósitos.
//
// El total ya estaba a salvo —`formulaNetaEfectivoPosterior` abre con `IF(NOT(ISNUMBER(arqueo));0;`—,
// así que el defecto vivía sólo en el desglose. Un desglose que contradice a su total es peor que no
// tenerlo: el que lo mira concluye que la empresa pagó $126 millones en billetes. La misma guarda, en
// los cuatro renglones, y el desglose vuelve a decir exactamente lo que dice el total.

/** La guarda del arqueo, la misma que abre el total. Sin fecha no hay ventana: 0, no el histórico. */
const guardado = (arqueo, cuerpo) => `=IF(NOT(ISNUMBER(${arqueo}));0;${cuerpo})`

/**
 * NÚCLEO PURO: ¿el conteo cargado es más nuevo que el sello? — la decisión de resellar.
 *
 * Se compara en CENTAVOS redondeados: el valor sellado viaja por la API como flotante y una
 * comparación exacta resellaría en cada corrida por un decimal fantasma. Sin conteo cargado no hay
 * nada que sellar: la fórmula ya muestra 0 sola por la guarda ISNUMBER.
 * @param {{valor:number, fecha:number}} arqueo lo que está tipeado hoy
 * @param {{valor:number, fecha:number}} sello  la copia sellada en la última corrida
 * @returns {boolean}
 */
export function necesitaSello(arqueo = {}, sello = {}) {
  const cent = (x) => Math.round((Number(x) || 0) * 100)
  if (!cent(arqueo.valor) && !cent(arqueo.fecha)) return false
  return cent(arqueo.valor) !== cent(sello.valor) || cent(arqueo.fecha) !== cent(sello.fecha)
}

/** Los cobros en efectivo posteriores al arqueo (CARGA la caja). Con `=` adelante, para una celda. */
export function celdaCobrosEfectivo(arqueo, c = COB) {
  return guardado(arqueo, formulaCobrosEfectivoPosteriores(arqueo, c))
}
/** Los pagos en efectivo posteriores al arqueo (DESCARGAN la caja), ya con signo negativo. */
export function celdaPagosEfectivo(arqueo, c = CMP) {
  return guardado(arqueo, `-(${formulaComprasEfectivoPosteriores(arqueo, c)})`)
}
/** Los depósitos de efectivo al banco posteriores al arqueo (DESCARGAN la caja), con signo negativo. */
export function celdaDepositosEfectivo(arqueo, c = DEP) {
  return guardado(arqueo, `-(${formulaDepositosEfectivoPosteriores(arqueo, c)})`)
}

/**
 * NÚCLEO PURO: la fila de "Movimientos de efectivo posteriores al arqueo" NO aporta valor en pesos.
 *
 * No es un detalle de presentación: es la garantía anti-doble-conteo de este cambio. El total del
 * bloque es `SUM(E7:E13)`, y desde ahora "Caja en pesos" (E7) ya incluye el neto. Si la fila del neto
 * también pusiera su valor en la columna E, el mismo efectivo entraría dos veces al total y la
 * empresa se creería $19,7 millones más líquida de lo que está.
 *
 * Se expone como constante en vez de escribir `''` suelto en el generador para que el test pueda
 * afirmarlo y para que quede dicho POR QUÉ está vacía.
 */
export const NETO_NO_SUMA_EN_PESOS = ''

/**
 * El texto de la columna de origen de "Caja en pesos". No es decoración: la celda pasa a valer algo
 * distinto de la columna de al lado (el saldo en pesos ya no es el importe de origen × tipo de
 * cambio) y quien la mire tiene que poder entender por qué sin abrir el código.
 * @param {string} rotuloNeto el rótulo de la fila del neto, para nombrarla
 */
export const origenCajaEnPesos = (rotuloNeto = 'Movimientos de efectivo posteriores al arqueo') =>
  `Arqueo de caja (columna de al lado, se carga a mano) + "${rotuloNeto}". ${IDENTIDAD}. El arqueo NUNCA se pisa: es el ancla.`
