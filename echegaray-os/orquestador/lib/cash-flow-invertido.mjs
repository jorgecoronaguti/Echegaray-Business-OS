// LO QUE ESTÁ INVERTIDO — EL SUMANDO QUE LA CAJA OPERATIVA DEJA AFUERA A PROPÓSITO.
//
// ═══ POR QUÉ EXISTE (28/08/2026) ═══
//
// CAJA discrimina desde el 06/08 lo que está invertido: las dos filas de Balanz llevan el `‖` y el
// total de disponibilidades las RESTA, por orden explícita del dueño —*"la caja disponible tiene que
// ser únicamente el saldo bancario y el efectivo, discriminar lo que se encuentra en Balanz
// invertido"*—. Es el panel operating-cash vs invested-balances de J.P. Morgan Access, y esa decisión
// se respeta entera: la caja operativa NO los suma.
//
// Pero los dos Cash Flow heredaron sólo la mitad de esa decisión. Publicaban la caja operativa al
// cierre y nada más, así que $45.015.210 de la empresa no aparecían en ninguna cifra de las dos
// pestañas donde el dueño mira cómo termina el año. Discriminar no es esconder: el panel de JPM
// muestra los dos números, y la liquidez total es la suma de los dos.
//
// ═══ POR QUÉ POR RÓTULO Y NO POR FILA ═══
//
// El cuadro de CAJA se corre de fila sin avisar: sus cuentas nacen de una lista (`caja-disponibilidades`)
// y el generador reparte las filas al escribir. Una referencia `Caja!$C$11` sigue devolviendo un número
// después de que se agregue una cuenta arriba —otro número, sin un solo #REF!—, que es exactamente el
// modo de falla por el que existe `materiales-fusion.mjs`. Acá el emparejamiento es por el RÓTULO de la
// cuenta, y el rótulo es el contrato.
//
// Y el criterio no dice "Balanz": dice `‖ invertido`, que es la MARCA con la que CAJA declara "esto no
// es caja operativa". El día que la empresa tenga un plazo fijo, entra solo. Que hoy todo lo invertido
// esté en Balanz lo verifica un test contra la propia lista de cuentas de CAJA — si deja de ser cierto,
// se pone rojo y la glosa que nombra al broker se corrige antes de mentir.
//
// ═══ LO QUE NO SE PUDO HACER, Y QUEDA PROPUESTO ═══
//
// Lo correcto a largo plazo es que CAJA publique un rango con nombre (`CAJA_INVERTIDO`) al lado de
// `CAJA_TOTAL_DISPONIBLE`, y que las vistas lo citen sin conocer la geometría de la pestaña. Eso exige
// agregarle a CAJA una fila con el total de lo invertido y REGENERAR la pestaña, y hoy escribir CAJA
// está vedado. Mientras tanto el SUMIF por rótulo da el mismo número sin tocar una sola celda de CAJA;
// el día que el nombre exista, este módulo se reduce a devolverlo.
//
// NÚCLEO PURO: no toca la red, no lee el Sheet, no sabe de Google.

import { ALERTA } from './glifos.mjs'

/** La marca con la que CAJA declara que una cuenta NO es caja operativa. Ver `caja-disponibilidades`. */
export const MARCA_INVERTIDO = '‖ invertido'

/** El criterio de SUMIF que empareja por rótulo. `*` es el comodín de Sheets, no una expresión regular. */
export const CRITERIO_INVERTIDO = `*${MARCA_INVERTIDO}`

/**
 * Las dos columnas de CAJA que este módulo cita: el rótulo de la cuenta y su saldo en pesos.
 *
 * NO son una costumbre: `caja-grilla` escribe cada cuenta como `[nombre, importe en origen, saldo en
 * pesos, fecha]` desde la columna A. El test las verifica generando la grilla de CAJA en memoria y
 * buscando las filas de Balanz por su rótulo — si mañana el panel gana una columna, se pone rojo acá
 * y no en la pestaña del dueño.
 */
export const COL_ROTULO = 'A'
export const COL_PESOS = 'C'

/** Lo que se muestra en la celda del importe cuando lo invertido no se pudo leer. */
export const AVISO_SIN_INVERTIDO = `${ALERTA} sin dato`

/** Y la glosa que dice por qué. Un importe con una advertencia al lado no es lo mismo que un importe. */
export const GLOSA_SIN_INVERTIDO = 'no pude leer lo invertido en CAJA'

/**
 * EL PEOR CASO CON EL QUE SE MIDEN LAS GLOSAS. Es el mismo número de `IMPORTE_MAS_LARGO`
 * (cash-flow-hero-cabe) con el formato de una glosa, y un test verifica que sigan siendo el mismo. No
 * es una cifra real: es la prueba de que el titular no depende de que el número sea corto.
 */
export const IMPORTE_MUESTRA = '$ 1.234.567.890'

/** Una pestaña citada en una fórmula. Las comillas simples internas se duplican, como en Sheets. */
const citar = (titulo) => {
  const s = String(titulo ?? '').trim()
  return s ? `'${s.replaceAll("'", "''")}'` : null
}

/**
 * NÚCLEO PURO: la expresión que suma lo invertido leyendo CAJA POR RÓTULO.
 *
 * Columnas enteras a propósito: en qué fila cae cada cuenta lo decide el generador de CAJA al escribir,
 * y acotar el rango a un tramo sería volver al emparejamiento posicional por la ventana.
 *
 * @param {string|null} pestanaCaja el TÍTULO real de la pestaña, resuelto contra el archivo
 * @returns {string|null} la expresión, o null si no se sabe qué pestaña leer
 */
export function expresionInvertido(pestanaCaja) {
  const tab = citar(pestanaCaja)
  if (!tab) return null
  return `SUMIF(${tab}!$${COL_ROTULO}:$${COL_ROTULO};"${CRITERIO_INVERTIDO}";${tab}!$${COL_PESOS}:$${COL_PESOS})`
}

/**
 * NÚCLEO PURO — LA DECISIÓN, EN JAVASCRIPT: qué publica la tarjeta de liquidez total.
 *
 * Existe separada de la fórmula porque un test sobre la fórmula prueba que alguien escribió un `IF`, no
 * que el `IF` decide bien. Acá se decide con números y se prueban las dos ramas; la fórmula de abajo
 * emite exactamente esas dos ramas y el test compara los textos que publica cada una.
 *
 * UN CERO NO SE PUBLICA COMO LIQUIDEZ. Si lo invertido da 0 —porque la pestaña no está, porque el
 * rótulo cambió, porque la celda quedó vacía— la tarjeta valdría lo mismo que la caja operativa y
 * diría, sin decirlo, "no hay nada invertido". Eso hoy es falso por $45.015.210.
 *
 * @param {{cierre:number, invertido:number|null}} p
 * @returns {{total:number|null, aviso:string|null}}
 */
export function liquidezDeNumeros({ cierre, invertido }) {
  const inv = Number(invertido)
  if (invertido === null || invertido === undefined || !Number.isFinite(inv) || inv === 0) {
    return { total: null, aviso: GLOSA_SIN_INVERTIDO }
  }
  return { total: Number(cierre || 0) + inv, aviso: null }
}

/** `#,##0` va en US, como todo patrón de formato del repo; los argumentos, en es-AR con `;`. */
const plata = (expr) => `TEXT(${expr};"$ #,##0")`

/** Lo que la glosa mide en el peor caso: lo que el auditor de ancho tiene que poder medir. */
export const muestraIncluye = () => `incluye ${IMPORTE_MUESTRA} invertido en Balanz`

/** Y la del Semanal, que cuelga de la fecha del saldo declarado. */
export const muestraSemanal = (fecha = 'al 28/08') => `${fecha} · más ${IMPORTE_MUESTRA} invertido en Balanz`

/**
 * NÚCLEO PURO: las dos celdas de la tarjeta de liquidez total, en fórmula es-AR.
 *
 * @param {{refCierre:string, exprInvertido:string|null}} p
 * @returns {{valor:string, glosa:string, muestra:string}}
 */
export function formulasDeLiquidez({ refCierre, exprInvertido }) {
  if (!exprInvertido) {
    return { valor: AVISO_SIN_INVERTIDO, glosa: GLOSA_SIN_INVERTIDO, muestra: GLOSA_SIN_INVERTIDO }
  }
  const inv = `N(${exprInvertido})`
  return {
    valor: `=IF(${inv}=0;"${AVISO_SIN_INVERTIDO}";N(${refCierre})+${inv})`,
    glosa: `=IF(${inv}=0;"${GLOSA_SIN_INVERTIDO}";"incluye "&${plata(exprInvertido)}&" invertido en Balanz")`,
    muestra: muestraIncluye(),
  }
}

/**
 * NÚCLEO PURO: la glosa de CAJA HOY del Semanal — la misma plata, dicha en la vista que ya tenía su
 * propio titular. No se le copian las cuatro cifras del Mensual: el Semanal contesta otras preguntas.
 *
 * @param {string} base la expresión de la glosa que ya publicaba la tarjeta (sin el `=`)
 * @param {string|null} exprInvertido
 */
export function glosaConInvertido(base, exprInvertido) {
  if (!exprInvertido) return `=${base}&" · ${GLOSA_SIN_INVERTIDO}"`
  const inv = `N(${exprInvertido})`
  return `=${base}&IF(${inv}=0;" · ${GLOSA_SIN_INVERTIDO}";" · más "&${plata(exprInvertido)}&" invertido en Balanz")`
}
