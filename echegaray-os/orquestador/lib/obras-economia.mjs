// LA ECONOMÍA DE UNA OBRA EN CARTERA — contratado, costo MO, costo materiales y margen — COMO UN
// SOLO CONCEPTO, DEFINIDO UNA VEZ.
//
// ═══ POR QUÉ EXISTE (08/09/2026) ═══
//
// El dueño: «en la pestaña OBRAS del Sheet Flujo de Fondos están los montos contratados y los valores
// de costeo de mano de obra y materiales de cada obra; agregarlos en Clientes». La pantalla decía
// «sin contrato» en las nueve obras activas porque leía `obra_canonica.monto_contratado`, que nadie
// carga, mientras la pestaña OBRAS publicaba el contrato leído de la ORDEN DE COMPRA de Cobranzas.
// Dos caras, dos verdades: es lo que REALIDAD ÚNICA prohíbe.
//
// Acá NO se lee ninguna fuente: se recibe lo que ya leyó `obras-pestana.mjs` (`contratoDeObra`) y lo
// que suma `obra_egreso_proyectado`, y se resuelve con las MISMAS reglas que la columna D de OBRAS
// (`contratado()` en obras-grilla.mjs): OC en pesos > U$S × TC > suma viva de sus filas.

import { filasDeObra, normalizarMoneda } from './cobranzas-contrato.mjs'

/** Lo que Cobranzas escribe en Estado para una fila que NO es venta (mismo criterio que OBRAS). */
export const NO_VENTA = 'CANCELAR'

/** El origen de cada contratado, como texto: quien audita tiene que saber por cuál camino salió. */
export const ORIGEN = Object.freeze({
  ocPesos: 'oc-pesos', ocUsd: 'oc-usd-x-tc', sumaViva: 'suma-viva', sinDato: null,
})

/**
 * LA VENTA VIVA DE UNA OBRA: el NETO de sus filas de Cobranzas que no están canceladas, en pesos.
 * Es la tercera forma del contrato (obras sin OC declarada, p. ej. las de MESSINA) — la misma suma
 * que la fórmula `venta()` de OBRAS, hecha en JS para poder persistirla.
 *
 * @returns {{pesos:number|null, filas:number, sinMoneda:number}} `pesos` es null cuando la obra no
 *   tiene ninguna fila (no se sabe → no es cero) o cuando una fila en USD no pudo valuarse.
 */
export function ventaViva(filas = [], cols = {}, selector = {}, tc = null) {
  const indices = filasDeObra(filas, cols, selector)
  let pesos = 0
  let n = 0
  let sinMoneda = 0
  for (const i of indices) {
    const f = filas[i] ?? []
    if (String(f[cols.estado] ?? '').trim().toUpperCase() === NO_VENTA) continue
    const neto = Number(f[cols.neto]) || 0
    const moneda = normalizarMoneda(f[cols.moneda])
    if (moneda === 'USD') {
      if (!Number.isFinite(tc) || tc <= 0) { sinMoneda++; continue }
      pesos += neto * tc
    } else pesos += neto
    n++
  }
  if (!n || sinMoneda) return { pesos: null, filas: n, sinMoneda }
  return { pesos, filas: n, sinMoneda }
}

/**
 * EL CONTRATADO EN PESOS, POR EL MISMO CAMINO QUE LA COLUMNA D DE OBRAS.
 *
 * @param {{contrato?:number|null, contratoUsd?:number|null, ventaViva?:number|null}} c
 * @param {number|null} tc tipo de cambio USD leído del Sheet
 * @returns {{contratado:number|null, contratadoUsd:number|null, origen:string|null}}
 */
export function contratadoEnPesos(c = {}, tc = null) {
  if (Number.isFinite(c.contrato) && c.contrato > 0) {
    return { contratado: c.contrato, contratadoUsd: null, origen: ORIGEN.ocPesos }
  }
  if (Number.isFinite(c.contratoUsd) && c.contratoUsd > 0) {
    if (!Number.isFinite(tc) || tc <= 0) return { contratado: null, contratadoUsd: c.contratoUsd, origen: ORIGEN.sinDato }
    return { contratado: c.contratoUsd * tc, contratadoUsd: c.contratoUsd, origen: ORIGEN.ocUsd }
  }
  if (Number.isFinite(c.ventaViva) && c.ventaViva > 0) {
    return { contratado: c.ventaViva, contratadoUsd: null, origen: ORIGEN.sumaViva }
  }
  return { contratado: null, contratadoUsd: null, origen: ORIGEN.sinDato }
}

/**
 * EL MARGEN PROYECTADO: contratado − MO − materiales, en $ y en % del contratado.
 * Un dato que falta hace faltar el margen: un margen sobre un costo desconocido sería un invento.
 */
export function margenDe({ contratado, costoMo, costoMateriales } = {}) {
  const c = aNum(contratado); const mo = aNum(costoMo); const ma = aNum(costoMateriales)
  if (c === null || mo === null || ma === null) return { margen: null, margenPct: null }
  const margen = c - mo - ma
  return { margen, margenPct: c > 0 ? (margen / c) * 100 : null }
}

const aNum = (v) => (v === null || v === undefined || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null)

/**
 * LA FILA QUE SE PERSISTE EN `obra_economia_sheet`, para una obra.
 *
 * @param {object} o la obra de `obras-datos.mjs` (clave, inicio, fin)
 * @param {{contrato, contratoUsd}} c lo que devolvió `contratoDeObra`
 * @param {{mo:number|null, material:number|null}} costos sumas de `obra_egreso_proyectado`
 * @param {{ventaViva:number|null, tc:number|null, obraCanonicaId:string|null}} ctx
 */
export function filaEconomia(o = {}, c = {}, costos = {}, ctx = {}) {
  const k = contratadoEnPesos({ ...c, ventaViva: ctx.ventaViva ?? null }, ctx.tc ?? null)
  const costoMo = aNum(costos.mo)
  const costoMateriales = aNum(costos.material)
  const m = margenDe({ contratado: k.contratado, costoMo, costoMateriales })
  return {
    obra_clave: o.clave,
    obra_canonica_id: ctx.obraCanonicaId ?? null,
    contratado: k.contratado,
    contratado_usd: k.contratadoUsd,
    costo_mo: costoMo,
    costo_materiales: costoMateriales,
    margen: m.margen,
    plazo_desde: o.inicio ?? null,
    plazo_hasta: o.fin ?? null,
    origen: k.origen,
  }
}
