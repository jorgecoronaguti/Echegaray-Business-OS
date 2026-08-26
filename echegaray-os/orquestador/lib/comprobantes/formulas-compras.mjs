// LA FÓRMULA DE CADA COLUMNA, REPLICADA EN JS — PARA PODER DECIDIR SIN ESCRIBIR.
//
// ═══ POR QUÉ EXISTE (25/08/2026) ═══
//
// `contrato-columnas.mjs` dice CUÁLES columnas son fórmula por fila. Este archivo dice QUÉ DEVUELVE
// esa fórmula, y existe por una razón muy concreta: para restaurar una fórmula sobre una celda que
// hoy tiene un número pegado hay que saber antes si restaurarla **cambia el número**. Si no lo
// cambia, la restauración es mecánica y no toca ningún dato. Si lo cambia, lo que hay pegado ahí es
// una decisión de una persona y borrarla es borrar trabajo del dueño.
//
// Medido contra el Sheet vivo el 25/08/2026 sobre `Compras!A4:AN905`:
//   · `U` (`=T−O`) tiene un número pegado en **312 filas**. En 178 el número YA es `T−O` (restaurar
//     no mueve nada). En **134 difiere** — entre ellas la 842, con el parcial cargado en positivo
//     ($136.000 donde la fórmula da −$136.000), y once filas recientes con `0` donde la fórmula da
//     el saldo impago completo. Esas 134 NO se tocan solas: cambian números que llegan al Cash Flow.
//   · `Q` tiene un número pegado en **524 filas, desde la 4** — o sea desde el origen de la pestaña,
//     mucho antes de que existiera el cargador. Casi todas llevan una fecha DISTINTA de la de la
//     factura: es el vencimiento real del echeq, que ni la fórmula ni el cargador pueden saber.
//     **Q pegada es el estado normal de esta pestaña, no un daño.**
//   · `R` (`=Q`) tiene un número pegado en 5 filas; en 4 de ellas coincide con `Q`.
//
// La conclusión que este archivo hace ejecutable: lo que parecía "el cargador pisó 46 celdas" es, en
// su enorme mayoría, la pestaña funcionando como siempre funcionó. El daño reparable sin criterio
// humano es exactamente el subconjunto no-op, y hay que poder demostrarlo celda por celda.
//
// ═══ EL CONTROL NO SE VALIDA CONTRA SÍ MISMO ═══
//
// Cada evaluador declara el TEXTO de la fórmula que replica. Antes de reparar nada, el script lee la
// fórmula viva de una fila modelo del Sheet y la compara contra ese texto. Si el dueño cambió la
// fórmula, la réplica quedó vieja y el script aborta en vez de "reparar" hacia una definición que ya
// no rige. Sin esa comparación, un evaluador desactualizado escribiría con total confianza el
// número equivocado.

/** Normaliza una fórmula para compararla: sin la fila concreta, sin espacios, en mayúsculas. */
export function esqueletoDeFormula(formula) {
  return String(formula ?? '')
    .replace(/(\$?[A-Z]{1,2})\$?\d+/g, '$1') // A900 → A · $C$12 → $C
    .replace(/\s+/g, '')
    .toUpperCase()
}

/** Lee una celda de la fila como número; lo que no es número vale 0, igual que `N()` en el Sheet. */
function n(fila, letra) {
  const v = fila[letra]
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}

/**
 * Cómo se recalcula cada columna de fórmula por fila que este archivo sabe replicar.
 *
 * `formula` es el texto medido en el Sheet el 25/08/2026 y es el que se compara contra el vivo.
 * `evaluar` recibe la fila como objeto `{A: valor, B: valor, …}` con los valores SIN formatear
 * (`UNFORMATTED_VALUE`: las fechas llegan como serial, los importes como número).
 *
 * Una columna sin entrada acá NO se puede reparar automáticamente. Es a propósito: `T` y `X` son
 * fórmula que el cargador pisa por diseño (ver `pisaElCargador` en el contrato) y `AG`/`AH`/`AI`
 * dependen de columnas que a su vez son ARRAYFORMULA. Reparar a ciegas ahí es peor que no reparar.
 */
export const EVALUADORES = Object.freeze({
  Q: Object.freeze({
    formula: '=IF(F="pago";C;"Pendiente")',
    evaluar: (fila) => (String(fila.F ?? '').toLowerCase() === 'pago' ? (fila.C ?? '') : 'Pendiente'),
  }),
  R: Object.freeze({
    formula: '=Q',
    evaluar: (fila) => fila.Q ?? '',
  }),
  U: Object.freeze({
    formula: '=T-O',
    evaluar: (fila) => n(fila, 'T') - n(fila, 'O'),
  }),
})

/** Dos valores del Sheet son el mismo dato. Los números toleran el medio centavo del redondeo. */
export function mismoValor(a, b) {
  const na = typeof a === 'number', nb = typeof b === 'number'
  if (na && nb) return Math.abs(a - b) < 0.005
  if (na !== nb) return false
  return String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase()
}

export const VEREDICTO = Object.freeze({
  /** La celda ya tiene su fórmula. No hay nada que hacer. */
  YA_ES_FORMULA: 'ya_es_formula',
  /** Tiene un valor pegado, pero es EXACTAMENTE el que la fórmula devuelve: restaurar no mueve nada. */
  NO_OP: 'no_op',
  /** Tiene un valor pegado que la fórmula no reproduce: es un dato que puso una persona. */
  DATO_HUMANO: 'dato_humano',
  /** No hay evaluador para esta columna: no se puede decidir sin escribir, así que no se decide. */
  SIN_EVALUADOR: 'sin_evaluador',
  /** La celda está vacía. */
  VACIA: 'vacia',
})

/**
 * Qué hacer con UNA celda. Es una función pura sobre la fila ya leída — de ahí que se pueda testear
 * sin red y sin Sheet, que es justamente lo que un control sobre una fuente de verdad necesita.
 *
 * @param letra columna del contrato
 * @param formulaCruda lo que devuelve la API con `valueRenderOption=FORMULA` (`'=T900-O900'` o `0`)
 * @param fila valores SIN formatear de la fila, como `{C: 46264, F: 'pago', O: 304515.98, …}`
 */
export function veredictoDeCelda(letra, formulaCruda, fila) {
  const cruda = String(formulaCruda ?? '').trim()
  if (cruda.startsWith('=')) return { veredicto: VEREDICTO.YA_ES_FORMULA }
  if (cruda === '') return { veredicto: VEREDICTO.VACIA }

  const ev = EVALUADORES[letra]
  if (!ev) return { veredicto: VEREDICTO.SIN_EVALUADOR, actual: fila[letra] }

  const esperado = ev.evaluar(fila)
  const actual = fila[letra]
  return {
    veredicto: mismoValor(actual, esperado) ? VEREDICTO.NO_OP : VEREDICTO.DATO_HUMANO,
    actual,
    esperado,
  }
}
