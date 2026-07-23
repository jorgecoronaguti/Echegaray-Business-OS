#!/usr/bin/env node
// BORRA LAS NOTAS QUE NO DICEN NADA — las que dejó un defecto del OS, no una persona.
//
// POR QUÉ EXISTE (23/07). El dueño: "está lleno de comentarios 'vacío' en cargas sociales" y "en
// jornales por quincena". Y era literal: la función que pasa la procedencia a la nota tomaba el
// contenido de la columna TAL CUAL, y en las filas que el generador deja vacías ese contenido es el
// centinela interno ` ::VACIO:: `. Cada una de esas filas terminó con un triangulito amarillo que
// al pasar el mouse decía "::VACIO::".
//
// El defecto ya está arreglado en lib/nota-celda.mjs, pero las notas que quedaron escritas NO se van
// solas: una nota vive fuera del valor de la celda, así que reescribir la pestaña no la toca. Hay
// que ir a buscarlas.
//
// NUNCA BORRA UNA NOTA DE UNA PERSONA. Sólo las que coinciden con la basura conocida del OS. Ante la
// duda, no borra: una nota del dueño perdida es mucho más caro que una nota fea que queda.
//
//   node orquestador/scripts/limpiar-notas-basura.mjs [--dry]

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const DRY = process.argv.includes('--dry')

/**
 * NÚCLEO PURO: ¿esta nota es basura del OS?
 *
 * La lista es CERRADA y explícita. No se borra "toda nota corta" ni "toda nota rara": se borra lo
 * que se sabe que escribió mal el OS. Cualquier otra cosa es de una persona hasta que se demuestre
 * lo contrario.
 */
export function esBasura(nota) {
  const t = String(nota ?? '').trim()
  if (!t) return false
  if (t.includes('::VACIO::')) return true      // el centinela del generador
  if (/^—$|^-$|^\.$/.test(t)) return true       // un guion suelto: sobra de un formato de moneda
  // El rótulo de la columna de procedencia convertido en nota: dice el nombre de la columna que se
  // sacó, o sea nada.
  if (/^(de dónde sale|origen( del dato)?|fuente)$/i.test(t)) return true
  return false
}

async function main() {
  const g = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  const hojas = await g.getSheetMeta(ID)
  let total = 0

  for (const h of hojas) {
    // Las notas NO vienen en values: hay que pedirlas por el endpoint de la grilla.
    const j = await g.apiGetSheets(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(ID)}`
      + `?ranges=${encodeURIComponent(`'${h.title}'!A1:Z400`)}&fields=sheets(data(rowData(values(note))))`)
      .catch(() => null)
    const rowData = j?.sheets?.[0]?.data?.[0]?.rowData ?? []
    const aBorrar = []
    rowData.forEach((fila, i) => (fila.values ?? []).forEach((c, jj) => {
      if (esBasura(c?.note)) aBorrar.push({ fila: i, col: jj })
    }))
    if (!aBorrar.length) continue
    total += aBorrar.length
    console.log(`${h.title}: ${aBorrar.length} nota(s) basura`)
    if (DRY) continue
    const reqs = aBorrar.map(({ fila, col }) => ({
      updateCells: {
        range: { sheetId: h.sheetId, startRowIndex: fila, endRowIndex: fila + 1, startColumnIndex: col, endColumnIndex: col + 1 },
        rows: [{ values: [{ note: '' }] }],
        fields: 'note',
      },
    }))
    for (let i = 0; i < reqs.length; i += 500) await g.spreadsheetBatchUpdate(ID, reqs.slice(i, i + 500))
  }
  console.log(total ? `\n✓ ${total} nota(s) borradas${DRY ? ' (--dry: no escribí nada)' : ''}` : '\n✓ no quedan notas basura')
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
}
