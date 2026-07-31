// ¿EL SALDO DEL BANCO CIERRA CONSIGO MISMO? El control que faltaba sobre el número más importante.
//
// POR QUÉ EXISTE (31/07). El dueño: "está mal el saldo de caja en todos lados". Y tenía razón, con un
// número exacto. CAJA mostraba $87.913.839,27 —que ES lo que declara el extracto en su último
// movimiento, no un invento— pero el extracto cargado tiene un AGUJERO de $113.314,76: la suma de los
// 170 importes más el saldo inicial da $88.027.154,03 y el extracto declara $87.913.839,27.
//
// Nadie lo veía porque no había ningún control sobre esto. Todo el archivo cuelga de ese saldo
// (CAJA_TOTAL_DISPONIBLE → el efectivo inicial de los dos cash flow → el piso proyectado → las
// decisiones de pago), así que un agujero acá se propaga a todas las pantallas en silencio.
//
// ═══ DOS PRUEBAS, Y LA DIFERENCIA ENTRE ELLAS IMPORTA ═══
//
// 1 · LA IDENTIDAD GLOBAL, que NO depende del orden:
//        saldo_inicial + Σ importes = saldo_final
//     Si esto falla, FALTA o SOBRA un movimiento (o un importe está mal tipeado). Es la prueba dura.
//
// 2 · LA CADENA, movimiento por movimiento: saldo_despues(n) − importe(n) = saldo_despues(n−1).
//     Ubica el problema con fecha, concepto y referencia. Pero es sensible al ORDEN: dos movimientos
//     del mismo día cargados en distinto orden que el extracto rompen la cadena SIN que falte nada.
//     Medido en el caso real: 40 roturas, de las cuales 39 se compensan entre sí y una —$113.314,76,
//     un "Depósito e-cheq int misma plaza"— es la única que la identidad global confirma.
//
// Por eso el veredicto lo da la IDENTIDAD y la cadena sólo señala DÓNDE mirar. Reportar las 40 roturas
// como 40 errores sería ruido: el dueño dejaría de leer el control, que es la peor forma de perderlo.

/** @typedef {{fecha: string, concepto?: string, importe: number|string, saldo_despues: number|string|null, referencia?: string|null}} Mov */

const num = (v) => Number(v ?? 0)
const redondo = (n) => Math.round(n * 100) / 100

/**
 * NÚCLEO PURO: la identidad que no depende del orden.
 *
 * @param {Mov[]} movimientos en cualquier orden, todos de la MISMA cuenta
 * @returns {{cierra: boolean, inicial: number, suma: number, esperado: number, declarado: number, diferencia: number}|null}
 */
export function identidadGlobal(movimientos = []) {
  const conSaldo = movimientos.filter((m) => m?.saldo_despues !== null && m?.saldo_despues !== undefined)
  if (conSaldo.length < 2) return null
  const primero = conSaldo[0]
  const ultimo = conSaldo[conSaldo.length - 1]
  const inicial = redondo(num(primero.saldo_despues) - num(primero.importe))
  const suma = redondo(movimientos.reduce((a, m) => a + num(m.importe), 0))
  const esperado = redondo(inicial + suma)
  const declarado = redondo(num(ultimo.saldo_despues))
  const diferencia = redondo(declarado - esperado)
  return { cierra: Math.abs(diferencia) < 0.01, inicial, suma, esperado, declarado, diferencia }
}

/**
 * NÚCLEO PURO: dónde se corta la cadena de saldos. Señala, no juzga (ver la nota de arriba).
 *
 * @param {Mov[]} movimientos EN EL ORDEN en que los trae el extracto
 * @returns {Array<{fecha: string, concepto: string, referencia: any, esperado: number, real: number, diferencia: number}>}
 */
export function roturasDeCadena(movimientos = []) {
  const conSaldo = movimientos.filter((m) => m?.saldo_despues !== null && m?.saldo_despues !== undefined)
  const out = []
  for (let i = 1; i < conSaldo.length; i++) {
    const a = conSaldo[i - 1]; const b = conSaldo[i]
    const esperado = redondo(num(a.saldo_despues) + num(b.importe))
    const real = redondo(num(b.saldo_despues))
    const diferencia = redondo(real - esperado)
    if (Math.abs(diferencia) < 0.01) continue
    out.push({ fecha: b.fecha, concepto: String(b.concepto ?? ''), referencia: b.referencia ?? null, esperado, real, diferencia })
  }
  return out
}

/**
 * NÚCLEO PURO: de las roturas de la cadena, la que la IDENTIDAD confirma como agujero real.
 *
 * Una rotura cuyo monto coincide con la diferencia global es el movimiento que falta; las que se
 * compensan entre sí son desorden intradía. Sin este filtro el control grita cuarenta veces por un
 * solo problema, y un control que grita de más no se lee.
 *
 * @param {Array<{diferencia: number}>} roturas
 * @param {number} diferenciaGlobal
 */
export function roturasQueExplican(roturas = [], diferenciaGlobal = 0) {
  if (Math.abs(diferenciaGlobal) < 0.01) return []
  return roturas.filter((r) => Math.abs(redondo(r.diferencia - diferenciaGlobal)) < 0.01)
}

/**
 * El veredicto completo de una cuenta, listo para mostrar.
 * @param {Mov[]} movimientos en el orden del extracto
 */
export function auditarCuenta(movimientos = []) {
  const identidad = identidadGlobal(movimientos)
  if (!identidad) return { identidad: null, roturas: [], culpables: [], veredicto: 'sin datos suficientes' }
  const roturas = roturasDeCadena(movimientos)
  const culpables = roturasQueExplican(roturas, identidad.diferencia)
  const veredicto = identidad.cierra
    ? 'el saldo cierra: no falta ni sobra un movimiento'
    : `falta(n) ${Math.abs(identidad.diferencia).toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })} — el saldo declarado no es la suma de los movimientos`
  return { identidad, roturas, culpables, veredicto }
}
