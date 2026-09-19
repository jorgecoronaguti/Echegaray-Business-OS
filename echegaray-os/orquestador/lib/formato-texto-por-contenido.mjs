// UN TEXTO NUNCA LLEVA FORMATO DE PLATA — Y SE DECIDE POR CONTENIDO, NO POR BLOQUE.
//
// POR QUÉ EXISTE (31/07). El dueño rechazó la misma pestaña cuatro veces por cómo se veía. El patrón
// del archivo es: aplicar moneda a la columna entera (correcto: estas pestañas son tablas de importes)
// y después, bloque por bloque, devolverle su formato a las columnas que no son plata. Ese camino se
// queda corto SIEMPRE. Cada tabla nueva, cada columna que el dueño agrega, cada fila de "resto" que cae
// fuera del rango declarado y cada encabezado que nadie listó vuelve a aparecer como texto dibujado con
// formato de moneda. En Proveedores se arreglaron 45 y volvieron 52 en otras celdas: la lista cambia, la
// clase de defecto no.
//
// La cura es no mantener rangos: si la celda que el generador escribe es TEXTO —ni fórmula, ni número,
// ni importe, ni fecha; la misma definición que usa la Regla 0 para decidir qué es un rótulo— entonces
// su formato es TEXTO. Vale para lo que ya está y para lo que se agregue mañana.
//
// LO QUE ESTO NO PUEDE HACER: una celda cuyo valor lo produce una FÓRMULA no se puede clasificar sin
// evaluarla. Esas siguen dependiendo de la declaración de su bloque, y así queda dicho.

import { esRotulo } from './respetar-ediciones.mjs'

/**
 * NÚCLEO PURO: los tramos contiguos de celdas de TEXTO por columna, para formatear en pocos pedidos.
 *
 * Se agrupan en tramos porque una pestaña tiene cientos de estas celdas y un pedido por celda haría
 * que el batch de formato pese más que todo el resto de la corrida.
 *
 * @param {any[][]} filas la grilla que el generador va a escribir (índice 0 → fila 1)
 * @param {{desdeCol?: number}} opts desdeCol: la primera columna a mirar (la A suele ser texto por diseño)
 * @returns {Array<{col: number, desde: number, hasta: number}>} filas 1-based, `hasta` inclusive
 */
export function tramosDeTexto(filas = [], { desdeCol = 1 } = {}) {
  const porColumna = new Map()
  filas.forEach((fila, i) => (fila || []).forEach((c, j) => {
    if (j < desdeCol || !esRotulo(c)) return
    if (!porColumna.has(j)) porColumna.set(j, [])
    porColumna.get(j).push(i + 1)
  }))
  const tramos = []
  for (const [col, filasCol] of porColumna) {
    let desde = null; let prev = null
    const cerrar = () => { if (desde !== null) tramos.push({ col, desde, hasta: prev }) }
    for (const f of filasCol) {
      if (prev !== null && f === prev + 1) { prev = f; continue }
      cerrar(); desde = f; prev = f
    }
    cerrar()
  }
  return tramos
}

/**
 * Los requests de formato para que cada celda de texto se dibuje como texto.
 *
 * @param {number} sheetId
 * @param {any[][]} filas la grilla del generador
 * @param {{desdeCol?: number, alinear?: string}} opts
 * @returns {{requests: object[], celdas: number}}
 */
export function requestsTextoPorContenido(sheetId, filas = [], { desdeCol = 1, alinear = 'LEFT' } = {}) {
  const tramos = tramosDeTexto(filas, { desdeCol })
  const requests = tramos.map((t) => ({
    repeatCell: {
      range: { sheetId, startRowIndex: t.desde - 1, endRowIndex: t.hasta, startColumnIndex: t.col, endColumnIndex: t.col + 1 },
      cell: { userEnteredFormat: { numberFormat: { type: 'TEXT' }, horizontalAlignment: alinear } },
      fields: 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment',
    },
  }))
  return { requests, celdas: tramos.reduce((a, t) => a + (t.hasta - t.desde + 1), 0) }
}
