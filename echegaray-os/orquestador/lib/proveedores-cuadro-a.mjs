// LAS COLUMNAS QUE CUELGAN DEL NOMBRE DEL PROVEEDOR — el cuadro que abre la sección 1.
//
// ═══ POR QUÉ EXISTE ESTE ARCHIVO (14/08, después del rechazo) ═══
//
// El dueño: *"la base SIEMPRE es el nombre del proveedor"*. Una tabla dinámica nativa contesta
// "cuánto le debo a cada uno" y nada más: sólo sabe agrupar y sumar columnas de SU ORIGEN. Las dos
// cosas que faltan para decidir un pago —CUÁNDO le vence lo primero y QUÉ HACER con él— no son
// columnas de Compras que se puedan sumar, así que no pueden ser columnas del pivot.
//
// Van a su derecha, como fórmulas ANCLADAS AL NOMBRE que el pivot acaba de escribir en la columna A.
// Nunca a la fila: el cuadro se reordena solo cada vez que cambia una deuda, y escribir la nota en la
// fila 22 porque hoy ahí está Mariana SA es cómo la nota de uno termina al lado de otro.
//
// ═══ LA GEOMETRÍA, Y POR QUÉ SON CUATRO COLUMNAS Y NO SIETE ═══
//
//   A (330px)  Proveedor      el pivot · el eje
//   B (130px)  Se le debe     el pivot · SUM de Compras!AL, ordenado descendente = el ranking
//   C (125px)  Vence          fórmula · la fecha de pago más próxima de lo que todavía se le debe
//   D (300px)  Qué hacer      fórmula · la nota del dueño, la MISMA de proveedores-notas-columna
//
// El criterio de corte es el del área: ¿qué decisión cambia si esta columna cambia? "Facturas" (el
// conteo) no cambia ninguna —el cuadro de detalle las lista una por una—. "Cómo se paga" tampoco
// acá: el medio ya está por operación en el cuadro de detalle y por total en el encabezado, y una
// tercera copia es lo que la regla de minimalismo prohíbe. Se declara como límite, no se esconde.
//
// La D no es una columna cualquiera: es donde el dueño tenía sus doce notas (D17:D28) antes de que
// el cambio de eje se las llevara puestas. Vuelven a la columna en la que las escribió, con el ancho
// que ya tenían.

import { camposDeFila, COL, valoresDelPivot, VISTA } from './proveedores-pivot-seccion1.mjs'
import { requestsDeNotas, ROTULO_NOTA } from './proveedores-notas-columna.mjs'

/**
 * EL RÓTULO DE LA COLUMNA DEL VENCIMIENTO — y por qué dejó de decir "Vence" (14/08).
 *
 * La fórmula siempre calculó bien: la fecha de pago MÁS PRÓXIMA de lo que se le debe. El rótulo era
 * el que mentía, porque se lee contra el total de la columna de al lado. Medido en el archivo real:
 *
 *   Alumetal · Se le debe $5.567.190 · "Vence 21/08"   ⇒ el 21/08 vencen $392.905.
 *                                                         El resto es 29/08 ($3.159.345) y 31/08.
 *   Corralon Progreso · $232.324 · "Vence 21/08"       ⇒ el 21/08 vencen $200.867.
 *
 * Quien mira ese cuadro para juntar la plata del 21 se prepara para $5.799.514 y salen $593.772. La
 * fecha es del PRIMER vencimiento, no del saldo entero, y el rótulo tiene que decir eso. El "cuánto
 * sale ese día" no se contesta acá: lo contesta el cuadro "QUÉ SALE CADA DÍA", que es su lugar.
 */
export const ROTULO_VENCE = 'Primer vencimiento'

/** La columna donde el pivot escribe el nombre. Es el ancla de las dos fórmulas. */
export const COL_PROVEEDOR = 0

/**
 * LA PRIMERA COLUMNA LIBRE A LA DERECHA DEL PIVOT — calculada, nunca tipeada.
 *
 * Campos de fila + valores. El día que el cuadro gane o pierda un valor, las dos columnas de fórmula
 * se corren con él en vez de caer encima del importe o de dejar una columna muerta en el medio.
 *
 * @returns {number} índice 0-based (hoy 2 ⇒ la C)
 */
export function colVence() {
  return camposDeFila({ vista: VISTA.POR_PROVEEDOR }).length
    + valoresDelPivot({ vista: VISTA.POR_PROVEEDOR }).length
}

/** La columna de la nota "Qué hacer": la siguiente (hoy 3 ⇒ la D). */
export function colNota() {
  return colVence() + 1
}

/** La letra de una columna del bloque. El bloque nunca pasa de la G: una sola letra alcanza. */
export const letra = (i) => String.fromCharCode(65 + i)

/**
 * EL VENCIMIENTO MÁS PRÓXIMO DE LO QUE TODAVÍA SE LE DEBE A UN PROVEEDOR.
 *
 * ═══ SE MIDE CONTRA `Compras!AL`, LA MISMA COLUMNA QUE SUMA EL PIVOT ═══
 *
 * El dueño: *"tomaba mal columnas de compras"*. La causa de fondo es que la deuda de una fila sale de
 * TRES tramos de pago (`T Monto Pagado`, `U Monto Parcial 1`, `W Monto Parcial 2`) donde un valor
 * NEGATIVO en U/W no es un pago sino lo que FALTA, escrito entre paréntesis. Esa aritmética tiene un
 * solo dueño —`lib/deuda-por-tramos.mjs`, que emite la fórmula de `Compras!AL`— y esta columna la
 * consume en vez de recalcularla: una segunda cuenta es una segunda respuesta.
 *
 * `MINIFS` sobre las filas del proveedor con saldo vivo. Dos cuidados medidos:
 *
 *  · Hay filas de Compras con la palabra "Pendiente" donde va la fecha. MINIFS ignora lo no numérico
 *    y, si no queda ninguna fecha, devuelve 0 — que formateado como fecha se lee `30/12/1899`. Se
 *    convierte a vacío: una celda vacía dice "no tiene fecha", un 1899 dice cualquier cosa.
 *  · `LET` guarda el MINIFS una sola vez. El nombre no puede parecerse a una referencia A1 (ver la
 *    lección `let-nombre-a1-y-arrayformula`): `venceProx` no lo es.
 *
 * Separador `;` porque el archivo es es_AR — con `,` Google devuelve error recién en la celda.
 *
 * @param {number} fila  la fila de la pestaña, base 1
 * @param {string} letraProveedor  la columna donde el pivot escribe el nombre
 * @returns {string}
 */
export function formulaVence(fila, letraProveedor = 'A') {
  const ancla = `$${letraProveedor}${fila}`
  const minifs = 'MINIFS(Compras!$Q$4:$Q;Compras!$E$4:$E;' + ancla + ';Compras!$AL$4:$AL;">0")'
  return `=IF(${ancla}="";"";IFERROR(LET(venceProx;${minifs};IF(venceProx=0;"";venceProx));""))`
}

/**
 * CUÁNTAS FILAS HAY QUE RESERVARLE AL CUADRO — Y POR QUÉ NO SE CUENTA CON `trim()`.
 *
 * ═══ EL PEOR MODO DE FALLA DE ESTA SECCIÓN ═══
 *
 * Una dinámica que no entra en el lugar reservado NO da error: Google se niega a renderizarla y la
 * sección desaparece entera. Falla cerrado —no borra nada, que es lo correcto— pero en silencio.
 *
 * El generador contaba proveedores con `trim()` y el pivot agrupa por el VALOR CRUDO: "RSV" y "RSV "
 * son UNO para el conteo y DOS filas para la dinámica. Esa fila de más se come el aire que separa
 * este cuadro del subtítulo de abajo, el subtítulo cae adentro del cuadro, y adiós sección. Contar
 * como cuenta el que escribe es la única forma de que la reserva no mienta.
 *
 * El `+1` es deliberado: una fila vacía de más entre dos cuadros no se ve; una de menos deja la
 * sección en #REF!. El error tiene un lado seguro y hay que elegirlo.
 *
 * @param {any[][]} filas  las filas de Compras que entran a la dinámica
 * @returns {number}
 */
export function reservaDelCuadroA(filas = []) {
  return new Set((filas ?? []).map((f) => String(f?.[COL.proveedor] ?? ''))).size + 1
}

/**
 * ¿HASTA DÓNDE LLEGAN LAS DOS COLUMNAS DE FÓRMULA?
 *
 * ═══ NO SE ESCRIBEN HASTA EL FINAL DEL BLOQUE, Y HAY DOS RAZONES ═══
 *
 * 1. Una fórmula que devuelve "" NO es una celda vacía: `leerParaDecidirBorrado` pide `FORMULA` a
 *    propósito, así que ve la fórmula. Llenar hasta el subtítulo de abajo congelaría el aire que el
 *    generador necesita medir.
 * 2. El colchón sí tiene que existir: el proveedor que aparezca mañana entra en una fila que el
 *    pivot ya sabe emitir, y si su fórmula no está esperándolo su vencimiento y su nota salen en
 *    blanco hasta la corrida siguiente. Tres filas alcanzan y no tapan el aire.
 *
 * El alto se cuenta sobre las columnas DEL PIVOT (A y B), no sobre la fila entera: una fila con un
 * resto en cualquier otra columna dejaría de estar en blanco y el conteo seguiría de largo.
 *
 * `hasta` es EXCLUSIVO. Las filas, base 1.
 *
 * @param {{visible:any[][], filaRotulos:number, filaTope:number, anchoPivot?:number, colchon?:number}} o
 *        `filaTope` la primera fila que NO se puede tocar (el subtítulo del cuadro de detalle).
 * @returns {{desde:number, hasta:number, emitidas:number}}
 */
export function rangoDelCuadroA({ visible = [], filaRotulos, filaTope, anchoPivot = 2, colchon = 3 }) {
  if (!(filaRotulos > 0)) throw new Error('rangoDelCuadroA: la fila de rótulos va en base 1')
  if (!(filaTope > filaRotulos)) throw new Error('rangoDelCuadroA: el tope tiene que estar debajo de los rótulos')
  const desde = filaRotulos + 1
  let emitidas = 0
  for (let f = desde; f <= visible.length && f < filaTope; f++) {
    const fila = visible[f - 1] ?? []
    if (!fila.slice(0, anchoPivot).some((c) => String(c ?? '').trim() !== '')) break
    emitidas++
  }
  return { desde, hasta: Math.min(desde + emitidas + colchon, filaTope), emitidas }
}

/**
 * LOS REQUESTS DE LAS DOS COLUMNAS: rótulo, fórmula y formato.
 *
 * La nota sale de `requestsDeNotas` —los MISMOS requests que usa el otro escritor de esa columna—
 * para que no puedan separarse: si mañana cambia la fórmula de la nota, cambia para los dos.
 *
 * Devuelve `[]` si el rango no tiene ni una fila: un rótulo colgado sobre un cuadro que no existe es
 * peor que no escribir nada.
 *
 * @param {{sheetId:number, filaRotulos:number, desde:number, hasta:number}} o
 * @returns {object[]}
 */
export function requestsDelCuadroA({ sheetId, filaRotulos, desde, hasta }) {
  if (!Number.isInteger(sheetId)) throw new Error('requestsDelCuadroA: falta sheetId')
  if (!(hasta > desde)) return []
  const cVence = colVence()
  const L = letra(COL_PROVEEDOR)
  const FMT = 'userEnteredFormat'
  return [
    {
      updateCells: {
        range: {
          sheetId,
          startRowIndex: filaRotulos - 1,
          endRowIndex: filaRotulos,
          startColumnIndex: cVence,
          endColumnIndex: cVence + 1,
        },
        rows: [{ values: [{ userEnteredValue: { stringValue: ROTULO_VENCE } }] }],
        fields: 'userEnteredValue',
      },
    },
    {
      updateCells: {
        range: {
          sheetId,
          startRowIndex: desde - 1,
          endRowIndex: hasta - 1,
          startColumnIndex: cVence,
          endColumnIndex: cVence + 1,
        },
        rows: Array.from({ length: hasta - desde }, (_, i) => ({
          values: [{ userEnteredValue: { formulaValue: formulaVence(desde + i, L) } }],
        })),
        fields: 'userEnteredValue',
      },
    },
    // EL FORMATO ES DEL ARCHIVO, NO DEL DATO. Sin declararlo, la columna se queda con el que tenía de
    // la corrida anterior —cuando ahí vivía el número de comprobante, en TEXTO— y la fecha sale como
    // el número de serie crudo (`46238`). Se declara en cada corrida, sobre el rótulo también: si no,
    // el rótulo "Vence" queda en una celda declarada FECHA y el auditor lo marca `texto_en_numero`.
    {
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: desde - 1,
          endRowIndex: hasta - 1,
          startColumnIndex: cVence,
          endColumnIndex: cVence + 1,
        },
        cell: { userEnteredFormat: { numberFormat: { type: 'DATE', pattern: 'dd/mm/yyyy' }, horizontalAlignment: 'RIGHT' } },
        fields: `${FMT}.numberFormat,${FMT}.horizontalAlignment`,
      },
    },
    ...requestsDeNotas({
      sheetId, filaRotulos, desde, hasta, columna: colNota(), letraProveedor: L,
    }),
  ]
}

/**
 * LOS CUATRO RÓTULOS DEL CUADRO, en el orden en que salen a la pestaña.
 *
 * Los dos primeros los escribe el pivot (el de la A lo hereda de Compras y no se puede renombrar);
 * los dos últimos, este módulo. Se necesitan JUNTOS para calcular el alto de la fila de rótulos: si
 * se le pasan sólo los del pivot, "Qué hacer" puede quedar cortado y nadie se entera.
 *
 * @param {string[]} cabecera  la fila 3 de Compras
 * @param {string[]} nombresDeValores  los `name` de los valores del pivot
 * @returns {string[]}
 */
export function rotulosDelCuadroA(cabecera = [], nombresDeValores = ['Se le debe']) {
  return [
    String(cabecera[COL.proveedor] ?? '').trim() || 'Proveedor',
    String(nombresDeValores[0] ?? '').trim() || 'Se le debe',
    ROTULO_VENCE,
    ROTULO_NOTA,
  ]
}

/** Las columnas que se alinean a la derecha en la fila de rótulos: la plata y la fecha. */
export const ROTULOS_A_LA_DERECHA = Object.freeze([1, 2])
