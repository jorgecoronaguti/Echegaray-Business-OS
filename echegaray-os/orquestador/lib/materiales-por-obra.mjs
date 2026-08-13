// LA SECCIÓN "POR OBRA" DE LA PESTAÑA MATERIALES — FAMILIA × OBRA, EN NETO.
//
// ═══ POR QUÉ SALIÓ DEL GENERADOR (13/08/2026) ═══
//
// Estas filas son las que publican la fila "TOTAL POR OBRA", el número que la pestaña OBRAS cita por
// rótulo y que el dueño compara con la venta de esa obra. Vivían adentro de `grilla()` —una función
// de 600 líneas que lee Google, la base y ARCA—, así que no había forma de probarlas sin correr el
// generador contra el archivo real, que es justamente lo que este repo tiene prohibido.
//
// Acá son núcleo puro: entran nombres y rangos, salen filas. Eso permite el único test que cierra
// esta clase de defecto — evaluar la fórmula de ESTA pestaña y la de OBRAS contra los MISMOS datos y
// exigir que den el mismo número (ver costo-materiales.test.mjs). Sin él, la divergencia que el dueño
// encontró a ojo vuelve en cuanto alguien toque una de las dos.
//
// EL CRITERIO NO ESTÁ ACÁ: está en `costo-materiales.mjs`, que también lo emite para OBRAS.

import { letra } from './compras-columnas.mjs'
import { sumaNetaSheet } from './costo-materiales.mjs'

/** El rótulo de la fila que OBRAS cita por texto. Cambiarlo deja seis celdas de OBRAS en "—". */
export const FILA_TOTAL = 'TOTAL POR OBRA'

/**
 * El rótulo largo de la familia sin clasificar. La celda A dice más que el nombre —para que el que la
 * mira sepa qué hacer— y por eso el criterio de los SUMIFS se recorta con LEFT: si se comparara la
 * celda entera, ninguna fila de Compras matchearía y la fila entera saldría en cero.
 */
export const rotuloFamilia = (nombre, sinFamilia) => (nombre === sinFamilia ? `${nombre} — falta describir qué se compró` : nombre)

/**
 * NÚCLEO PURO: las filas de la sección familia × obra.
 *
 * @param {object} a
 * @param {string[]} a.obras nombres EXACTOS como están en Compras, en el orden de las columnas
 * @param {string[]} a.familias nombres de familia, incluida la de "sin clasificar", en orden
 * @param {string} a.sinFamilia el nombre de la familia sin clasificar (para el rótulo largo)
 * @param {{neto:string, iva:string, total:string, familia:string, obra:string}} a.rangos rangos
 *        abiertos de Compras YA resueltos por rótulo
 * @param {number} a.filaCabecera número de fila REAL de la planilla donde va la cabecera; las de
 *        detalle arrancan en la siguiente. Una fila corrida deja cada SUMIFS mirando otra familia.
 * @returns {{cabecera:(string)[], detalle:(string)[][], total:(string)[]}}
 */
export function bloqueMaterialesPorObra({ obras, familias, sinFamilia, rangos, filaCabecera }) {
  if (!Number.isInteger(filaCabecera) || filaCabecera < 1) {
    throw new Error(`materiales-por-obra: filaCabecera tiene que ser la fila real de la planilla, y vino ${JSON.stringify(filaCabecera)}`)
  }
  const { neto, iva, total, familia, obra } = rangos
  const cabecera = ['Familia', ...obras, 'Total', 'Sin obra']
  const colTotal = letra(obras.length + 1)
  const fila0 = filaCabecera + 1
  const detalle = familias.map((n, k) => {
    const f = fila0 + k
    // El criterio de familia se recorta a la longitud del NOMBRE, no del rótulo (ver `rotuloFamilia`).
    const deLaFamilia = `${familia};LEFT($A${f};${n.length})`
    const celda = (criterios) => `=${sumaNetaSheet({ neto, iva, total, criterios })}`
    return [
      rotuloFamilia(n, sinFamilia),
      ...obras.map((_, i) => celda(`${deLaFamilia};${obra};${letra(i + 1)}$${filaCabecera}`)),
      `=SUM(${letra(1)}${f}:${letra(obras.length)}${f})`,
      // ROUND A PESO. Sin él la misma columna mostraba "$0", "-$0" y "—" para tres ceros idénticos —y
      // uno de los tres en rojo—, porque la suma por familia y la suma por obra difieren en fracciones
      // de centavo. Que tenga que dar cero lo dice el formato, que la pinta en rojo apenas deja de darlo.
      `=ROUND(${sumaNetaSheet({ neto, iva, total, criterios: deLaFamilia })}-${colTotal}${f};0)`,
    ]
  })
  const ultima = fila0 + familias.length - 1
  const total_ = [FILA_TOTAL,
    ...obras.map((_, i) => `=SUM(${letra(i + 1)}${fila0}:${letra(i + 1)}${ultima})`),
    `=SUM(${colTotal}${fila0}:${colTotal}${ultima})`,
    `=SUM(${letra(obras.length + 2)}${fila0}:${letra(obras.length + 2)}${ultima})`,
  ]
  return { cabecera, detalle, total: total_ }
}
