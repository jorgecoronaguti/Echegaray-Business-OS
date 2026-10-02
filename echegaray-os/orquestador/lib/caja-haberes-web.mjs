// LOS HABERES PAGADOS QUE SE MARCAN EN LA WEB, ADENTRO DE LAS FÓRMULAS DE CAJA — EL ENGANCHE.
//
// ═══ POR QUÉ EXISTE (02/10/2026) ═══
//
// El dueño, pagando la quincena 16–30/09: lo que se marca en Liquidación de horas (pagado en banco / en
// efectivo) tiene que «reflejarse ok en todos lados», y CAJA mostraba «Efectivo en pesos» sin descontar lo que
// salió del cajón ese día. CAJA descargaba la nómina SÓLO por la planilla (Nómina: «Pagado el», Banco, Adelanto,
// Total recibo; Oficina: «Se paga el», Pagado, Banco), y la planilla se completa después — o nunca, si la web ya
// lo tiene. La web gana: desde la quincena de corte, lo pagado sale de `_HABERES_PAGADOS_RAW`.
//
// ═══ UNA FUENTE POR QUINCENA, NUNCA DOS ═══
//
// El corte no es por fecha de pago sino por QUINCENA (la columna C de la réplica contra `JORNALES_REAL_DESDE`):
// una quincena se lee de la planilla O de la web, nunca de las dos. Si el dueño además anota «Pagado el» en la
// planilla para una quincena ≥ corte, la planilla queda afuera por construcción y no se resta dos veces. La
// Oficina no tiene «desde»: su fila es un MES y se identifica por «Se paga el» (el sueldo de septiembre se paga
// el 01/10). Como el mensualizado se liquida en la web por mes en la 2ª quincena (desde septiembre), «Se paga el»
// ≥ corte es exactamente el mes que la web ya tiene.
//
// ═══ POR QUÉ EL EFECTIVO NO FILTRA «Sale de» ═══
//
// Un pago hecho con la plata de una ENTREGA A RENDIR («Sale de» = entrega a rendir) ya bajó la caja al
// entregarse — pero CAJA también DEVUELVE ese adelanto (`MOVIMIENTOS_QUE_VUELVEN`, «Adelanto de sueldo» de
// `_EFECTIVO_RAW`), justamente porque la nómina siempre restó el sueldo ENTERO. Si acá se restara sólo «caja», el
// adelanto volvería y no se iría nunca: el cajón quedaría inflado por cada adelanto. Restando todo el efectivo, el
// contrapeso que ya existe sigue cerrando, igual que con la planilla.
//
// ═══ EL CORTE ES UN PARÁMETRO DE LA RÉPLICA ═══
//
// `B2` de la réplica, escrito por su generador desde `CORTE_QUINCENA` (lib/haberes-pagados.mjs), con rótulo en A2.
// Si la celda no es una fecha (una réplica vieja, anterior a este enganche) el corte cae en 31/12/9999: la web no
// suma nada y la planilla suma todo — el comportamiento de antes, sin duplicar en ningún sentido.
import { ventanaDelConteo } from './caja-ancla-por-instante.mjs'

/** La réplica: hoja, primera fila de datos, columnas (el contrato de `haberes-pagados-raw-pestana.mjs`). */
export const HAB = Object.freeze({
  hoja: "'_HABERES_PAGADOS_RAW'", desde: 4, corte: '$B$2',
  fecha: 'A', quincena: 'C', grupo: 'E', medio: 'G', importe: 'I',
})

/** Los grupos de la web que tienen su propio renglón en CAJA. `obreros` = todo lo que no es oficina. */
const GRUPO = { obreros: (g) => `(${g}<>"oficina")`, oficina: (g) => `(${g}="oficina")` }

const col = (h, x) => `${h.hoja}!$${x}$${h.desde}:$${x}`

/** La quincena de corte, o 31/12/9999 si la réplica todavía no la publica (= todo sigue por la planilla). */
export const corteQuincena = (h = HAB) =>
  `IF(ISNUMBER(${h.hoja}!${h.corte});${h.hoja}!${h.corte};DATE(9999;12;31))`

/** El factor que deja en la planilla sólo lo ANTERIOR al corte. `desde` = el rango de fechas que identifica la fila. */
export const antesDelCorte = (desde, h = HAB) => `(${desde}<${corteQuincena(h)})`

/** Las filas de la réplica de un medio y un grupo, de quincenas ≥ corte. Factor listo para multiplicar. */
function filasDesdeElCorte(medio, grupo, h) {
  const q = col(h, h.quincena)
  return `(${col(h, h.medio)}="${medio}")*${GRUPO[grupo](col(h, h.grupo))}*ISNUMBER(${q})*(${q}>=${corteQuincena(h)})`
}

const importe = (h) => `IF(ISNUMBER(${col(h, h.importe)});${col(h, h.importe)};0)`

/**
 * NÚCLEO PURO: los haberes pagados en EFECTIVO desde el conteo, según la web. DESCARGA de la caja física.
 * Misma ventana que todas las salidas del cajón (`ventanaDelConteo`, inclusiva, con techo en hoy).
 * @param {string} arqueo referencia al ancla del conteo (la que reciben las demás salidas)
 * @param {'obreros'|'oficina'} grupo
 */
export function formulaHaberesWebEfectivo(arqueo, grupo, h = HAB) {
  const f = col(h, h.fecha)
  return `SUMPRODUCT(${filasDesdeElCorte('efectivo', grupo, h)}*ISNUMBER(${f})*${ventanaDelConteo(f, arqueo, false)}*${importe(h)})`
}

/**
 * NÚCLEO PURO: los haberes pagados por BANCO después del corte del extracto, según la web. Ventana exclusiva,
 * igual que la planilla: lo del día del corte ya está en el saldo del extracto.
 * @param {string} corte referencia a la fecha de corte del extracto
 * @param {'obreros'|'oficina'} grupo
 */
export function formulaHaberesWebBanco(corte, grupo, h = HAB) {
  const f = col(h, h.fecha)
  return `SUMPRODUCT(${filasDesdeElCorte('banco', grupo, h)}*ISNUMBER(${f})*(${f}>${corte})*${importe(h)})`
}

/** NÚCLEO PURO: la fecha del último pago en efectivo de la web dentro de la ventana (para la fecha de CAJA!D7). */
export function maxHaberesWebEfectivo(arqueo, grupo, h = HAB) {
  const f = col(h, h.fecha)
  return `SUMPRODUCT(MAX(${filasDesdeElCorte('efectivo', grupo, h)}*ISNUMBER(${f})*${ventanaDelConteo(f, arqueo, false)}`
    + `*(${importe(h)}<>0)*IF(ISNUMBER(${f});${f};0)))`
}
