// CÓMO SE LEE UNA PESTAÑA QUE TIENE TABLAS DINÁMICAS NATIVAS.
//
// POR QUÉ EXISTE (05/08). La sección 2 de Proveedores se escribió BIEN —47 proveedores, el corte al
// 95%, el filtro por `visibleValues` enganchando— y el generador se frenó igual con "la dinámica no
// emitió una sola fila: el filtro la dejó vacía". El filtro estaba perfecto. Lo que estaba mal era
// la LECTURA con la que se lo verificaba.
//
// LAS CELDAS QUE EMITE UNA DINÁMICA NO TIENEN `userEnteredValue`: existen sólo como valor efectivo.
// `render: 'FORMULA'` devuelve lo que se escribió en la celda, así que sobre el cuerpo de un pivot
// devuelve la cadena vacía SIEMPRE. Medido en el archivo real el 05/08 sobre `Proveedores!A16:D26`
// (la sección 1, que también es dinámica y sí estaba emitiendo):
//
//   FORMULA          → ["","","","=IF($A18=\"\";…)"]      ← A, B y C son del pivot: vacías
//   FORMATTED_VALUE  → ["Hormiserv","5.995.792","2","…"]  ← lo que se ve en la pantalla
//
// De ahí salen dos defectos de la misma familia, de tamaño muy distinto:
//
//   1. UN FALSO NEGATIVO. La guarda del generador da por vacía una dinámica llena y aborta. Cuesta el
//      pie del cuadro (queda sin "resto" ni "total"), el recorte del aire, y deja la pestaña a medio
//      escribir: exactamente el estado en que quedó Proveedores el 05/08.
//   2. UN BORRADO, Y NO ES HIPOTÉTICO. La lógica del colchón cuenta filas en blanco para devolverlas
//      con `deleteDimension`. Con la lectura en FORMULA, el cuerpo entero de una dinámica ES una fila
//      en blanco — y el "cinturón" `filasNoVacias`, que comprueba que no se borre nada con datos, usa
//      LA MISMA lectura ciega, así que da el visto bueno.
//
//      Medido en el archivo el 05/08: la tabla "Cada operación" de la sección 1 está en **#REF!**.
//      El generador la escribe (19 filas), y al terminar `recortarElAire` mide el bloque con la
//      lectura FORMULA, ve que lo último con algo es el SUBTÍTULO —el cuerpo de la dinámica no
//      existe para esa lectura—, y le devuelve al colchón las filas que la dinámica acababa de
//      ocupar. Una dinámica sin lugar no se renderiza: Google la deja en #REF!. El generador
//      destruía su propio cuadro al final de cada corrida, y el dry-run lo confirma pidiendo insertar
//      28 filas otra vez.
//
// LA REGLA, ENTONCES:
//
//   · para MEDIR lo que emitió una dinámica se lee FORMATTED_VALUE, que es lo único que la ve;
//   · para decidir un BORRADO se leen las DOS y se fusionan, porque ahí "no hay nada" tiene que
//     significar que no hay nada DE NADIE: ni una fórmula que devuelve "" (sólo la ve FORMULA) ni la
//     salida de un pivot (sólo la ve FORMATTED_VALUE).
//
// El costo es una llamada más por recorte. Contra un borrado sin vuelta, no se discute.

/** El único render que ve la salida de una dinámica. No es una preferencia: es el que la devuelve. */
export const RENDER_EMITIDO = 'FORMATTED_VALUE'

/** El render que ve una fórmula aunque devuelva "": lo que escribió alguien, no lo que se calculó. */
export const RENDER_ESCRITO = 'FORMULA'

/**
 * DOS LECTURAS DEL MISMO RANGO, FUSIONADAS CELDA A CELDA: gana la que tiene algo.
 *
 * Puro a propósito, para que el criterio de "esta celda está vacía" se pueda probar sin red.
 *
 * @param {Array<Array<any>>} escrito   la lectura en FORMULA
 * @param {Array<Array<any>>} emitido   la lectura en FORMATTED_VALUE
 * @returns {Array<Array<any>>}
 */
export function fusionarLecturas(escrito = [], emitido = []) {
  const alto = Math.max(escrito.length, emitido.length)
  const salida = []
  for (let i = 0; i < alto; i++) {
    const a = escrito[i] ?? []
    const b = emitido[i] ?? []
    const ancho = Math.max(a.length, b.length)
    const fila = []
    for (let j = 0; j < ancho; j++) fila.push(String(a[j] ?? '').trim() === '' ? (b[j] ?? '') : a[j])
    salida.push(fila)
  }
  return salida
}

/**
 * LO QUE UNA DINÁMICA EMITIÓ DE VERDAD, releído del archivo.
 *
 * @param {{google:object, id:string, rango:string}} o
 * @returns {Promise<Array<Array<any>>>}
 */
export async function leerCuerpoDeDinamica({ google, id, rango }) {
  return (await google.readSheetValues(id, rango, { render: RENDER_EMITIDO })) ?? []
}

/**
 * LA LECTURA CON LA QUE SE DECIDE BORRAR FILAS. Nunca una sola: ver la cabecera.
 *
 * @param {{google:object, id:string, rango:string}} o
 * @returns {Promise<Array<Array<any>>>}
 */
export async function leerParaDecidirBorrado({ google, id, rango }) {
  const escrito = await google.readSheetValues(id, rango, { render: RENDER_ESCRITO })
  const emitido = await google.readSheetValues(id, rango, { render: RENDER_EMITIDO })
  return fusionarLecturas(escrito ?? [], emitido ?? [])
}
