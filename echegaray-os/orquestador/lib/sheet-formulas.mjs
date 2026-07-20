// LEER LA FÓRMULA, NO EL RESULTADO.
//
// POR QUÉ EXISTE (20/07): la pestaña RESUMEN mostraba `#REF!` en el total de la quincena actual y el
// OS no podía decir por qué — `readSheetValues` devuelve el texto "#REF!" y nada más. Sin la fórmula
// el diagnóstico es adivinanza, y adivinar sobre un número de plata es exactamente lo que este
// proyecto prohíbe. Peor: un `#REF!` adentro de un `SI.ERROR` no se ve NUNCA — devuelve 0 y el error
// pasa por dato. Ya pasó dos veces en esta misma planilla (`ORDENAR` inexistente, rango mal armado).
//
// También responde la otra pregunta que manda acá: ¿esta celda es una fórmula o un número pegado a
// mano? (regla de oro del dueño: en el Sheet, nunca números sueltos).

/** Los errores que Google Sheets devuelve como texto en la celda. */
export const ERRORES = ['#REF!', '#ERROR!', '#N/A', '#¡VALOR!', '#VALUE!', '#DIV/0!', '#¡DIV/0!', '#NAME?', '#¿NOMBRE?', '#NUM!', '#NULL!']

/** ¿El valor mostrado es un error de Sheets? PURA. */
export function esError(valor) {
  const v = String(valor ?? '').trim()
  return ERRORES.some((e) => v === e || v.startsWith(e))
}

/** Índice de columna (0-based) a letra A1. PURA. */
export function colLetra(i) {
  let s = ''
  for (let n = i; n >= 0; n = Math.floor(n / 26) - 1) s = String.fromCharCode(65 + (n % 26)) + s
  return s
}

/**
 * NÚCLEO PURO: aplana la grilla de readSheetGrid a una lista de celdas con contenido propio.
 * Sólo devuelve celdas donde ALGUIEN escribió algo: las derramadas (resultado de un ARRAYFORMULA o
 * IMPORTRANGE vecino) se cuentan aparte y no se listan — si no, una IMPORTRANGE de 990 filas tapa
 * el informe entero con ruido.
 * @param {{filas:Array, offset:{fila:number,col:number}}} grid salida de google.readSheetGrid
 * @returns {{celdas:Array, errores:Array, con_formula:number, a_mano:number, derramadas:number}}
 */
export function mapearFormulas(grid = {}) {
  const off = grid.offset ?? { fila: 0, col: 0 }
  const celdas = []
  let derramadas = 0
  let conFormula = 0
  let aMano = 0

  ;(grid.filas ?? []).forEach((fila, fi) => {
    ;(fila ?? []).forEach((c, ci) => {
      if (!c) return
      if (c.derivada) { derramadas++; return }
      const tieneAlgo = c.formula != null || (c.valor != null && String(c.valor).trim() !== '')
      if (!tieneAlgo) return
      const ref = `${colLetra(off.col + ci)}${off.fila + fi + 1}`
      const err = esError(c.valor)
      if (c.formula != null) conFormula++
      else if (c.numero != null) aMano++
      celdas.push({ celda: ref, formula: c.formula, valor: c.valor, error: err || undefined })
    })
  })

  return {
    celdas,
    errores: celdas.filter((c) => c.error),
    con_formula: conFormula,
    a_mano: aMano,
    derramadas,
  }
}

/** Texto legible del mapeo. PURO. */
export function formatFormulas(r, range) {
  if (!r) return 'No pude leer las fórmulas.'
  const L = [`FÓRMULAS DE ${range}`, '']
  L.push(`  ${r.con_formula} celda(s) con fórmula · ${r.a_mano} número(s) escrito(s) a mano · ${r.derramadas} derramada(s)`)
  if (r.errores.length) {
    L.push('')
    L.push(`  ⚠ ${r.errores.length} CELDA(S) EN ERROR — acá está la fórmula que se rompió:`)
    for (const c of r.errores) L.push(`    ${c.celda}  ${c.valor}   ${c.formula ?? '(sin fórmula: el error viene de otra celda)'}`)
  }
  return L.join('\n')
}
