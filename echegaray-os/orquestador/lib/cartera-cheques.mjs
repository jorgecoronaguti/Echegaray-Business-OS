// LA CARTERA DE VALORES, COMO FÓRMULA VIVA SOBRE LA RÉPLICA DE CHEQUES.
//
// ═══ POR QUÉ (30/07) ═══
//
// El dueño: "CAJA dice $10.000.000 de Valores a depositar, si no es así modificalo" y "cambiar de
// estado en Compras y Cobranzas tiene que generar un impacto en tiempo real".
//
// La cartera real era $10.290.000 y CAJA mostraba $10.000.000. No era un error de tipeo: era una
// CADENA MUERTA. El número salía de `=SUM(C47)` —UNA celda del detalle— y esa celda tenía pegado el
// importe de un array de JavaScript (`banco-santander.mjs`, ECHEQS_TERCEROS) escrito a mano el 21/07.
// El cheque 514 de Mineral Del Río ($290.000) entró a `public.cheques` el 30/07, apareció en la
// réplica `_CHEQUES_RAW` del propio archivo… y en CAJA no existía. Nada avisó: la celda no da error,
// simplemente muestra la cartera de la semana pasada.
//
// Y HABÍA UNA SEGUNDA MITAD, PEOR. El calendario de vencimientos ("¿cuándo entra la plata?") leía
// `$C$47` y `$F$47` — dos celdas FIJAS. Con un solo cheque en cartera funcionaba de casualidad; con
// dos, el segundo no entra en ningún tramo y el piso proyectado de caja queda mal calculado sin que
// ninguna suma se rompa. Un rango fosilizado no se equivoca hoy: se equivoca el día que entra el
// segundo dato.
//
// ═══ QUÉ HACE ESTE MÓDULO ═══
//
// Devuelve las fórmulas que leen `_CHEQUES_RAW` (la réplica de public.cheques dentro del archivo)
// para que el número de cartera de CUALQUIER pestaña salga de la fuente y no de una copia:
//
//   · el total en cartera (lo que todavía no es caja);
//   · cuánto de eso entra en cada tramo del calendario, por fecha de pago;
//   · el importe y la fecha de UN cheque concreto, para el detalle línea por línea;
//   · el canario que grita si el detalle quedó viejo.
//
// EL RANGO ES ABIERTO (`$G$4:$G`): si mañana entra un cheque más, las fórmulas lo toman sin que nadie
// toque nada. Eso es lo que hace que la pestaña esté VIVA y no que "se actualice cuando corre el
// agente" — que es otra cosa, y es la que venía fallando.
//
// POR QUÉ SUMIFS Y NO SUMPRODUCT: SUMIFS ignora el texto en la columna de importes en vez de
// devolver #VALUE!, y sus criterios de fecha (">="&TODAY()+7) no necesitan ISNUMBER. Un cheque sin
// fecha de pago no cae en ningún tramo — por eso el canario compara el total contra la suma de los
// tramos: si un valor se pierde por no tener fecha, se ve.
//
// SEPARADOR `;`: el archivo es es-AR. Ver memoria formula-por-api-va-en-locale.

import { PESTAÑA as RAW, COL as R, FILA0 } from '../scripts/cheques-raw-pestana.mjs'

/** El estado que significa "todavía es un valor mío y todavía NO es caja". Lo escribe el banco. */
export const EN_CARTERA = 'En custodia'

/** Un rango abierto de la réplica, por letra de columna. Abierto = toma los cheques que entren. */
export const rango = (col) => `${RAW}!$${col}$${FILA0}:$${col}`

const IMP = () => rango(R.importe)
const TIPO = () => rango(R.tipo)
const EST = () => rango(R.estado)
const FP = () => rango(R.fechaPago)
const NUM = () => rango(R.numero)

/** Los criterios comunes: un cheque RECIBIDO que sigue EN CARTERA. */
const enCartera = () => `${TIPO()};"recibido";${EST()};"${EN_CARTERA}"`

/**
 * NÚCLEO PURO: el total en cartera. Es el número de "Valores a depositar" de CAJA.
 * @returns {string} fórmula es-AR
 */
export function formulaCartera() {
  return `=SUMIFS(${IMP()};${enCartera()})`
}

/** NÚCLEO PURO: cuántos cheques hay en cartera. Para el canario y para el detalle. */
export function formulaCuentaCartera() {
  return `=COUNTIFS(${enCartera()})`
}

/**
 * NÚCLEO PURO: cuánto de la cartera entra en un tramo del calendario.
 *
 * El tramo es (desde, hasta]: mismos bordes que usa el lado que SALE, así que un cheque no puede
 * caer en dos tramos ni quedar sin tramo. Los bordes llegan como EXPRESIONES de fórmula
 * ("TODAY()+7", "MAX(TODAY()+14;EOMONTH(TODAY();0))"), no como fechas: el calendario tiene que
 * moverse solo cada día sin que nadie lo regenere.
 *
 * @param {string|null} desde expresión del borde inferior (null = sin piso: el tramo "vencido")
 * @param {string|null} hasta expresión del borde superior (null = sin techo: "más adelante")
 */
export function formulaCarteraTramo(desde = null, hasta = null) {
  const cond = []
  if (desde) cond.push(`${FP()};">="&${desde}`)
  if (hasta) cond.push(`${FP()};"<"&${hasta}`)
  // Sin bordes no hay tramo: devolver el total entero acá sería un error silencioso en el calendario.
  if (!cond.length) return formulaCartera()
  return `=SUMIFS(${IMP()};${enCartera()};${cond.join(';')})`
}

/**
 * NÚCLEO PURO: el importe de UN cheque, y sólo mientras siga en cartera.
 *
 * POR QUÉ LA CONDICIÓN DE ESTADO VA ADENTRO: cuando el cheque se deposita, su fila del detalle pasa
 * a $0 sola y el detalle sigue sumando lo mismo que el total de arriba. Sin eso, depositar un cheque
 * dejaría el detalle mostrando plata que ya entró y el total (que sí es vivo) más bajo — dos números
 * distintos en la misma pestaña, que es la forma más rápida de perder la confianza en el archivo.
 *
 * POR QUÉ SUMIFS Y NO INDEX/MATCH POR NÚMERO: el número NO identifica un cheque —un FISICO 313 y un
 * ECHEQ 313 son distintos (ver memoria cheque-numero-no-identifica)—. Sumar con el tipo adentro es
 * exacto para los recibidos y devuelve 0, no #N/A, si el cheque desaparece de la base.
 *
 * @param {string} numero tal como está en la réplica (con ceros a la izquierda: "00000514")
 */
export function formulaImporteEnCartera(numero) {
  return `=SUMIFS(${IMP()};${enCartera()};${NUM()};"${String(numero ?? '').replace(/"/g, '')}")`
}

/**
 * NÚCLEO PURO: la fecha de pago de UN cheque recibido, viva.
 *
 * Devuelve "" —no 31/12/1899— si el cheque no está: una celda de fecha con un cero adentro se dibuja
 * como el año 1899 y se lee como un dato, no como un faltante. Ese defecto está a la vista hoy mismo
 * en la pestaña vieja de Cheques Recibidos.
 */
export function formulaFechaDeCheque(numero) {
  const n = String(numero ?? '').replace(/"/g, '')
  const cuenta = `COUNTIFS(${TIPO()};"recibido";${NUM()};"${n}")`
  return `=IF(${cuenta}=0;"";SUMIFS(${FP()};${TIPO()};"recibido";${NUM()};"${n}"))`
}

/**
 * NÚCLEO PURO: EL CANARIO DEL DETALLE — la línea que impide que esta pestaña mienta en silencio.
 *
 * El total y el calendario son fórmulas vivas, pero las FILAS del detalle las escribe el generador:
 * si entra un cheque nuevo y el generador no volvió a correr (por ejemplo porque la pestaña está
 * candada), el detalle lista uno menos. El total seguiría bien y nadie lo notaría.
 *
 * Esta fila compara tres cosas contra la fuente y dice qué hacer:
 *   · cuántos cheques hay en cartera vs. cuántos lista el detalle;
 *   · cuánto suma el detalle vs. el total vivo;
 *   · cuánto reparte el calendario vs. el total vivo (un cheque SIN fecha de pago no entra en ningún
 *     tramo: se perdería del calendario sin romper ninguna suma).
 *
 * @param {number} listadas cuántas filas de detalle escribió el generador
 * @param {string} celdaTotal la celda del total vivo (ej. "$C$12")
 * @param {string} rangoDetalle el rango de importes del detalle (ej. "$C$47:$C$48")
 * @param {string} celdaCalendario la celda del total del calendario que ENTRA (ej. "$C$28")
 */
export function formulaCanarioDetalle(listadas, celdaTotal, rangoDetalle, celdaCalendario = '') {
  const n = Math.max(0, Number(listadas) || 0)
  const cuenta = `COUNTIFS(${enCartera()})`
  // ═══ CORTO A PROPÓSITO: LA COLUMNA DE ORIGEN TIENE 300px ═══
  //
  // La primera versión decía "✓ el detalle coincide con _CHEQUES_RAW: 2 cheque(s) por $10.290.000" —67
  // caracteres— y en el render se veía "✓ el detalle coin": la columna siguiente lo cortaba. Un aviso
  // cortado no avisa. Cada rama entra en ~55 caracteres, y la instrucción de qué hacer vive en el
  // rótulo de la fila (columna A), que es ancha. Se vio mirando la pestaña, no leyendo sus celdas.
  const viejo = `"⚠ la cartera son "&TEXT(${cuenta};"0")&" cheque(s) y acá hay ${n}"`
  const pisado = `"⚠ el detalle suma "&TEXT(SUM(${rangoDetalle});"$#,##0")&", no "&TEXT(${celdaTotal};"$#,##0")`
  const sinFecha = '"⚠ hay un valor en cartera sin fecha de pago"'
  const bien = `"✓ al día: "&TEXT(${cuenta};"0")&" cheque(s) por "&TEXT(${celdaTotal};"$#,##0")`
  const tercero = celdaCalendario
    ? `IF(ROUND(${celdaTotal}-${celdaCalendario};2)<>0;${sinFecha};${bien})`
    : bien
  return `=IF(${cuenta}<>${n};${viejo};IF(ROUND(${celdaTotal}-SUM(${rangoDetalle});2)<>0;${pisado};${tercero}))`
}
