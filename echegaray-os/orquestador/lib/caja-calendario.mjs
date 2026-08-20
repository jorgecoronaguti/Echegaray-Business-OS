// LA ESCALERA DE VENCIMIENTOS DE CAJA — LOS BORDES Y LO QUE ENTRA Y SALE EN CADA TRAMO.
//
// POR QUÉ VIVE EN SU PROPIO ARCHIVO (05/08/2026). Es la definición que consumen TRES lugares: el
// calendario de CAJA, el bloque de cobertura 30/60/90 de la misma pestaña y el conciliador
// `conciliar-caja-vs-cashflow.mjs`, que compara tramo por tramo contra lo que muestra la planilla. Un
// conciliador con su propia copia de los rótulos deja de comparar el día que uno de los dos renombra
// un tramo — y reporta un desvío que no existe, o peor, calla uno que sí.
//
// ESTO ES UNA ESCALERA DE VENCIMIENTOS (maturity ladder), que es como un banco mira su liquidez: cada
// tramo dice qué entra, qué sale, cuál es el neto y con cuánta plata queda la empresa DESPUÉS. La
// pregunta no es "cuánto debo" sino "en qué semana me quedo corto", y eso sólo se ve acumulando.

import { DESDE_CAJA } from './caja-anexo-nombres.mjs'
import { formulaChequesSinFactura, formulaCalendarioImpuestosSemana, INSTRUMENTOS } from './cash-flow-lineas.mjs'
import { MARCAS } from './cheques-cobertura.mjs'
import { SIN_FUENTE_EN_VENTANA } from './caja-refs.mjs'

/**
 * LOS TRAMOS SE DEFINEN POR SUS BORDES, NO POR SEIS CONDICIONES SUELTAS.
 *
 * La primera versión escribía la condición de cada tramo a mano y mezclaba tramos por SEMANA con tramos
 * por MES: en cuanto la ventana de catorce días cruza el fin de mes, un cheque cumple dos condiciones y
 * se cuenta dos veces ($11.733.832 contra $11.076.832 reales). Con bordes ORDENADOS el problema no
 * puede existir: cada tramo es (borde anterior, borde] y los bordes se fuerzan crecientes con MAX. Un
 * borde que queda antes que el anterior deja su tramo vacío, que es exactamente lo correcto.
 *
 * Los tramos son cortos cerca de hoy y largos lejos: lo que vence esta semana se decide hoy, lo de
 * noviembre no. Doce meses iguales gastarían media pantalla en meses que no cambian una decisión.
 */
export const BORDES = [
  ['Vencido — ya pasó la fecha', 'TODAY()'],
  ['Esta semana', 'TODAY()+7'],
  ['Semana que viene', 'TODAY()+14'],
  // EOMONTH()+1 Y NO EOMONTH(): el borde es EXCLUIDO (criterio `hasta` de todo el repo), así que
  // con EOMONTH a secas el ÚLTIMO día del mes caía en el tramo siguiente — el 31/08 aparecía en "El
  // mes que viene" y quien conciliaba el "Resto de este mes" contra el cierre del Cash Flow veía
  // $2.114.940 de diferencia que no era de nadie (conciliación del 06/08). "Resto de este MES"
  // tiene que contener el mes entero.
  ['Resto de este mes', 'MAX(TODAY()+14;EOMONTH(TODAY();0)+1)'],
  ['El mes que viene', 'MAX(TODAY()+14;EOMONTH(TODAY();1)+1)'],
  ['Más adelante', ''],
]

/** El piso del calendario: lo anterior al corte YA está dentro del saldo del banco. */
export const PISO_CAJA = DESDE_CAJA.fecha
/** El techo del último tramo: "Más adelante" no tiene borde y una ventana necesita dos. */
export const FIN_HORIZONTE = 'DATE(2100;1;1)'
/**
 * UN CHEQUE VIEJO Y NO DEBITADO SIGUE SIENDO PLATA QUE VA A SALIR, así que su término no se corta en el
 * corte del extracto. Serial 0 = 30/12/1899: antes que cualquier cheque.
 *
 * ...Y LA OTRA MITAD DEL MISMO INVARIANTE, QUE FALTABA Y COSTÓ $12.188.441. Abrir la ventana hasta el
 * serial 0 sólo es correcto si al mismo tiempo se excluye lo que el banco YA debitó: sin eso, "Vencido"
 * volvía a restar 10 cheques ($11.631.542) y 2 cuotas de tarjeta ($556.899) que ya habían salido de la
 * cuenta y que el saldo del extracto ya tenía descontados. Un piso demasiado bajo no es "conservador":
 * frena colocaciones que sí se podían hacer.
 *
 * El resto del calendario resuelve lo mismo por FECHA (una factura anterior al corte ya se pagó). Para
 * un cheque la fecha no alcanza: el papel puede tener fecha de hace un mes y seguir sin presentarse. La
 * pregunta es "¿salió?", y esa respuesta la da la columna DEBITADO, no el almanaque.
 */
export const DESDE_SIEMPRE = '0'
export const SOLO_PENDIENTES = { soloNoDebitados: true }

/** El borde inferior del tramo k: nunca antes del corte del extracto. */
export const desdeTramo = (k) => (k === 0 ? PISO_CAJA : `MAX(${PISO_CAJA};${BORDES[k - 1][1]})`)
/** El borde superior del tramo k. */
export const hastaTramo = (k) => BORDES[k][1] || FIN_HORIZONTE

/**
 * EL ÍNDICE DEL TRAMO DEL PASADO. Se nombra en vez de escribir `0` en tres lados: quien reordene
 * `BORDES` tiene un test que le dice que este índice dejó de apuntar a "Vencido", en vez de aplicarle
 * el filtro de abajo al tramo equivocado y hacer desaparecer los cobros de una semana entera.
 */
export const TRAMO_VENCIDO = 0

/**
 * NÚCLEO PURO: EL LADO DEL LIBRO QUE CUENTA CADA TRAMO. `null` = los dos.
 *
 * ═══ UN COBRO VENCIDO NO ES PLATA QUE ENTRÓ (17/08/2026) ═══
 *
 * El tramo del pasado abre en el serial 0 porque un cheque librado hace un mes y sin presentar sigue
 * siendo plata que VA A SALIR (ver `DESDE_SIEMPRE`). Ese argumento vale para el egreso y NO vale para
 * el ingreso, y sumar los dos lados con la misma regla es lo que se estaba haciendo:
 *
 *   · un EGRESO vencido sigue vivo — la obligación no se extingue porque pase la fecha;
 *   · un INGRESO vencido es exactamente el cobro que NO ocurrió. Contarlo en el tramo del pasado
 *     afirma que ya entró, que es presentar una estimación como hecho.
 *
 * MEDIDO EN EL ARCHIVO VIVO el 17/08: dos cobranzas en efectivo de «San Francisco» por $20.000.000
 * (14/08) y $3.864.127 (15/08) quedaron en VENCIDO. El tramo las sumaba, así que valía +$9.073.578
 * en lugar de −$14.790.549, y el PISO del recorrido —el número con el que se decide qué se paga hoy—
 * publicaba $4.782.997 de colchón cuando el peor caso real era −$19.081.130.
 *
 * Y la pestaña se contradecía sola: la fila de acciones emitía *"Reclamar $23.864.127 de cobranzas
 * vencidas"* (`caja-avisos.mjs`) sobre la misma plata que la escalera daba por cobrada.
 *
 * LO QUE ESTO NO HACE: no borra esa plata del archivo. El cobro vencido sigue en el libro, sigue en
 * "hay $X a cobrar" y sigue en la acción que manda a reclamarlo. Lo único que deja de hacer es entrar
 * al saldo proyectado como si hubiera entrado a la cuenta.
 *
 * @param {number} k el índice del tramo en `BORDES`
 * @returns {-1|null} `-1` (SALE) para el tramo del pasado, `null` para el resto
 */
export const signoDelTramo = (k) => (k === TRAMO_VENCIDO ? -1 : null)

/**
 * Lo que la definición única del cuadro de caja no sabe resolver sola, resuelto acá y sólo acá.
 *
 * ⚠ EL TÉRMINO DE CHEQUES ES "SIN FACTURA CARGADA", NO "TODOS LOS NO DEBITADOS": el cheque es el
 * INSTRUMENTO y la factura la OBLIGACIÓN, y Compras entera ya viaja en los otros sumandos. Sumar los
 * cheques enteros contaba $43.380.472 dos veces. La marca del cruce la escribe `cheques-cobertura` fila
 * por fila, así que acá se LEE esa marca en vez de rehacer la normalización de comprobantes.
 *
 * @param {number} k el tramo, para saber si la ventana de cheques arranca en el serial 0
 * @param {object} filasCal las filas del IVA/IIBB en "Impuestos y Financieros", ubicadas por rótulo
 */
export function resolutorDeTramo(k, filasCal, anio = new Date().getFullYear()) {
  return {
    'cheques:cheques': (desde, hasta) => formulaChequesSinFactura(
      k === 0 ? DESDE_SIEMPRE : desde, hasta, MARCAS.falta, [INSTRUMENTOS.cheques], SOLO_PENDIENTES).slice(1),
    'cheques:tarjeta': (desde, hasta) => formulaChequesSinFactura(
      k === 0 ? DESDE_SIEMPRE : desde, hasta, MARCAS.falta, [INSTRUMENTOS.tarjeta], SOLO_PENDIENTES).slice(1),
    // El IVA/IIBB a pagar NO vive en Compras: lo calcula "Impuestos y Financieros" y esta línea lo LEE.
    // Las filas llegan ubicadas por rótulo; una referencia a fila muerta devuelve $0 sin un solo error.
    impuestos: (desde, hasta) => formulaCalendarioImpuestosSemana(desde, hasta, anio, filasCal).slice(1),
    ...Object.fromEntries(SIN_FUENTE_EN_VENTANA.map((m) => [m, () => '0'])),
  }
}

/**
 * Las cobranzas ESPERADAS de un tramo: todo lo que Cobranzas no marca como cobrado ni endosado, por su
 * fecha de cobro. Mismo criterio que la línea "Cobranzas esperadas" del cash flow —una sola definición
 * de "esperado" en el archivo— y mismos bordes que el lado que sale, así que nada cae en dos tramos.
 *
 * ISNUMBER sobre la fecha, SIEMPRE: una fecha guardada como TEXTO compara como mayor que cualquier
 * número y el mismo cobro entraría en varios tramos. Es el defecto que ya costó $657.000 del lado de
 * los cheques.
 */
export function cobranzasEsperadasTramo(desde, hasta) {
  const est = 'LOWER(Cobranzas!$O$5:$O$400)'
  const fecha = 'Cobranzas!$Q$5:$Q$400'
  const monto = 'IF(ISNUMBER(Cobranzas!$M$5:$M$400);Cobranzas!$M$5:$M$400;0)'
  const cond = [`(${est}<>"cobrado")`, `(${est}<>"endosado")`, `ISNUMBER(${fecha})`]
  if (desde) cond.push(`(${fecha}>=${desde})`)
  if (hasta) cond.push(`(${fecha}<${hasta})`)
  else if (!desde) cond.push(`(${fecha}<TODAY())`)   // el tramo "Vencido": fecha de cobro ya pasada
  return `SUMPRODUCT(${cond.join('*')}*${monto})`
}
