// EL IPC QUE EL INDEC YA PUBLICÓ — hechos, no expectativas.
//
// POR QUÉ EXISTE (21/07). La tabla `indice_economico` tenía diez períodos y los diez eran
// `tipo='proyeccion'` del REM del BCRA, porque la única función que escribía —`actualizarIndices()`—
// sólo guarda expectativas. Resultado: el cash flow ajustaba marzo, abril, mayo y junio con un
// PRONÓSTICO aunque el INDEC ya había publicado los cuatro. La regla del CLAUDE.md raíz es
// explícita: HECHO le gana a ESTIMACIÓN. Un mes cerrado no se proyecta, se sabe.
//
// ═══ CÓMO SE VERIFICA QUE ESTO NO ES INVENTADO ═══
//
// Cada mes trae su fuente. Pero una fuente por mes no alcanza: un dígito mal transcripto pasa
// desapercibido igual. Lo que lo cierra es que el INDEC publica además los ACUMULADOS, y encadenar
// los meses tiene que reproducirlos:
//   · enero–marzo encadenados  → 9,4% publicado como acumulado del 1er trimestre;
//   · enero–junio encadenados  → 16,8% publicado como acumulado del 1er semestre.
// Es el mismo método que encontró los typos del extracto del Santander: dos números que TIENEN que
// coincidir, y si no coinciden hay un error de carga. `verificarAcumulado()` lo corre en los tests,
// así que un dedazo en esta tabla rompe el build en vez de deformar la proyección en silencio.
//
// La tolerancia es de 0,15pp porque el INDEC calcula el acumulado sobre los NIVELES del índice y acá
// se encadenan variaciones ya redondeadas a un decimal. La diferencia es aritmética de redondeo, no
// de dato: encadenar los seis meses da 16,87% contra el 16,8% informado.
//
// LO QUE NO HACE: no estima el mes en curso ni ningún mes que el INDEC todavía no publicó. Eso sigue
// siendo trabajo de `actualizarIndices()` con el REM, y queda marcado como proyección.

/** Los meses del IPC nivel general que el INDEC ya publicó. Variación MENSUAL en fracción. */
export const IPC = [
  { periodo: '2026-01', variacion: 0.029 },
  { periodo: '2026-02', variacion: 0.029 },
  { periodo: '2026-03', variacion: 0.034 },
  { periodo: '2026-04', variacion: 0.026 },
  { periodo: '2026-05', variacion: 0.021 },
  { periodo: '2026-06', variacion: 0.019 },
  // JULIO 2026 — leído del informe de prensa oficial del INDEC (Vol. 10, n° 25), no de un diario.
  // La búsqueda web devolvió «19,3% interanual»; el informe dice que 19,3% es el ACUMULADO DEL AÑO.
  // Cargar el interanual como acumulado habría roto el control de abajo sin que nadie lo notara.
  { periodo: '2026-07', variacion: 0.021 },
]

export const FUENTE = 'INDEC — IPC nivel general, informes de prensa mensuales (contrastado con Chequeado y prensa económica)'
export const URL = 'https://www.indec.gob.ar/indec/web/Nivel4-Tema-3-5-31'

/** Los acumulados que el propio INDEC publicó. Son el control, no un cálculo nuestro. */
export const ACUMULADOS_PUBLICADOS = [
  { hasta: '2026-03', valor: 0.094, que: 'acumulado del 1er trimestre 2026' },
  { hasta: '2026-06', valor: 0.168, que: 'acumulado del 1er semestre 2026' },
  { hasta: '2026-07', valor: 0.193, que: 'acumulado enero-julio 2026 (informe IPC julio, INDEC)' },
]

/** Cuánta diferencia se acepta entre el encadenado y el acumulado publicado (en fracción). */
export const TOLERANCIA = 0.0015

/**
 * NÚCLEO PURO: encadena las variaciones mensuales hasta un período inclusive.
 * @returns {number} la variación acumulada en fracción (0.094 = 9,4%)
 */
export function acumulado(hasta, meses = IPC) {
  const f = meses
    .filter((m) => m.periodo <= hasta)
    .reduce((a, m) => a * (1 + Number(m.variacion)), 1)
  return f - 1
}

/**
 * NÚCLEO PURO: contrasta la tabla contra los acumulados que publicó el INDEC.
 * Un dedazo en un mes rompe el acumulado y aparece acá.
 * @returns {Array<{que:string, publicado:number, encadenado:number, diferencia:number}>} los que NO cierran
 */
export function verificarAcumulado(meses = IPC, controles = ACUMULADOS_PUBLICADOS) {
  const rotos = []
  for (const c of controles) {
    const enc = acumulado(c.hasta, meses)
    const dif = Math.abs(enc - c.valor)
    if (dif > TOLERANCIA) rotos.push({ que: c.que, publicado: c.valor, encadenado: enc, diferencia: dif })
  }
  return rotos
}

/**
 * NÚCLEO PURO: los meses publicados que todavía no están cargados como 'dato'.
 * @param {Array<{periodo:string, tipo:string}>} enBase lo que hay hoy en indice_economico
 */
export function faltantes(enBase = [], meses = IPC) {
  const ya = new Set(enBase.filter((r) => r.tipo === 'dato').map((r) => r.periodo))
  return meses.filter((m) => !ya.has(m.periodo))
}
