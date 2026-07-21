// LA DEUDA DE CADA CLIENTE — Y POR QUÉ EL CUADRO DECÍA QUE NO HABÍA NINGUNA.
//
// POR QUÉ EXISTE (21/07). El dueño: "hay montos que salen en Cobranzas que tienen fechas
// actualizadas y no se están viendo reflejados los cambios". Los dos cash flows resultaron
// impecables —verificado mes a mes, al peso—. El que estaba roto era el cuadro "COBRANZAS POR
// CLIENTE" que vive al costado de la pestaña, y tenía DOS defectos, los dos invisibles:
//
// 1. RANGO FOSILIZADO. Leía `$G$5:$G$58`. Cobranzas tiene datos hasta la fila 60, así que
//    $4.435.450 de ARCOR no estaban en ningún renglón del cuadro. El rango se escribió una vez con
//    la cantidad de filas que había ese día y quedó ahí: cada fila nueva que se carga queda afuera y
//    nada avisa. Ningún script del OS lo mantenía — contenido huérfano, como lo fueron el bloque de
//    SAC y la escala del convenio.
//
// 2. "COBRADO" DEFINIDO POR TENER FECHA. La columna contaba como cobrado todo lo que tuviera fecha
//    en la columna Q —y una proyección también la tiene, porque es la fecha en que se espera
//    cobrar—. Resultado: Facturado y Cobrado daban el mismo número y la columna PENDIENTE mostraba
//    $0 con $76.000.000 sin cobrar. Un cuadro de deuda de clientes que dice que nadie debe nada es
//    peor que no tener cuadro: se usa para decidir a quién llamar.
//
// LA DEFINICIÓN CORRECTA ES EL ESTADO, NO LA FECHA. Cobrado es lo que dice la columna Estado.
// Facturado, Pendiente y Proyectado son plata que todavía no entró, y cada una es una gestión
// distinta: al Facturado se lo reclama, al Proyectado se lo confirma.

/** Las columnas de Cobranzas que usa el cuadro. */
export const COL = { cliente: '$G', total: '$M', estado: '$O' }
/** Hasta qué fila se lee. El mismo tope que el resto del archivo — ver FIN_COB en cash-flow-lineas. */
export const FIN = 400
export const INICIO = 5

const r = (col) => `${col}$${INICIO}:${col}$${FIN}`

/** Los estados que significan "la plata todavía no entró". Salen de la propia pestaña, no se inventan. */
export const NO_COBRADO = ['Facturado', 'Pendiente', 'Proyectado']

/**
 * NÚCLEO PURO: las fórmulas de una fila del cuadro.
 *
 * @param {string} celdaCliente referencia a la celda con el nombre del cliente (ej. '$AC65')
 * @param {string} celdaTotalFacturado referencia absoluta al total, para el porcentaje
 * @param {{facturado:string, cobrado:string}} cols letras de las columnas del propio cuadro
 * @returns {{facturas:string, facturado:string, cobrado:string, pendiente:string, porcentaje:string}}
 */
export function filaCliente(celdaCliente, celdaTotalFacturado, cols, fila) {
  return {
    facturas: `=COUNTIF(${r(COL.cliente)};${celdaCliente})`,
    facturado: `=SUMIF(${r(COL.cliente)};${celdaCliente};${r(COL.total)})`,
    // POR ESTADO. Era ISNUMBER de la fecha de cobro, y por eso todo figuraba cobrado.
    cobrado: `=SUMIFS(${r(COL.total)};${r(COL.cliente)};${celdaCliente};${r(COL.estado)};"Cobrado")`,
    pendiente: `=${cols.facturado}${fila}-${cols.cobrado}${fila}`,
    // EL PORCENTAJE SE FORMATEA EN LA FÓRMULA, no con el formato de la celda.
    //
    // POR QUÉ (21/07). En esta zona de Cobranzas el `repeatCell` de la API se acepta con 200 y no
    // cambia nada: hay formato heredado que gana sobre el que se escribe, y la primera fila del
    // cuadro quedaba mostrando "0,00540894073" al lado de columnas que sí decían "13,7%". Se
    // verificó que el pedido no estuviera cayendo en otra pestaña —no lo estaba—, así que en vez de
    // pelear con el formato de celda, el número sale ya escrito como corresponde.
    porcentaje: `=IF(${celdaTotalFacturado}=0;"";TEXT(${cols.facturado}${fila}/${celdaTotalFacturado};"0.0%"))`,
  }
}

/**
 * NÚCLEO PURO: la fórmula que trae la lista de clientes VIVA.
 *
 * Los nombres estaban escritos a mano, uno por fila. Un cliente nuevo no aparecía nunca, y ése es el
 * mismo defecto del rango fosilizado con otra cara. UNIQUE sobre la columna devuelve los clientes
 * que hay, ordenados, y crece solo.
 */
export function formulaClientes() {
  return `=IFERROR(SORT(UNIQUE(FILTER(${r(COL.cliente)};${r(COL.cliente)}<>"")));"")`
}

/**
 * NÚCLEO PURO: ¿este rango se quedó corto contra los datos que hay?
 *
 * LA FIRMA DEL RANGO FOSILIZADO: termina en una fila cercana a la última con datos, en vez de dejar
 * margen o quedar abierto. Un rango que termina en la 58 cuando hay 60 filas no es una decisión, es
 * una foto vieja — y va a volver a pasar en cada cuadro que se escriba con la cantidad de filas del
 * día.
 *
 * @param {number} fin última fila que lee el rango
 * @param {number} ultimaConDatos
 * @returns {{fosilizado:boolean, sinMargen:boolean, perdidas:number}}
 */
export function diagnosticarRango(fin, ultimaConDatos) {
  const perdidas = Math.max(0, ultimaConDatos - fin)
  return {
    fosilizado: perdidas > 0,
    // Menos de 40 filas de aire es una bomba puesta: la próxima carga grande lo pasa.
    sinMargen: perdidas === 0 && fin - ultimaConDatos < 40,
    perdidas,
  }
}
