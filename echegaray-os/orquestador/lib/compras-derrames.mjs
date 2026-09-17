// EL FRENO DE LOS DERRAMES DE COMPRAS: ¿LAS COLUMNAS QUE CALCULA EL OS ESTÁN VIVAS DE VERDAD?
//
// ═══ POR QUÉ EXISTE (17/09/2026) ═══
//
// Entre las 09:18 y las 10:52 alguien dejó un valor pegado —46281, el 16/09/2026— en `Compras!AE962`,
// dentro de «Fecha de caja». Esa columna es UNA `ARRAYFORMULA` anclada en AE4 que derrama hacia abajo:
// con una sola celda ocupada en su camino Google no derrama nada y el ancla muestra
// `#REF! (Array result was not expanded because it would overwrite data in AE962)`.
//
// El pipeline siguió como si nada. `rubro-caja-sheet.mjs` avisó «sin fecha de caja: 967» con un ⚠ —el
// mismo aviso que días atrás decía 2— y los pasos de después reescribieron el libro `_MOVIMIENTOS`, CAJA,
// Proveedores y los dos Cash Flow SIN los gastos de Compras: de $409.403.253 censados llegaban $81.000.
// Un aviso que cambia de 2 a 967 sin frenar nada no es un control, es un log.
//
// ═══ QUÉ MIRA ═══
//
// Todas las columnas que el contrato de Compras (`comprobantes/contrato-columnas.mjs`) declara
// `ARRAYFORMULA` —la lista sale de ahí, no se tipea acá— y para cada una:
//
//   · ancla-en-error — el valor del ancla (fila 4) es un error de Sheets (`#REF!`, `#N/A`, `#ERROR!`…).
//   · ancla-ausente  — la fila 4 no tiene una fórmula ARRAYFORMULA: la columna entera está vacía o es
//                      una foto pegada, y todo lo que la lee lee nada.
//   · valor-pegado   — hay contenido tipeado (valor o fórmula) DEBAJO del ancla, dentro del derrame. Aun
//                      cuando Google todavía no lo marcó —p. ej. una celda por debajo del último dato—,
//                      es el mismo bloqueo esperando a que Compras crezca una fila.
//
// Es PURO: recibe las grillas ya leídas. El script `freno-derrames-compras.mjs` lee y decide la salida.

import { contratoContra, NATURALEZA } from './comprobantes/contrato-columnas.mjs'

/** La primera fila de datos de Compras: donde vive cada ancla. */
export const FILA_ANCLA = 4

const ERROR_SHEETS = /^#(REF!|N\/A|VALUE!|DIV\/0!|NAME\?|NUM!|ERROR!|NULL!|SPILL!)|^¿NOMBRE\?/i

const vacia = (c) => c === undefined || c === null || String(c) === ''

/**
 * @param {{encabezado:any[], formulas:any[][], valores:any[][], filaAncla?:number}} o
 *   `formulas` y `valores` arrancan en la fila del ancla (índice 0 = fila 4). `formulas` con render
 *   FORMULA (en el derrame devuelve vacío: sólo el ancla y lo tipeado tienen contenido); `valores` con
 *   FORMATTED_VALUE, que es donde aparece el texto del error.
 * @returns {Array<{rotulo:string, letra:string, problema:'ancla-en-error'|'ancla-ausente'|'valor-pegado', celdas:Array<{celda:string, contenido:string}>}>}
 */
export function diagnosticarDerrames({ encabezado, formulas = [], valores = [], filaAncla = FILA_ANCLA }) {
  const derivadas = contratoContra(encabezado).filter((c) => c.naturaleza === NATURALEZA.ARRAYFORMULA)
  const hallazgos = []
  for (const col of derivadas) {
    const i = indice(col.letra)
    const rotulo = col.ocurrencia ? `${col.rotulo} (${col.ocurrencia}.ª)` : col.rotulo
    const ancla = formulas[0]?.[i]
    const valorAncla = valores[0]?.[i]
    if (!/^=\s*ARRAYFORMULA\s*\(/i.test(String(ancla ?? '').trim())) {
      hallazgos.push({ rotulo, letra: col.letra, problema: 'ancla-ausente',
        celdas: [{ celda: `${col.letra}${filaAncla}`, contenido: String(ancla ?? '') }] })
    } else if (ERROR_SHEETS.test(String(valorAncla ?? '').trim())) {
      hallazgos.push({ rotulo, letra: col.letra, problema: 'ancla-en-error',
        celdas: [{ celda: `${col.letra}${filaAncla}`, contenido: String(valorAncla) }] })
    }
    const pegadas = []
    for (let r = 1; r < formulas.length; r++) {
      const c = formulas[r]?.[i]
      if (!vacia(c)) pegadas.push({ celda: `${col.letra}${filaAncla + r}`, contenido: String(c) })
    }
    if (pegadas.length) hallazgos.push({ rotulo, letra: col.letra, problema: 'valor-pegado', celdas: pegadas })
  }
  return hallazgos
}

/** El texto que ve el dueño: la celda exacta y qué hacer. Una línea por hallazgo. */
export function describirHallazgos(hallazgos = []) {
  const QUE = {
    'ancla-en-error': 'el ancla de la ARRAYFORMULA está en error: la columna entera no calcula',
    'ancla-ausente': 'no hay ARRAYFORMULA en el ancla: la columna entera no calcula',
    'valor-pegado': 'hay contenido tipeado dentro del derrame: bloquea la ARRAYFORMULA (vaciá esa celda)',
  }
  return hallazgos.map((h) => {
    const muestra = h.celdas.slice(0, 5).map((c) => `Compras!${c.celda}=${JSON.stringify(c.contenido.slice(0, 60))}`).join(' · ')
    const mas = h.celdas.length > 5 ? ` · y ${h.celdas.length - 5} más` : ''
    return `✗✗ «${h.rotulo}» (${h.letra}): ${QUE[h.problema]} — ${muestra}${mas}`
  })
}

function indice(letra) {
  return [...String(letra)].reduce((n, ch) => n * 26 + (ch.charCodeAt(0) - 64), 0) - 1
}
