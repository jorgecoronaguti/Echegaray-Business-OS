// LAS COLUMNAS DE COMPRAS Y COBRANZAS QUE LEE EL CUADRO — POR RÓTULO, EN TIEMPO DE CORRIDA.
//
// ═══ POR QUÉ DEJARON DE SER CONSTANTES (14/09/2026) ═══
//
// `COL_RUBRO = 'Compras!$AC$4:$AC'`, `COL_FECHA`, `COL_TOTAL`, `COL_SUB` y las letras de Cobranzas
// (`$M$`, `$O$`, `$P$`, `$Q$`, `$BB$`) estaban escritas una vez en `cash-flow-lineas.mjs` y las
// consumían el cuadro, Estructura, Recurrentes y los controles. Con «Obra» insertada en Compras L y
// Cobranzas H, cada una apunta a la columna de al lado: el SUMIFS sigue siendo una fórmula válida y
// suma otra cosa sin un solo error. Por eso no hay constante: hay una función que lee la fila de
// rótulos viva y devuelve los rangos, y quien arma una fórmula tiene que pasarlos.
//
// ═══ «QUÉ DICE EL BANCO» SE BUSCA POR PREFIJO ═══
//
// Es la columna donde el dueño marca «ENDOSADO». Su rótulo lo escribe `cobranzas-control.mjs` con la
// fecha del corte adentro («… · al 2026-09-14»): cambia en cada corrida. Buscarlo exacto fallaría
// mañana; buscarlo por el prefijo, con una sola coincidencia exigida, sigue a la columna y no a la
// fecha.

import { COMPRAS, COBRANZAS, columnasDe, rangoAbierto, rangoHasta, lectorDeEncabezados } from './columnas-por-encabezado.mjs'
import { letra, normalizarRotulo } from './compras-columnas.mjs'

/**
 * HASTA QUÉ FILA SE LEE COBRANZAS. Es 400 y no 200 desde el 21/07: con el tope viejo, el día que
 * Cobranzas pasara la fila 200 los ingresos del cash flow habrían dejado de contar filas nuevas.
 */
export const FIN_COB = 400

/** El comienzo estable del rótulo de la columna de las marcas del banco en Cobranzas. */
export const PREFIJO_VALOR_BANCO = 'Qué dice el banco de este valor'

/** Las columnas de Compras que usa el cuadro, con la clave del contrato común (`COMPRAS`). */
const PEDIDO_COMPRAS = Object.freeze({
  subRubro: COMPRAS.subRubro, rubro: COMPRAS.rubro, fechaCaja: COMPRAS.fechaCaja,
  total: COMPRAS.total, proveedor: COMPRAS.proveedor, fecha: COMPRAS.fecha,
})

/** Las de Cobranzas. «Fecha de Factura» es la que el cuadro usa como vencimiento cuando no hay cobro. */
const PEDIDO_COBRANZAS = Object.freeze({
  unidad: 'Unidad', monto: COBRANZAS.total, estado: 'Estado', venc: 'Fecha de Factura', cobro: COBRANZAS.fechaCobro,
  cliente: COBRANZAS.cliente,
})

/** Una columna por el COMIENZO de su rótulo. Exige exactamente una coincidencia. */
export function ubicarPorPrefijo(encabezado = [], prefijo, pestana = 'la pestaña') {
  const clave = normalizarRotulo(prefijo)
  const hits = encabezado.flatMap((c, i) => (normalizarRotulo(c).startsWith(clave) ? [i] : []))
  if (hits.length !== 1) {
    throw new Error(`${pestana}: busco una columna que empiece con «${prefijo}» y hay ${hits.length}. No uso una letra de respaldo.`)
  }
  return { letra: letra(hits[0]), indice: hits[0] }
}

/**
 * Los rangos de Compras del cuadro, desde columnas YA resueltas con las claves de `COMPRAS` (lo que
 * devuelve `columnasDe(encabezado, COMPRAS)` o `lectorDeEncabezados().columnas('Compras')`).
 * `fecha` es la de CAJA —la del cash flow—; `factura` es la del comprobante, la del control contra ARCA.
 */
export function comprasDelCuadro(cols = {}) {
  const faltan = Object.keys(PEDIDO_COMPRAS).filter((k) => !cols[k]?.letra)
  if (faltan.length) throw new Error(`cash-flow: faltan las columnas de Compras resueltas por encabezado (${faltan.join(', ')})`)
  const r = (c) => rangoAbierto('Compras', c)
  return Object.freeze({
    sub: r(cols.subRubro), rubro: r(cols.rubro), fecha: r(cols.fechaCaja), total: r(cols.total),
    proveedor: r(cols.proveedor), factura: r(cols.fecha),
  })
}

/** Los rangos de Cobranzas del cuadro, contra su fila de rótulos. */
export function cobranzasDelCuadro(encabezado = []) {
  const cols = columnasDe(encabezado, PEDIDO_COBRANZAS, 'Cobranzas')
  cols.valorBanco = ubicarPorPrefijo(encabezado, PREFIJO_VALOR_BANCO, 'Cobranzas')
  return Object.freeze(Object.fromEntries(Object.entries(cols).map(([k, c]) => [k, rangoHasta('Cobranzas', c, FIN_COB)])))
}

/**
 * LOS RANGOS DEL CUADRO contra las dos filas de rótulos. Cobranzas es opcional: Estructura y
 * Recurrentes no la leen, y pedirles su encabezado sería una lectura de más.
 * @param {{compras:any[], cobranzas?:any[]}} encabezados
 * @returns {{compras:object, cobranzas:object|null}}
 */
export function rangosDelCuadro({ compras, cobranzas } = {}) {
  if (!Array.isArray(compras)) throw new Error('cash-flow: falta la fila de rótulos de Compras — sin ella no hay rangos')
  return Object.freeze({
    compras: comprasDelCuadro(columnasDe(compras, PEDIDO_COMPRAS, 'Compras')),
    cobranzas: Array.isArray(cobranzas) ? cobranzasDelCuadro(cobranzas) : null,
  })
}

/** Lee las dos filas de rótulos UNA vez y devuelve los rangos. */
export async function leerRangosDelCuadro(google, fileId) {
  const l = lectorDeEncabezados(google, fileId)
  return rangosDelCuadro({ compras: await l.encabezado('Compras'), cobranzas: await l.encabezado('Cobranzas') })
}

/** Sólo los de Compras, para quien no lee Cobranzas (el bloque de ARCA de Proveedores). Una lectura. */
export async function leerRangosDeCompras(google, fileId) {
  return rangosDelCuadro({ compras: await lectorDeEncabezados(google, fileId).encabezado('Compras') })
}

/** Los rangos de Compras, o un error que dice quién los necesitaba. */
export function exigirCompras(rg, quien) {
  if (!rg?.compras?.total) throw new Error(`${quien}: faltan los rangos de Compras resueltos por encabezado (rangosDelCuadro)`)
  return rg.compras
}

/** Los rangos de Cobranzas, o un error que dice quién los necesitaba. */
export function exigirCobranzas(rg, quien) {
  if (!rg?.cobranzas?.monto) throw new Error(`${quien}: faltan los rangos de Cobranzas resueltos por encabezado (rangosDelCuadro)`)
  return rg.cobranzas
}
