import { test } from 'node:test'
import assert from 'node:assert/strict'
import { detectarPegados, avisar, VIGILADAS } from './columnas-calculadas.mjs'
import { COBRANZAS_1409, COBRANZAS_CON_OBRA } from '../lib/encabezados-referencia.mjs'
import { COBRANZAS_OS } from '../lib/cobranzas-columnas.mjs'

// ═══ LA MUTACIÓN QUE IMPORTA: ESTE SCRIPT NO PUEDE ESCRIBIR ═══
//
// Hasta el 03/09 devolvía la fórmula a las celdas donde alguien pegó un valor —`updateSheetValues`
// crudo, con la Regla 0 apagada a propósito—. Eso contradice la orden del dueño: sus ediciones mandan
// y las decide él. El cliente falso de estos tests LANZA en cada método de escritura: si alguien
// vuelve a meter una escritura acá, el test se pone rojo con el nombre del método en el stack.
function clienteFalso(filas, encabezado = COBRANZAS_1409) {
  const explota = (m) => () => { throw new Error(`ESTE SCRIPT NO ESCRIBE — alguien llamó ${m}`) }
  const rangos = []
  return {
    rangos,
    async readSheetValues() { return [encabezado] },
    async readSheetGrid(_id, rango) { rangos.push(rango); return { filas } },
    updateSheetValues: explota('updateSheetValues'),
    batchUpdateValues: explota('batchUpdateValues'),
    appendSheetValues: explota('appendSheetValues'),
    spreadsheetBatchUpdate: explota('spreadsheetBatchUpdate'),
    clearValues: explota('clearValues'),
  }
}

/** Una columna de `=IF(...)` con DOS celdas pegadas a mano en el medio. */
const COLUMNA = Array.from({ length: 12 }, (_, i) => ([
  [i === 4 || i === 8 ? { formula: null, valor: String(100 + i) } : { formula: '=IF(C5="";"";ROW()-4)', valor: String(i + 1) }],
])[0])

const UNA = [{ pestana: 'Cobranzas', clave: 'id', desde: 5, hasta: 16, que: 'ID' }]

test('detecta los valores pegados y NO llama a ninguna escritura', async () => {
  const { pegados } = await detectarPegados(clienteFalso(COLUMNA), UNA, () => {})
  assert.equal(pegados.length, 2)
  assert.deepEqual(pegados.map((p) => p.celda), ['A9', 'A13'])
  assert.equal(pegados[0].valor, '104')
  assert.ok(String(pegados[0].formula).startsWith('='))
})

test('el aviso nombra la pestaña, la celda, el valor pegado y la fórmula que iría', () => {
  const lineas = []
  avisar([{ pestana: 'Cobranzas', celda: 'A9', valor: '104', formula: '=IF(C9="";"";ROW()-4)' }], (l) => lineas.push(l))
  assert.equal(lineas.length, 1)
  assert.match(lineas[0], /▲ valor pegado sobre fórmula en Cobranzas!A9: «104» \(la fórmula sería =IF/)
})

test('una columna sin pegados no informa nada', async () => {
  const limpia = Array.from({ length: 12 }, () => [{ formula: '=IF(C5="";"";ROW()-4)', valor: '1' }])
  const { pegados } = await detectarPegados(clienteFalso(limpia), UNA, () => {})
  assert.deepEqual(pegados, [])
})

test('las columnas vigiladas siguen siendo las dos de Cobranzas, pedidas por rótulo', () => {
  assert.deepEqual(VIGILADAS.map((v) => `${v.pestana}!${COBRANZAS_OS[v.clave]}`), ['Cobranzas!ID', 'Cobranzas!Mes cobro (auto)'])
})

test('«Mes cobro (auto)» se mira en R hoy y en S con «Obra» insertada — nunca en «Fecha cobro»', async () => {
  const mes = [VIGILADAS[1]]
  const antes = clienteFalso([], COBRANZAS_1409)
  await detectarPegados(antes, mes, () => {})
  assert.deepEqual(antes.rangos, ['Cobranzas!R5:R400'])
  const despues = clienteFalso([], COBRANZAS_CON_OBRA)
  await detectarPegados(despues, mes, () => {})
  assert.deepEqual(despues.rangos, ['Cobranzas!S5:S400'])
  assert.equal(COBRANZAS_CON_OBRA[18], 'Mes cobro (auto)')
})

test('si el rótulo no está, no mira ninguna columna y lo dice', async () => {
  const log = []
  const g = clienteFalso(COLUMNA, COBRANZAS_1409.map((r) => (r === 'ID' ? 'Id interno' : r)))
  const { pegados } = await detectarPegados(g, UNA, (l) => log.push(l))
  assert.deepEqual(pegados, [])
  assert.deepEqual(g.rangos, [], 'sin rótulo no se lee una columna de respaldo')
  assert.match(log.join('\n'), /no la puedo ubicar.*falta la columna «ID»/)
})
