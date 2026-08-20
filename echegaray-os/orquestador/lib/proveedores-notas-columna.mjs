// LA COLUMNA "QUÉ HACER" — LOS REQUESTS, EN UN SOLO LUGAR, PORQUE HAY DOS ESCRITORES.
//
// ═══ EL DEFECTO QUE ESTO CIERRA (14/08) ═══
//
// `proveedores-dos-cuadros.mjs` limpia el rectángulo A:G de su sección antes de anclar las
// dinámicas. La columna "Qué hacer" vive DENTRO de ese rectángulo, y quien la repone es otro script
// —`proveedores-notas-visibles.mjs`— que sólo corre después dentro del pipeline. Correr el
// generador solo, que es lo que su propia cabecera documenta, borra las catorce notas del dueño y
// no avisa: la sección queda completa a la vista, sin una sola celda en rojo.
//
// El dueño, ese mismo día: *"rompiste todo proveedores y lo q yo te pedia era arreglar y mejorar
// todo lo q habia, no romperlo y hacerlo desaparecer"*. Perder lo que él escribió a mano por una
// dependencia de ORDEN entre dos scripts es exactamente lo que no puede volver a pasar.
//
// ═══ LA REGLA: EL QUE BORRA LA COLUMNA ES EL QUE LA REPONE, EN LA MISMA CORRIDA ═══
//
// No se resuelve documentando el orden. Se resuelve haciendo que el generador que limpia el
// rectángulo emita la columna de notas al final del MISMO batch. Los dos escritores comparten estos
// requests, así que no pueden separarse: si mañana cambia la fórmula, cambia para los dos.
//
// ═══ Y LA NOTA SE RESUELVE POR BÚSQUEDA, NUNCA POR FILA ═══
//
// La fórmula pregunta por el nombre que la propia dinámica escribió en su columna de proveedor. Si
// mañana la dinámica reordena, la nota se mueve con su proveedor. Escribir el texto en la fila 22
// porque hoy ahí está Mariana SA es el defecto que este archivo existe para no cometer.

import { COL_NOTA_AUX } from './proveedores-auxiliar.mjs'

/** El rótulo de la columna. Es texto del dueño: se escribe igual en los dos escritores. */
export const ROTULO_NOTA = 'Qué hacer'

/** La pestaña auxiliar de donde sale la nota. La escribe `proveedores-cuenta-corriente.mjs`. */
export const AUX = '_PROVEEDORES_OS'

/**
 * LA FÓRMULA DE UNA FILA.
 *
 * `letraProveedor` es la columna donde la dinámica escribe el nombre — CALCULADA por quien llama,
 * nunca tipeada: el día que el cuadro gane un campo, la búsqueda tiene que seguir al nombre.
 *
 * El separador de argumentos es `;` porque el archivo es es_AR. Con `,` Google devuelve un error de
 * fórmula que se ve recién en la celda. Ver memoria "Fórmula por API va en locale".
 */
export function formulaNota(fila, letraProveedor) {
  return `=IF($${letraProveedor}${fila}="";"";IFERROR(VLOOKUP($${letraProveedor}${fila};`
    + `${AUX}!$A:$C;${COL_NOTA_AUX};FALSE);""))`
}

/**
 * ¿QUÉ NOTAS NO VAN A ENTRAR EN EL ANCHO DE SU COLUMNA?
 *
 * A fontSize 9 en itálica entran unos 7px por carácter. El dueño escribe estas notas para leerlas;
 * que una salga cortada es el mismo defecto de pantalla que persigue el resto de la pestaña, sólo
 * que sobre un texto suyo. No se trunca —es su texto— pero se avisa.
 *
 * @param {Map<string,string>|Array<[string,string]>} notas
 * @param {number} anchoPx el ancho de la columna donde va la nota
 * @returns {Array<{proveedor:string, nota:string, caracteres:number, entran:number}>}
 */
export function notasQueNoEntran(notas, anchoPx) {
  const entran = Math.floor(Number(anchoPx || 0) / 7)
  const pares = notas instanceof Map ? [...notas.entries()] : (notas ?? [])
  return pares
    .filter(([, t]) => String(t ?? '').length > entran)
    .map(([proveedor, nota]) => ({ proveedor, nota: String(nota), caracteres: String(nota).length, entran }))
}

/**
 * LOS REQUESTS QUE DEJAN LA COLUMNA PUESTA: rótulo, fórmulas y formato.
 *
 * `desde`/`hasta` en base 1, `hasta` EXCLUSIVO — el mismo contrato que el resto de la pestaña.
 * Devuelve `[]` si el rango no tiene ni una fila: escribir un rótulo sobre un cuadro que no existe
 * deja un encabezado colgado y ninguna nota, que es peor que no escribir nada.
 *
 * @param {{sheetId:number, filaRotulos:number, desde:number, hasta:number,
 *          columna:number, letraProveedor:string}} o
 * @returns {object[]}
 */
export function requestsDeNotas({ sheetId, filaRotulos, desde, hasta, columna, letraProveedor }) {
  if (!Number.isInteger(sheetId)) throw new Error('requestsDeNotas: falta sheetId')
  if (!(columna >= 0)) throw new Error('requestsDeNotas: la columna de la nota se calcula, no se adivina')
  if (!letraProveedor) throw new Error('requestsDeNotas: falta la columna del proveedor: la nota se ancla a el')
  if (!(hasta > desde)) return []

  const FMT = 'userEnteredFormat'
  return [
    {
      updateCells: {
        range: {
          sheetId,
          startRowIndex: filaRotulos - 1,
          endRowIndex: filaRotulos,
          startColumnIndex: columna,
          endColumnIndex: columna + 1,
        },
        rows: [{ values: [{ userEnteredValue: { stringValue: ROTULO_NOTA } }] }],
        fields: 'userEnteredValue',
      },
    },
    {
      updateCells: {
        range: {
          sheetId,
          startRowIndex: desde - 1,
          endRowIndex: hasta - 1,
          startColumnIndex: columna,
          endColumnIndex: columna + 1,
        },
        rows: Array.from({ length: hasta - desde }, (_, i) => ({
          values: [{ userEnteredValue: { formulaValue: formulaNota(desde + i, letraProveedor) } }],
        })),
        fields: 'userEnteredValue',
      },
    },
    {
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: filaRotulos - 1,
          endRowIndex: hasta - 1,
          startColumnIndex: columna,
          endColumnIndex: columna + 1,
        },
        cell: {
          userEnteredFormat: {
            numberFormat: { type: 'TEXT', pattern: '@' },
            horizontalAlignment: 'LEFT',
            // ═══ UNA NOTA LARGA NO PUEDE DESARMAR LA GRILLA (14/08/2026) ═══
            //
            // EL DEFECTO, en la captura que mandó el dueño: `D20` (Hormiserv) tiene ~200 caracteres
            // —"Esperar a q escriba el cobrador… pedir bonificacion de 5m3, cerrar para pagar"— en una
            // columna de 300px, y se derramaba sobre E, F y G tapando el cuadro de al lado. Es una de
            // las cosas que él ve como "el diseño está roto".
            //
            // EL TEXTO ES SUYO Y NO SE TOCA: ni se recorta, ni se resume, ni se reescribe. Lo que se
            // decide acá es cómo se MUESTRA, que es responsabilidad del formato. Sin `wrapStrategy`
            // declarada la celda hereda lo que haya, y el default para texto es derramar.
            //
            // CLIP y no WRAP: envolver 200 caracteres en 300px hace una fila de seis renglones, y una
            // fila alta en el medio de una tabla rompe la lectura tanto como el derrame. Con CLIP la
            // nota queda acotada a su celda y el texto entero se lee al pararse encima (la barra de
            // fórmulas lo muestra completo).
            //
            // LO QUE SE DESCARTÓ, Y POR QUÉ: poner el texto completo en la NOTA de la celda. Es lo que
            // haría cualquier planilla, y en este archivo está prohibido — el dueño borraba las notas y
            // volvían en la corrida siguiente, y la regla que salió de ahí es que ningún generador
            // escribe notas nunca más. Ver la memoria "Notas que resucitan".
            wrapStrategy: 'CLIP',
            textFormat: { fontSize: 9, italic: true, foregroundColor: { red: 0.45, green: 0.45, blue: 0.45 } },
          },
        },
        fields: `${FMT}.numberFormat,${FMT}.horizontalAlignment,${FMT}.wrapStrategy,${FMT}.textFormat`,
      },
    },
  ]
}
