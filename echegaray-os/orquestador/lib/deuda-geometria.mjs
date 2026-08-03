// LA GEOMETRÍA DEL CUADRO DE DEUDA SALE DE LO ESCRITO, NO DE ÍNDICES GUARDADOS ANTES.
//
// POR QUÉ EXISTE (31/07). El dueño, cuarta vez sobre la misma pestaña: "proveedores es una vergüenza
// es todo lo contrario a lo q necesito". Medido en el archivo vivo, con el formato leído celda por
// celda: los VALORES del cuadro 1 tenían una geometría (12 proveedores, el último con dos facturas,
// filas 19–43) y el FORMATO, la NEGRITA y los grupos +/- tenían otra (11 proveedores, filas 19–41).
// Resultado a la vista: la fila-cabecera de "Corralon Progreso" sin negrita, sus dos facturas
// dibujadas como plata —la fecha de pago mostrando "$46.259" en vez de 25/08/2026— y once grupos +/-
// corridos dos filas, uno de ellos sobre dos filas vacías.
//
// La causa no fue un cálculo mal hecho: fue el MÉTODO. El formateador recibía números de fila
// calculados mientras se armaba la grilla, y entre ese momento y el dibujo hay una escritura que
// puede fusionar, respetar ediciones, saltear la pestaña por candado o quedar a mitad de camino. Un
// índice guardado antes de escribir es una foto de una geometría que puede no ser la que quedó.
//
// Es la misma raíz que ya rompió tres enlaces en este archivo (ver memoria "anclar en el último es
// anclar en la posición"): anclar en la posición. Acá la cura es la misma: LEER LA FORMA DE LA GRILLA
// QUE SE VA A ESCRIBIR. Una fila con nombre de proveedor en su primera columna es una cabecera; una
// sin nombre pero con comprobante o importe es una de sus facturas; el resto está vacía. Eso es
// verdad para cualquier corrida, cualquier cantidad de proveedores y cualquier reordenamiento.

import { VACIO } from './preservar-anotaciones.mjs'

/** Una celda está vacía si no tiene nada o si lleva el centinela del generador ("es mía y va vacía"). */
export const celdaVacia = (v) => v === undefined || v === null || v === VACIO
  || (typeof v === 'string' && v.trim() === '')

/**
 * Dónde empieza y termina el cuerpo del cuadro de deuda, ANCLADO AL TEXTO de su encabezado.
 *
 * No se busca "la fila 18" ni "18 filas después del título": se busca la fila cuyo primer rótulo es
 * el del encabezado del cuadro, y el cuerpo llega hasta la fila anterior al título de la sección
 * siguiente ("2 · CUENTA CORRIENTE…"). Si el bloque crece, se corre solo.
 *
 * @param {Array<Array<any>>} filas grilla de la pestaña (índice 0 → fila 1)
 * @param {{rotulo?: RegExp}} opts
 * @returns {{cabecera: number, desde: number, hasta: number}|null} filas 1-based, `hasta` inclusive
 */
export function bloqueDeDeuda(filas, { rotulo = /^proveedor\s*\/\s*factura$/i } = {}) {
  const texto = (f) => String(f?.[0] ?? '').trim()
  const iCab = (filas ?? []).findIndex((f) => rotulo.test(texto(f)))
  if (iCab < 0) return null
  // El título de la sección siguiente: "2 · …". Es el techo del cuerpo.
  let iFin = filas.length
  for (let i = iCab + 1; i < filas.length; i++) {
    if (/^\d+\s*·\s/.test(texto(filas[i]))) { iFin = i; break }
  }
  return { cabecera: iCab + 1, desde: iCab + 2, hasta: iFin }
}

/**
 * Clasifica cada fila del cuerpo del cuadro: cabecera de proveedor, factura suya, o vacía.
 *
 * Las cabeceras y las facturas se distinguen por la PRIMERA COLUMNA (el nombre del proveedor): sólo
 * la cabecera lo lleva. Vale igual si la celda trae una fórmula —el nombre puede estar gateado por
 * `soloConDeuda`—, porque lo que importa acá es la FORMA de la fila, no el valor que mostrará.
 *
 * @param {Array<Array<any>>} filas grilla de la pestaña
 * @param {{prov?:number, comp?:number, imp?:number, desde:number, hasta:number}} layout
 * @returns {{cabeceras:number[], detalles:number[], vacias:number[], grupos:Array<{inicio:number,fin:number}>}}
 */
export function clasificarDeuda(filas, { prov = 0, comp = 2, imp = 3, desde, hasta }) {
  const cabeceras = []; const detalles = []; const vacias = []
  for (let f = desde; f <= hasta; f++) {
    const fila = filas?.[f - 1] ?? []
    const conProv = !celdaVacia(fila[prov])
    const conDato = (comp >= 0 && !celdaVacia(fila[comp])) || (imp >= 0 && !celdaVacia(fila[imp]))
    if (conProv) cabeceras.push(f)
    else if (conDato) detalles.push(f)
    else vacias.push(f)
  }
  // Los grupos +/- : las facturas que siguen a cada cabecera, en tramo contiguo. Un proveedor sin
  // facturas debajo no genera grupo — un +/- que no plega nada es ruido en el margen.
  const esDetalle = new Set(detalles)
  const grupos = []
  for (const c of cabeceras) {
    let fin = c
    while (esDetalle.has(fin + 1)) fin++
    if (fin > c) grupos.push({ inicio: c + 1, fin })
  }
  return { cabeceras, detalles, vacias, grupos }
}
