// LA CUENTA EN DÓLARES SE PUEDE DERIVAR DEL EXTRACTO EN PESOS.
//
// ═══ POR QUÉ EXISTE (04/09/2026) ═══
//
// El dueño: *"has cambiado el saldo de la cta en dólares, arregla, ayer te pasé"*. Tenía razón dos
// veces: el saldo estaba viejo —U$S 981,39 con fecha 05/08, veintinueve días— y él ya había mandado
// el bueno el 03/09 en una captura del homebanking (U$S 507,53).
//
// La causa de fondo no es que se me haya pasado la captura: es que la cuenta en dólares NO TIENE
// PUERTA DE CARGA. `importar-banco.mjs` entiende una sola cuenta, la corriente en pesos
// (179-091383/6), y este saldo vive como constante en `banco-santander.mjs`, o sea que se actualiza
// EDITANDO JAVASCRIPT. Un dato operativo que sólo se actualiza tocando el código no se actualiza:
// envejece. Es exactamente el diagnóstico que hizo nacer el importador del banco en julio, con los
// 127 movimientos escritos a mano.
//
// ═══ Y POR QUÉ SE PUEDE DERIVAR, QUE ES LO QUE NADIE HABÍA VISTO ═══
//
// El extracto EN PESOS declara, movimiento por movimiento, las operaciones de la cuenta en dólares:
// cada débito y cada crédito de la 179-091384/3 genera su impuesto ley 25.413 en la cuenta de pesos,
// y el concepto del impuesto lleva escrita LA BASE IMPONIBLE EN DÓLARES. Por ejemplo, el 01/09:
//
//   "Impuesto ley 25.413 debito 0,6%  - Cta orig: 179-091384/3 - base impo. usd   544,99"
//   "Impuesto ley 25.413 credito 0,6% - Cta orig: 179-091384/3 - base impo. usd    71,13"
//
// Y 981,39 − 544,99 + 71,13 = 507,53, que es EXACTAMENTE el saldo de la captura del dueño. Dos
// fuentes independientes —el homebanking y el impuesto— dan el mismo número sin haberse mirado.
//
// LO QUE ESTO NO PUEDE HACER, Y SE DECLARA: sólo ve los movimientos que pagan el 25.413. Una
// acreditación exenta, un ajuste del banco o una comisión cobrada EN la cuenta en dólares no dejan
// rastro acá, así que la derivación es un CONTROL, no un reemplazo del extracto. Sirve para gritar
// cuando el saldo declarado dejó de cerrar; el saldo bueno lo sigue firmando el extracto o la captura.

/** La cuenta corriente en dólares, tal como la nombra el concepto del impuesto en el extracto de pesos. */
export const CUENTA_USD = '179-091384/3'

/**
 * NÚCLEO PURO: las operaciones en dólares que un extracto de pesos delata, en orden.
 *
 * @param {Array<{fecha:string, concepto:string}>} movimientos los del extracto EN PESOS
 * @returns {Array<{fecha:string, signo:1|-1, usd:number}>}
 */
export function operacionesUsdDelExtracto(movimientos = []) {
  const out = []
  for (const m of movimientos) {
    const c = String(m?.concepto ?? '')
    if (!c.includes(CUENTA_USD)) continue
    const tipo = /25\.413\s+debito/i.test(c) ? -1 : /25\.413\s+credito/i.test(c) ? 1 : 0
    if (!tipo) continue
    // es_AR: miles con punto y decimales con coma. "15.400,00" y "544,99" tienen que dar lo mismo
    // que el banco imprime, no 15.4 ni 544.
    const n = c.match(/base impo\.\s*usd\s*([\d.]+,\d{2}|[\d.]+)/i)
    if (!n) continue
    const usd = Number(n[1].replace(/\./g, '').replace(',', '.'))
    if (!Number.isFinite(usd) || usd === 0) continue
    out.push({ fecha: m.fecha, signo: tipo, usd })
  }
  return out
}

/**
 * NÚCLEO PURO: a cuánto llega la cuenta en dólares partiendo de un saldo declarado.
 *
 * Sólo se cuentan las operaciones POSTERIORES al corte del saldo: las anteriores ya están adentro de
 * él, y volver a aplicarlas es el mismo error de doble conteo que el importador del banco evita
 * deduplicando por la referencia.
 *
 * @param {{saldo:number, corte:string}} declarado el saldo firmado y desde cuándo vale
 * @param {Array} movimientos el extracto en pesos
 * @returns {{saldo:number, corte:string, aplicadas:Array}}
 */
export function saldoUsdDerivado({ saldo, corte }, movimientos = []) {
  const ops = operacionesUsdDelExtracto(movimientos)
    .filter((o) => String(o.fecha) > String(corte))
    .sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)))
  const final = ops.reduce((acc, o) => acc + o.signo * o.usd, Number(saldo) || 0)
  return {
    // Dos decimales: son dólares de una cuenta bancaria, no un promedio.
    saldo: Math.round(final * 100) / 100,
    corte: ops.length ? ops[ops.length - 1].fecha : corte,
    aplicadas: ops,
  }
}

/**
 * ¿EL SALDO DECLARADO SIGUE CERRANDO CONTRA EL EXTRACTO?
 *
 * Devuelve el desvío en dólares. Cero —o nada que aplicar— es que cierra. Es el control que hacía
 * falta: sin él, el saldo envejece en silencio y CAJA lo publica como si fuera de hoy.
 */
export function desvioDelSaldoUsd(anterior, declarado, movimientos = []) {
  const d = saldoUsdDerivado(anterior, movimientos)
  return { derivado: d.saldo, declarado: Number(declarado), desvio: Math.round((d.saldo - Number(declarado)) * 100) / 100, aplicadas: d.aplicadas }
}
