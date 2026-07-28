import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nombreTab, esProtegible, tabsProtegibles, separarPermitido, sheetIdDeRequestContenido, separarRequests } from './guarda-escritura.mjs'

test('nombreTab: saca la pestaña de un rango A1', () => {
  assert.equal(nombreTab('Compras!A1:B2'), 'Compras')
  assert.equal(nombreTab('Compras!A1'), 'Compras')
  assert.equal(nombreTab("'Cheques Emitidos'!A5:M9"), 'Cheques Emitidos')
  assert.equal(nombreTab("'Tarjeta de Credito'!K10"), 'Tarjeta de Credito')
  assert.equal(nombreTab('CAJA!A5'), 'CAJA')
  // Rango sin pestaña → null (no se puede atribuir a una pestaña).
  assert.equal(nombreTab('A1:B2'), null)
  assert.equal(nombreTab(''), null)
  assert.equal(nombreTab(undefined), null)
})

test('nombreTab: una comilla escapada dentro del nombre', () => {
  assert.equal(nombreTab("'Obra ''X'''!A1"), "Obra 'X'")
})

test('esProtegible: los espejos _RAW no son de contenido', () => {
  assert.equal(esProtegible('Compras'), true)
  assert.equal(esProtegible('Cash Flow Semanal'), true)
  assert.equal(esProtegible('_BANCO_RAW'), false)
  assert.equal(esProtegible('_J_OBREROS'), false)
  assert.equal(esProtegible('_ARCA_RAW'), false)
  assert.equal(esProtegible(null), false)
  assert.equal(esProtegible(''), false)
})

test('tabsProtegibles: pestañas de contenido distintas, excluye espejos', () => {
  const data = [
    { range: 'Compras!A1:B2', values: [] },
    { range: 'Compras!C1', values: [] },
    { range: "'Cheques Emitidos'!A1", values: [] },
    { range: '_BANCO_RAW!A1', values: [] },
    { range: 'A1:B2', values: [] }, // sin pestaña
  ]
  assert.deepEqual(tabsProtegibles(data).sort(), ['Cheques Emitidos', 'Compras'])
})

test('separarPermitido: descarta los rangos de pestañas bloqueadas, deja pasar el resto y los espejos', () => {
  const data = [
    { range: 'Compras!A1', values: [['x']] },
    { range: "'Cheques Emitidos'!A1", values: [['y']] },
    { range: '_BANCO_RAW!A1', values: [['z']] },
  ]
  const { permitido, bloqueado } = separarPermitido(data, new Set(['Compras']))
  assert.deepEqual(permitido.map((d) => d.range), ["'Cheques Emitidos'!A1", '_BANCO_RAW!A1'])
  assert.deepEqual(bloqueado.map((d) => d.range), ['Compras!A1'])
})

test('separarPermitido: sin bloqueadas, pasa todo tal cual', () => {
  const data = [{ range: 'Compras!A1', values: [] }, { range: 'CAJA!A5', values: [] }]
  const { permitido, bloqueado } = separarPermitido(data, new Set())
  assert.equal(permitido.length, 2)
  assert.equal(bloqueado.length, 0)
})

test('sheetIdDeRequestContenido: sólo los requests que escriben VALORES cuentan', () => {
  // updateCells con userEnteredValue → contenido
  assert.equal(sheetIdDeRequestContenido({ updateCells: { range: { sheetId: 7 }, fields: 'userEnteredValue,userEnteredFormat' } }), 7)
  // updateCells sólo formato → NO es contenido (nunca destruye datos del dueño)
  assert.equal(sheetIdDeRequestContenido({ updateCells: { range: { sheetId: 7 }, fields: 'userEnteredFormat.textFormat' } }), null)
  // updateCells que toca la NOTA → SÍ es contenido (RESPETO-NOTAS): una nota es del dueño y no se pisa
  // en pestaña candada/editada. Cubre escritura, borrado (rows:[{values:[{note:''}]}]) y note combinada.
  assert.equal(sheetIdDeRequestContenido({ updateCells: { range: { sheetId: 7 }, fields: 'note' } }), 7)
  assert.equal(sheetIdDeRequestContenido({ updateCells: { range: { sheetId: 7 }, rows: [{ values: [{ note: '' }] }], fields: 'note' } }), 7)
  assert.equal(sheetIdDeRequestContenido({ updateCells: { start: { sheetId: 8 }, fields: 'note' } }), 8)
  assert.equal(sheetIdDeRequestContenido({ updateCells: { range: { sheetId: 7 }, fields: 'userEnteredFormat,note' } }), 7)
  // La palabra "note" no puede colarse por un nombre de campo que la contenga como subcadena.
  assert.equal(sheetIdDeRequestContenido({ updateCells: { range: { sheetId: 7 }, fields: 'footnotes' } }), null)
  // updateCells con start (no range) igual cuenta
  assert.equal(sheetIdDeRequestContenido({ updateCells: { start: { sheetId: 9 }, fields: 'userEnteredValue' } }), 9)
  // copyPaste de fórmula/valor → contenido; de formato → no
  assert.equal(sheetIdDeRequestContenido({ copyPaste: { destination: { sheetId: 3 }, pasteType: 'PASTE_FORMULA' } }), 3)
  assert.equal(sheetIdDeRequestContenido({ copyPaste: { destination: { sheetId: 3 }, pasteType: 'PASTE_FORMAT' } }), null)
  // pasteData / appendCells → contenido
  assert.equal(sheetIdDeRequestContenido({ pasteData: { coordinate: { sheetId: 4 } } }), 4)
  assert.equal(sheetIdDeRequestContenido({ appendCells: { sheetId: 5 } }), 5)
  // formato/estructura puros → null (nunca se bloquean)
  assert.equal(sheetIdDeRequestContenido({ repeatCell: { range: { sheetId: 1 } } }), null)
  assert.equal(sheetIdDeRequestContenido({ mergeCells: { range: { sheetId: 1 } } }), null)
  assert.equal(sheetIdDeRequestContenido({ deleteDimension: { range: { sheetId: 1 } } }), null)
  assert.equal(sheetIdDeRequestContenido({ updateSheetProperties: { properties: { sheetId: 1 } } }), null)
  assert.equal(sheetIdDeRequestContenido(null), null)
})

test('separarRequests: descarta sólo los requests de contenido a sheetIds bloqueados, deja el formato', () => {
  const reqs = [
    { updateCells: { range: { sheetId: 7 }, fields: 'userEnteredValue' } }, // contenido a 7 (bloqueado)
    { repeatCell: { range: { sheetId: 7 } } },                              // formato a 7 → pasa
    { updateCells: { range: { sheetId: 8 }, fields: 'userEnteredValue' } }, // contenido a 8 (libre) → pasa
  ]
  const { permitidos, bloqueados } = separarRequests(reqs, new Set([7]))
  assert.equal(permitidos.length, 2)
  assert.equal(bloqueados.length, 1)
  assert.ok(bloqueados[0].updateCells.range.sheetId === 7)
})

test('RESPETO-NOTAS: borrar/escribir una NOTA sobre una pestaña candada se frena; el formato pasa', () => {
  // Reproduce el hueco cerrado (27/07): sheetId 7 está bajo control del dueño (candada o editada).
  // El limpiador de notas basura manda un updateCells{fields:'note', rows:[{values:[{note:''}]}]} que
  // borraría una nota humana. Antes cruzaba el portón (fields:'note' se clasificaba como no-contenido);
  // ahora es contenido y, sobre una pestaña bloqueada, se descarta. El formato a la misma pestaña pasa.
  const reqs = [
    { updateCells: { range: { sheetId: 7 }, rows: [{ values: [{ note: '' }] }], fields: 'note' } }, // borrado de nota a 7 (bloqueada)
    { updateCells: { range: { sheetId: 7 }, rows: [{ values: [{ note: 'nota del OS' }] }], fields: 'note' } }, // escritura de nota a 7 (bloqueada)
    { repeatCell: { range: { sheetId: 7 }, fields: 'userEnteredFormat.backgroundColor' } }, // formato a 7 → pasa
    { updateCells: { range: { sheetId: 8 }, fields: 'note' } }, // nota a 8 (pestaña libre) → pasa
  ]
  const { permitidos, bloqueados } = separarRequests(reqs, new Set([7]))
  assert.equal(bloqueados.length, 2)
  assert.ok(bloqueados.every((r) => r.updateCells.range.sheetId === 7 && /\bnote\b/.test(r.updateCells.fields)))
  assert.equal(permitidos.length, 2)
  assert.ok(permitidos.some((r) => r.repeatCell))                         // el formato de la pestaña candada pasa
  assert.ok(permitidos.some((r) => r.updateCells?.range.sheetId === 8))   // la nota a la pestaña libre pasa
})
