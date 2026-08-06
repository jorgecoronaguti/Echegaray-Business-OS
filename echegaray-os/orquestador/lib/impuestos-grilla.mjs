// LA ESPINA DE LA PESTAÑA — una sola grilla, dos formas de fila, y nada más.
//
// POR QUÉ (23/07, y sigue vigente). El dueño: "el diseño está totalmente descuadrado, no se entiende
// la información". Era literal: la pestaña apilaba CINCO formas de tabla distintas, así que cada
// cuadro empezaba y terminaba en una columna distinta del de arriba y el ojo recalibraba en cada
// bloque. La grilla pasó a ser una sola: A el concepto, B..M los doce meses, N el total, O de dónde
// sale. Las FILAS son las medidas y las COLUMNAS el tiempo, como cualquier cuadro fiscal.
//
// LA RECONSTRUCCIÓN DEL 06/08 AGREGA UNA SEGUNDA FORMA, Y SÓLO UNA. La posición, el calendario de
// vencimientos, el riesgo y el financiamiento no son series de doce meses: son listas. Usan A para el
// rótulo, B (y a lo sumo C y D) para los importes, y el resto de la fila queda libre. Dos formas —la
// serie y la lista— es lo mínimo que permite mostrar una posición arriba de un cuadro mensual.
// La tercera sería volver al descuadre.

import { VACIO } from './preservar-anotaciones.mjs'

/** A..O. La columna O es la de procedencia: se vacía y se rinde como nota. */
export const ANCHO = 15
export const M12 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
export const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
/** La columna del mes N. Enero es SIEMPRE la B, igual que en Cargas Sociales y en los dos cash flow. */
export const cmes = (m) => String.fromCharCode(65 + m)

// "ESTA CELDA NO ES MÍA: NO LA TOQUES."
//
// POR QUÉ HACE FALTA (04/08). `fusionar()` distingue tres cosas: contenido (gana el generador), VACIO
// (es mía y va vacía → se limpia) y cadena vacía (no es mía → se preserva). Pero `push()` convierte la
// cadena vacía en VACIO, así que desde `mensual()` era IMPOSIBLE decir "preservá".
//
// Y esta pestaña lo necesita: la columna de julio del bloque de IVA la escribió una persona a mano
// —débito, crédito, libre disponibilidad y la leyenda de la DDJJ— y en Drive no hay F.2051 de julio.
// Para el generador julio "no existe", así que le escribía VACIO y se la borraba. `respetar-ediciones`
// no la salva: por diseño respeta rótulos de texto, nunca importes. Y julio es justo el mes que ancla
// toda la proyección, así que borrarlo además la falsea.
export const AJENO = ' ::AJENO:: '

/**
 * El constructor de la grilla. Devuelve las cuatro operaciones que arman la pestaña entera.
 *
 * `reservar` existe porque la posición va ARRIBA y sus celdas REFERENCIAN el detalle que está abajo:
 * hasta no escribir el detalle no se sabe en qué fila quedó cada total. Se reserva el espacio, se
 * escribe el detalle, y recién ahí se llena — con referencias, ni un número pegado.
 */
export function crearGrilla(anio) {
  const filas = []

  const push = (c = []) => {
    const r = [...c].map((x) => (x === AJENO ? '' : (x === '' || x === undefined || x === null ? VACIO : x)))
    while (r.length < ANCHO) r.push(VACIO)
    filas.push(r)
    return filas.length
  }

  /** Una fila de la serie mensual: rótulo, doce meses, total y origen. Devuelve su número de fila. */
  const mensual = (rotulo, celda, origen, { meses = M12, totaliza = true } = {}) => {
    const f = filas.length + 1
    return push([rotulo, ...M12.map((m) => (meses.includes(m) ? celda(m) : VACIO)),
      totaliza ? `=SUM($B${f}:$M${f})` : VACIO, origen])
  }

  /** Una fila de la LISTA: rótulo, uno a tres importes, y la procedencia. */
  const lista = (rotulo, importes = [], origen = '') => {
    const c = [rotulo, ...importes]
    while (c.length < ANCHO - 1) c.push(VACIO)
    c[ANCHO - 1] = origen
    return push(c)
  }

  const cabecera = () => push(['Concepto', ...MES.map((m) => `'${m}-${String(anio).slice(2)}`), 'Total', 'De dónde sale'])
  const blanco = () => push()

  /** Reserva n filas en blanco y devuelve el índice 0-based de la primera. */
  const reservar = (n) => {
    const base = filas.length
    for (let k = 0; k < n; k++) push()
    return base
  }

  /**
   * Escribe filas ya armadas sobre el espacio reservado. ROMPE si no entran: una escritura que se
   * pasa de largo pisa el bloque de abajo y el resultado sigue pareciendo una pestaña.
   */
  const fijar = (base, reservadas, nuevas) => {
    if (nuevas.length > reservadas) {
      throw new Error(`impuestos-grilla: reservé ${reservadas} filas y quiero escribir ${nuevas.length}. `
        + 'Escribirlas pisaría el bloque de abajo sin dar un solo error.')
    }
    nuevas.forEach((c, k) => {
      const row = [...c].map((x) => (x === AJENO ? '' : (x === '' || x === undefined || x === null ? VACIO : x)))
      while (row.length < ANCHO) row.push(VACIO)
      filas[base + k] = row
    })
  }

  return { filas, push, mensual, lista, cabecera, blanco, reservar, fijar, n: () => filas.length }
}
