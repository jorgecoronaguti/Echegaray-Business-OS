// EMPAREJAR DOS VERSIONES DE UNA MISMA PESTAÑA POR EL RÓTULO DE SUS FILAS, NO POR SU POSICIÓN.
//
// POR QUÉ (01/08). Para devolverle a CAJA el formato que había establecido el dueño hay que saber
// qué fila de SU versión corresponde a qué fila de HOY. Entre las dos, la pestaña se movió: "Caja en
// pesos" pasó de la fila 6 a la 10 y el bloque del arqueo de la 141 a la 151. Aplicar el formato por
// número de fila le pondría a cada una el formato de otra.
//
// Es la misma regla que este archivo ya aprendió a los golpes en cuatro lugares distintos —anclar en
// la posición— y acá se cumple de la única forma que sirve: el ancla es el TEXTO de la columna A.
//
// LAS REPETICIONES SE CONSUMEN EN ORDEN. Una pestaña tiene rótulos que aparecen varias veces (filas
// en blanco, sub-ítems con el mismo texto). Cada fila de origen toma el SIGUIENTE destino libre con
// ese mismo rótulo, avanzando siempre hacia abajo: así dos filas iguales no se pisan entre sí ni se
// cruzan de bloque.

/** NÚCLEO PURO: normaliza un rótulo para comparar. Los espacios de más y las mayúsculas no cuentan. */
export const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim().toLowerCase()

/**
 * NÚCLEO PURO: empareja las filas del origen con las de destino por el rótulo de la columna A.
 *
 * @param {{fila:number, rotulo:string, celdas:Array}[]} filasOrigen las de la versión del dueño
 * @param {string[]} rotulosDestino la columna A de la pestaña viva, 0-based
 * @returns {{pares:Array, sinDestino:Array, sinOrigen:number[]}}
 */
export function emparejarPorRotulo(filasOrigen = [], rotulosDestino = []) {
  // Índice de destinos por rótulo, en orden. Se consumen de a uno.
  const porRotulo = new Map()
  rotulosDestino.forEach((r, i) => {
    const k = norm(r)
    if (!k) return
    if (!porRotulo.has(k)) porRotulo.set(k, [])
    porRotulo.get(k).push(i + 1)
  })

  const pares = []
  const sinDestino = []
  const usados = new Set()
  // El cursor impide que una fila de arriba se lleve un destino que está más abajo que uno ya usado:
  // sin esto, dos bloques con los mismos sub-rótulos se cruzan y el formato viaja al bloque de al lado.
  let cursor = 0
  for (const f of filasOrigen) {
    const k = norm(f.rotulo)
    const candidatos = k ? (porRotulo.get(k) ?? []) : []
    const destino = candidatos.find((d) => d > cursor && !usados.has(d))
    if (!destino) { sinDestino.push(f); continue }
    usados.add(destino)
    cursor = destino
    pares.push({ filaOrigen: f.fila, filaDestino: destino, rotulo: f.rotulo, celdas: f.celdas })
  }

  const sinOrigen = []
  rotulosDestino.forEach((r, i) => { if (norm(r) && !usados.has(i + 1)) sinOrigen.push(i + 1) })
  return { pares, sinDestino, sinOrigen }
}
