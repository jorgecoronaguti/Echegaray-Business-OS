// LAS COLUMNAS DE COBRANZAS DEL GRUPO COBRANZAS — por rótulo, contra la fila VIVA de esa corrida.
//
// ═══ POR QUÉ UN ARCHIVO APARTE Y NO MÁS CLAVES EN `columnas-por-encabezado.mjs` (14/09/2026) ═══
//
// La inserción de «Obra» en Cobranzas H corre una letra todo lo que está a la derecha: el total pasa
// de M a N, la fecha de cobro de Q a R, la moneda de AA a AB. Este grupo (sync, cola de la app,
// control, cuadro por cliente, CAJA, IMPUESTOS) usa rótulos que el mapa base no declara —Categoría,
// IVA, Notas, Fecha de Venta—. Se declaran acá, EXTENDIENDO el mapa base, para que las ramas de los
// otros grupos no se pisen editando el mismo objeto: el rótulo de una columna sigue definido una vez.
//
// Las reglas son las del resolvedor: un rótulo que falta es un error con su nombre, sin letra de
// respaldo; la fila de rótulos se lee una vez por corrida y se pasa hacia abajo.

import { COBRANZAS, columnasDe, lectorDeEncabezados } from './columnas-por-encabezado.mjs'
import { letra, normalizarRotulo } from './compras-columnas.mjs'

/**
 * Una columna que el OS escribe con un rótulo que CAMBIA en cada corrida («Qué dice el banco de este
 * valor · al 2026-09-14»): se ubica por cómo EMPIEZA. Exactamente una, o error — entre dos, elegir la
 * primera es elegir a ciegas, y no hay letra de respaldo.
 * @param {any[]} encabezado
 * @param {string|string[]} prefijos uno o varios comienzos aceptados (p. ej. las dos variantes del glifo)
 */
export function ubicarPorPrefijo(encabezado = [], prefijos, pestana = 'Cobranzas') {
  const lista = [].concat(prefijos)
  const ps = lista.map(normalizarRotulo)
  const hits = encabezado.flatMap((c, i) => (ps.some((p) => normalizarRotulo(c).startsWith(p)) ? [i] : []))
  if (hits.length !== 1) {
    const que = hits.length ? `aparece ${hits.length} veces` : 'no está'
    throw new Error(`${pestana}: la columna que empieza con «${lista[0]}» ${que} en la fila de rótulos. No uso una letra de respaldo.`)
  }
  return { letra: letra(hits[0]), indice: hits[0] }
}

/** Todos los rótulos de Cobranzas que usa este grupo. Leídos del archivo real el 14/09/2026. */
export const COBRANZAS_OS = Object.freeze({
  ...COBRANZAS,
  categoria: 'Categoría', fechaVenta: 'Fecha de Venta', factura: 'Factura', comprobante: 'N° Comprobante',
  unidad: 'Unidad', iva: 'IVA', retenciones: 'Retenciones / descuentos', fechaFactura: 'Fecha de Factura',
  mesCobro: 'Mes cobro (auto)', probabilidad: 'Probabilidad %', notas: 'Notas',
})

/**
 * Las columnas pedidas, resueltas contra `encabezado`. Sin `claves`, todas las de `COBRANZAS_OS`.
 * `obra` es opcional (la pestaña puede no tenerla todavía) y vuelve `null` si falta.
 * @param {any[]} encabezado la fila 4 de Cobranzas tal como se leyó
 * @param {string[]} [claves]
 * @returns {Record<string, {letra:string, indice:number}>}
 */
export function columnasCobranzas(encabezado, claves = Object.keys(COBRANZAS_OS)) {
  const pedidas = {}
  for (const k of claves) {
    if (!COBRANZAS_OS[k]) throw new Error(`Cobranzas: no hay rótulo declarado para «${k}» en COBRANZAS_OS`)
    pedidas[k] = COBRANZAS_OS[k]
  }
  return columnasDe(encabezado, pedidas, 'Cobranzas')
}

/** La fila de rótulos VIVA leída una vez, y sus columnas resueltas. */
export async function leerColumnasCobranzas(google, fileId, claves) {
  return columnasCobranzas(await lectorDeEncabezados(google, fileId).encabezado('Cobranzas'), claves)
}

/**
 * Portón de los núcleos puros: sin la columna resuelta no se arma ninguna fórmula ni rango. Una
 * letra por defecto acá es exactamente la que después de la inserción apunta a la columna de al lado.
 */
export function exigirColumnas(cols, claves, quien) {
  const faltan = claves.filter((k) => !cols?.[k]?.letra)
  if (faltan.length) {
    throw new Error(`${quien}: faltan columnas de Cobranzas resueltas por encabezado (${faltan.join(', ')}) — leé la fila de rótulos con leerColumnasCobranzas`)
  }
  return cols
}
