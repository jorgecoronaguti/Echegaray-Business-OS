// LA PREDICCIÓN DEL SELLO PENDIENTE, PURA. Si predice mal, el pendiente no coincide nunca con la hoja y
// la recuperación del hallazgo 3 (auditoría 02/10) no ocurre: la celda queda «del dueño» igual que antes.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { camposDeFormato, aplicarMascara, predecirCeldas } from './huella-formato-prediccion.mjs'
import { hash } from './huella-formato-celda.mjs'
import { normalizarFormatoCelda } from './firma-formato.mjs'

const gr = (f0, f1, c0, c1) => ({ sheetId: 1, startRowIndex: f0, endRowIndex: f1, startColumnIndex: c0, endColumnIndex: c1 })
const huella = (f) => hash(normalizarFormatoCelda(f))

test('camposDeFormato: máscara entera, por puntos y con paréntesis; `*` o sin máscara no se predice', () => {
  assert.deepEqual(camposDeFormato('userEnteredFormat'), [''])
  assert.deepEqual(camposDeFormato('userEnteredFormat.numberFormat,userEnteredFormat.textFormat.bold'), ['numberFormat', 'textFormat.bold'])
  assert.deepEqual(camposDeFormato('userEnteredFormat(backgroundColor,textFormat(bold,italic))'), ['backgroundColor', 'textFormat.bold', 'textFormat.italic'])
  assert.equal(camposDeFormato('*'), null)
  assert.equal(camposDeFormato(undefined), null)
})

test('aplicarMascara: conserva lo que la máscara no nombra y BORRA lo que nombra y el request no trae', () => {
  const actual = { textFormat: { bold: true, italic: true }, backgroundColor: { red: 1 } }
  const fuente = { numberFormat: { type: 'DATE', pattern: 'd/m/yy' }, textFormat: { italic: false } }
  assert.deepEqual(
    aplicarMascara(actual, fuente, ['numberFormat', 'textFormat.bold', 'textFormat.italic']),
    { textFormat: { italic: false }, backgroundColor: { red: 1 }, numberFormat: { type: 'DATE', pattern: 'd/m/yy' } },
  )
})

test('predecirCeldas: capas en orden sobre la lectura previa, color truncado a 8 bits, y sin predicción para `*`', () => {
  const lectura = { filas: [[{ formato: { textFormat: { bold: true } } }, { formato: null }]] }
  const color = { red: 0.52, green: 0.49, blue: 0.1 }
  const capas = [
    { req: { repeatCell: { cell: { userEnteredFormat: { backgroundColor: color } }, fields: 'userEnteredFormat.backgroundColor' } }, gr: gr(0, 1, 0, 2) },
    { req: { repeatCell: { cell: { userEnteredFormat: {} }, fields: '*' } }, gr: gr(0, 1, 1, 2) },
  ]
  const p = predecirCeldas(lectura, capas)
  assert.equal(p.get('A1'), huella({ textFormat: { bold: true }, backgroundColor: { red: 132 / 255, green: 124 / 255, blue: 25 / 255 } }))
  assert.equal(p.get('B1'), null, 'una máscara `*` no se sabe predecir: no hay pendiente')
})
