// EL COSTO DE MATERIALES — UNA SOLA DEFINICIÓN PARA TODAS LAS CARAS QUE LO MUESTRAN.
//
// ═══ POR QUÉ EXISTE (13/08/2026) ═══
//
// El dueño, textual: *"el mismo concepto de materiales sea familia o individual no pueden diferir de
// ninguna manera"*. No era una preferencia de formato: dos pestañas del mismo archivo publicaban dos
// números distintos para lo mismo.
//
//   · OBRAS, columna "Materiales (neto)": medía el NETO —"Importe" (M) si está; si no, "Total" (O)
//     menos "IVA" (N)— sobre las filas con familia de material.
//   · Materiales, fila "TOTAL POR OBRA" y todo el cuadro por familia: sumaba "Total" (O), o sea CON
//     IVA, sobre exactamente las mismas filas.
//
// Medido sobre el archivo vivo (527 filas con familia): $260.686.274 contra $228.826.768. Treinta y
// un millones de diferencia entre dos celdas que dicen la misma palabra. Un auditor ya lo había
// levantado y se arregló de un solo lado, dejando el otro DECLARADO pero intacto — que es la peor de
// las dos opciones: la divergencia sigue y encima queda por escrito que se sabía.
//
// ═══ CUÁL ES EL CRITERIO CORRECTO, Y POR QUÉ NO ES OPINIÓN ═══
//
// El NETO. El IVA de una compra es crédito fiscal, no costo: entra por la posición de IVA, no por el
// resultado de la obra. Y la venta ya se mide neta (Cobranzas, "Monto neto"), así que medir el costo
// con IVA castigaba el margen de todo lo que se compra en blanco. Neto contra neto.
//
// LA REGLA NO ES "M o O" SINO "M SI ESTÁ; SI NO, O − N". Verificado contra el archivo vivo: de las
// 527 filas con familia, 54 tienen "Importe" vacío por $55.990.869 y NINGUNA de ellas tiene IVA
// cargado —son compras sin discriminar—, así que para ésas el Total ES el neto. Tomar "M o 0" les
// borraría $56M; tomar "O" a secas le agrega IVA a las otras 473.
//
// ═══ LO QUE ESTE ARCHIVO **NO** DEFINE — Y NO ES UNA OMISIÓN ═══
//
// "Materiales" aparece en el Sheet con tres significados distintos, y sólo UNO es éste:
//
//   1. COSTO de materiales (este archivo) → NETO. Es lo que se compara contra la venta y contra el
//      presupuesto. Vive en OBRAS y en las secciones por familia / por obra de Materiales.
//   2. CAJA de materiales (cash-flow-lineas / rubro-caja, "Materiales Civil") → CON IVA. Lo que sale
//      del banco sale con IVA incluido; pasarlo a neto inventaría plata que sí se pagó.
//   3. DEUDA con proveedores de materiales (Proveedores) → CON IVA. Al proveedor se le debe el total
//      de la factura, no su neto.
//
// Unificar los tres sería el error simétrico al que arregla este archivo. Por eso el nombre dice
// COSTO y no "materiales" a secas: el que venga a sumar caja acá tiene que notar que se equivocó.

import { RUBROS_CON_FAMILIA } from './familia-material.mjs'

/**
 * EL UNIVERSO: qué fila de Compras ES un material.
 *
 * "Familia de material no vacía", y no una lista de rubros, porque la columna de familia YA es la
 * proyección del rubro: `formulaFamilia()` la deja en blanco salvo que el rubro de caja sea uno de
 * `RUBROS_CON_FAMILIA`. Verificado contra el archivo vivo: 0 filas con familia y sin rubro de
 * material, 0 filas con rubro de material y sin familia. Los dos criterios seleccionan el MISMO
 * conjunto, y el de la familia es el que las dos pestañas ya sabían escribir.
 *
 * Incluye a propósito las filas cuya familia es "SIN CLASIFICAR": son materiales que nadie describió
 * todavía, no dejan de ser materiales. Sacarlas haría que el total por obra no cerrara con el total
 * por familia, que es justo el control que la pestaña Materiales publica.
 */
export const RUBROS_DE_MATERIAL = Object.freeze([...RUBROS_CON_FAMILIA])

/** El criterio de un *IFS que selecciona las filas de material. `familia` es el rango ya resuelto. */
export const esMaterialSheet = (familia) => `${familia};"<>"`

/**
 * NÚCLEO PURO: el costo neto de UNA fila. La misma regla que la fórmula, en JS.
 *
 * Una celda vacía y un cero no son lo mismo: vacío significa "no está discriminado" (y entonces el
 * total es el neto), cero significa cero. Por eso el chequeo es contra vacío/null, nunca `|| 0`.
 *
 * @param {{neto?:any, iva?:any, total?:any}} fila valores YA numéricos (o vacíos) de M, N y O
 * @returns {number}
 */
export function netoDeFila({ neto, iva, total } = {}) {
  const n = Number(neto)
  if (neto !== '' && neto !== null && neto !== undefined && Number.isFinite(n)) return n
  return (Number(total) || 0) - (Number(iva) || 0)
}

/**
 * LA MISMA REGLA, COMO FÓRMULA DE SHEET. La emiten las DOS pestañas: no hay una segunda copia que
 * pueda desincronizarse, que es exactamente el defecto que este archivo cierra.
 *
 * Se arma con tres SUMIFS y no con un SUMPRODUCT porque los criterios llegan ya escritos en la
 * gramática de los *IFS (rango;criterio) desde los dos llamadores, y porque un SUMIFS sobre un rango
 * abierto no recalcula toda la columna en cada edición.
 *
 *   SUMIFS(M;crit)                    lo que está discriminado
 * + SUMIFS(O;crit;M;"") − SUMIFS(N;crit;M;"")   lo que no: su total menos su IVA
 *
 * @param {object} a
 * @param {string} a.neto  rango abierto de "Importe" (M), ya resuelto por rótulo
 * @param {string} a.iva   rango abierto de "IVA" (N)
 * @param {string} a.total rango abierto de "Total" (O)
 * @param {string} a.criterios pares `rango;criterio` ya formateados que acotan el universo — al
 *   menos el de familia (`esMaterialSheet`) o uno equivalente. Sin criterios suma TODO Compras.
 * @returns {string} la expresión, SIN el '=' (el llamador decide si es celda o sub-expresión)
 */
export function sumaNetaSheet({ neto, iva, total, criterios }) {
  for (const [k, v] of Object.entries({ neto, iva, total, criterios })) {
    // Un rango `undefined` produce `$undefined$4:$undefined`, que PARSEA distinto y Sheets rechaza al
    // evaluar: 40 celdas con #ERROR! en la cara del dueño ya se publicaron así una vez.
    if (typeof v !== 'string' || (k !== 'criterios' && !v)) {
      throw new Error(`costo-materiales: "${k}" tiene que ser un rango/criterio ya resuelto, y vino ${JSON.stringify(v)}.`
        + ' No se emite una fórmula con una referencia rota.')
    }
  }
  const sinImporte = `${criterios};${neto};""`
  return `SUMIFS(${neto};${criterios})+SUMIFS(${total};${sinImporte})-SUMIFS(${iva};${sinImporte})`
}

/**
 * NÚCLEO PURO: el costo neto de un conjunto de filas crudas de Compras.
 * Es la cara JS del mismo criterio — la usan los que ORDENAN o AGRUPAN antes de escribir la fórmula.
 *
 * @param {any[][]} filas filas crudas (sin encabezado)
 * @param {object} o
 * @param {(v:any)=>number} o.monto parser de importe en es-AR
 * @param {number} o.colNeto índice 0-based de "Importe"
 * @param {number} o.colIva índice 0-based de "IVA"
 * @param {number} o.colTotal índice 0-based de "Total"
 * @returns {number}
 */
export function netoDeFilaCruda(fila, { monto, colNeto, colIva, colTotal }) {
  const crudo = fila?.[colNeto]
  const vacio = crudo === '' || crudo === null || crudo === undefined
  return netoDeFila({
    neto: vacio ? '' : monto(crudo),
    iva: monto(fila?.[colIva]),
    total: monto(fila?.[colTotal]),
  })
}
