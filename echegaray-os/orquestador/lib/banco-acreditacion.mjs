// UN DEPÓSITO LISTADO NO ES PLATA DISPONIBLE — LA RETENCIÓN DE 48 HS, DECLARADA. NÚCLEO PURO.
//
// ═══ POR QUÉ EXISTE (10/09/2026) ═══
//
// El extracto del Santander trae dos bloques: "Últimos Movimientos", con saldo corrido por fila, y
// "Movimientos del Día", SIN saldo. Para los del día el saldo se reconstruye —`saldo(n) = saldo(n−1)
// + importe(n)`, una identidad, no una estimación— y así llegó a $42.157.467,50.
//
// El banco, al pie del mismo archivo, declaraba $3.584.941,27. La diferencia, $38.572.526,23, es
// EXACTAMENTE la suma de dos filas de ese día:
//
//     Deposito e-cheq 48hs presencia bsr    $ 6.567.841,01
//     Deposito e-cheq int ots plazas        $32.004.685,22
//
// Son depósitos que el banco LISTA como movimiento y todavía NO ACREDITA: quedan retenidos 48 hs. La
// identidad de la cadena es correcta y el resultado igual estaba mal, porque la identidad contesta
// "cuánto se movió" y CAJA pregunta "cuánto hay". Sin esto, `_BANCO_RAW` y CAJA publicaban $42,16 M
// de saldo bancario: $38,5 M que no se podían pagar.
//
// ═══ LA MARCA NO LA PONE EL CONCEPTO SOLO ═══
//
// El mismo concepto aparece en el extracto con saldo corrido los días en que YA acreditó ("Deposito
// e-cheq 48hs presencia bsr $15.079.296,20 → saldo 14.503.182,66"). Entonces la retención no es una
// propiedad del texto: es el estado de esa fila HOY. Un movimiento se marca pendiente sólo si cumple
// las tres cosas a la vez:
//
//   1. viene SIN saldo corrido (bloque del día: el banco todavía no le puso saldo),
//   2. es un CRÉDITO (importe > 0) — una retención sólo puede demorar plata que entra, y en el mismo
//      extracto "Echeq clearing recibido 48hs" y "Canje interno recibido 24 hs" son DÉBITOS: sin esta
//      condición se marcarían cheques propios que ya salieron de la cuenta,
//   3. su concepto declara la retención (lista de abajo, hecha con los conceptos reales del extracto).
//
// La marca se limpia sola: cuando un extracto posterior trae esa misma referencia CON saldo por fila,
// el banco ya acreditó y el saldo se COPIA (no se recalcula). Ver `importar-banco.mjs`.

/**
 * Los conceptos con los que el Santander declara una acreditación demorada, tomados del extracto real
 * del 10/09/2026 (no inventados, y por eso la lista es corta).
 *
 * NO ESTÁ "int misma plaza": en el mismo archivo aparece SIEMPRE con saldo corrido —acredita el mismo
 * día—, y lo mismo "Deposito echeq canje interno 24hs" (+$290.000, con saldo). Marcarlos sería
 * contradecir la evidencia y subdeclarar la caja.
 *
 * CÓMO SE AMPLÍA: no a ojo. Si un depósito nuevo queda retenido y su concepto no está acá, el cierre
 * del día no cierra contra el saldo declarado y `cerrarDia` lo devuelve como hallazgo con el concepto
 * a la vista. Ese hallazgo —y no una corazonada— es lo que agrega un patrón.
 */
export const PATRONES_RETENCION = [
  /\b48\s*hs?\b/i, // "Deposito e-cheq 48hs presencia bsr"
  /\bot(ra)?s\.?\s*plazas\b/i, // "Deposito e-cheq int ots plazas" — otra plaza compensa a 48 hs
  /\bclearing\b/i, // compensación entre bancos: nunca es del día
  /pendiente\s+de\s+acredit/i,
  /acredita\w*\s+diferid/i,
  /\ba\s+acreditar\b/i,
]

/** ¿El concepto declara que el banco todavía no acreditó? Sólo el TEXTO — no alcanza para marcar. */
export function conceptoRetenido(concepto) {
  const s = String(concepto ?? '')
  return PATRONES_RETENCION.some((re) => re.test(s))
}

/**
 * NÚCLEO PURO: ¿esta fila del extracto es un depósito todavía no acreditado?
 *
 * Las tres condiciones del encabezado, juntas. `saldo` es el que trajo el BANCO, no uno calculado:
 * pasarle un saldo ya reconstruido apagaría la marca justo cuando hace falta.
 *
 * @param {{concepto?:string, importe:number|string, saldo?:number|null}} m
 */
export function esAcreditacionPendiente(m) {
  if (!m) return false
  if (m.saldo !== null && m.saldo !== undefined) return false
  if (!(Number(m.importe) > 0)) return false
  return conceptoRetenido(m.concepto)
}

const redondo = (n) => Math.round(n * 100) / 100

/**
 * NÚCLEO PURO: la regla de cierre del día.
 *
 * Recorre los movimientos en el orden del extracto arrastrando el saldo, SALTEANDO los pendientes
 * (que no mueven la plata disponible), y contrasta el resultado contra el saldo que el banco declara
 * al pie. Tres veredictos, y ninguno es el silencio:
 *
 *   · `cierra: true` sin pendientes  → la cadena sola coincide con el banco.
 *   · `cierra: true` con pendientes  → coincide al excluirlos: la diferencia queda EXPLICADA y se
 *                                      publica con su detalle ("pendiente de acreditación $X: N eCheq").
 *   · `cierra: false`                → se publica IGUAL el declarado (es el dato del banco, no una
 *                                      opinión) y la diferencia sin explicar sale como HALLAZGO. Un
 *                                      número que no cierra y nadie ve es cómo se propaga un error.
 *
 * @param {{fecha?:string, concepto?:string, importe:number|string, saldo?:number|null}[]} movimientos
 *        en el orden del extracto (cronológico), incluidos los que ya traen saldo
 * @param {number|null} saldoDeclarado el del pie del extracto
 * @param {{tolerancia?:number}} opts
 */
export function cerrarDia(movimientos = [], saldoDeclarado = null, { tolerancia = 0.5 } = {}) {
  const pendientes = []
  let corrido = null
  let hubo = false
  for (const m of movimientos) {
    if (esAcreditacionPendiente(m)) { pendientes.push(m); continue }
    if (m.saldo !== null && m.saldo !== undefined) { corrido = Number(m.saldo); hubo = true; continue }
    if (corrido === null) continue // sin ancla no hay cadena que correr
    corrido = redondo(corrido + Number(m.importe))
    hubo = true
  }
  const saldoCalculado = hubo ? corrido : null
  const retenido = redondo(pendientes.reduce((a, m) => a + Number(m.importe), 0))
  const declarado = saldoDeclarado == null ? null : Number(saldoDeclarado)
  const diferencia = declarado == null || saldoCalculado == null ? null : redondo(saldoCalculado - declarado)
  const cierra = diferencia == null ? null : Math.abs(diferencia) <= tolerancia
  return {
    saldoCalculado,
    saldoDeclarado: declarado,
    // EL PUBLICADO ES EL DECLARADO SIEMPRE QUE EXISTA. La disponibilidad la dice el banco; la cadena
    // sirve para saber si lo entendimos, no para reemplazarlo.
    saldoPublicado: declarado ?? saldoCalculado,
    pendientes,
    retenido,
    diferencia,
    cierra,
    hallazgo: cierra === false
      ? `el saldo calculado (${saldoCalculado}) no coincide con el declarado por el banco (${declarado}) `
        + `ni excluyendo ${pendientes.length} depósito(s) retenido(s) por ${retenido}: quedan ${diferencia} sin explicar`
      : null,
  }
}

/**
 * El texto de una línea, para la nota de `_BANCO_RAW` y para el log. Vacío si no hay nada retenido:
 * un aviso que sigue puesto después de resuelto es la forma más rápida de que se deje de leer el
 * resto de la pestaña.
 */
export function explicacionPendientes(pendientes = []) {
  if (!pendientes.length) return ''
  const total = redondo(pendientes.reduce((a, m) => a + Number(m.importe), 0))
  const $ = total.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return `pendiente de acreditación $${$}: ${pendientes.length} depósito(s) que el banco lista y todavía no acredita`
}
