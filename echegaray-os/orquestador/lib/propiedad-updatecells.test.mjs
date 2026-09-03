import { test } from 'node:test'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'

// El doble de la base va ANTES de cargar nada que importe db.mjs (huella-celda lo importa estático).
const estado = { huellas: [], caida: false }
registerHooks({
  load(url, context, next) {
    if (!url.endsWith('/orquestador/lib/db.mjs')) return next(url, context)
    return { format: 'module', shortCircuit: true, source: 'export const query = (...a) => globalThis.__dbUC(...a)' }
  },
})
globalThis.__dbUC = async (sql) => {
  if (estado.caida) throw new Error('sin base')
  if (/to_regclass/.test(String(sql))) return { rows: [{ t: 'public.sheet_huella_celda' }] }
  if (/select fila, col, forma, huella/.test(String(sql))) return { rows: estado.huellas }
  return { rows: [] }
}

const { formaDe } = await import('./huella-forma.mjs')
const { huellaDe } = await import('./huella-celda.mjs')
const { filtrarUpdateCells, grillaDeUpdateCells, recortarUpdateCells, textoDeValor, tocaValor } = await import('./propiedad-updatecells.mjs')

const SID = 7
const TAB = 'Cheques Emitidos'
const id2tab = new Map([[SID, TAB]])
const sv = (s) => ({ userEnteredValue: { stringValue: s } })
const nv = (n) => ({ userEnteredValue: { numberValue: n } })

function sellar(fila, col, valor) {
  estado.huellas.push({ fila, col, forma: formaDe(valor), huella: huellaDe(valor), valor: String(valor), borrada_en: null, abandonada_en: null })
}

test('textoDeValor: la fórmula gana, y el resto se compara como lo devolvería una lectura FORMULA', () => {
  assert.equal(textoDeValor({ formulaValue: '=SUM(A1:A2)' }), '=SUM(A1:A2)')
  assert.equal(textoDeValor({ stringValue: 'Banco' }), 'Banco')
  assert.equal(textoDeValor({ numberValue: 1234.5 }), 1234.5)
  assert.equal(textoDeValor({ boolValue: true }), 'TRUE')
  assert.equal(textoDeValor(undefined), '')
})

test('tocaValor: un updateCells de puro formato no es una escritura de contenido', () => {
  assert.equal(tocaValor('userEnteredValue,userEnteredFormat'), true)
  assert.equal(tocaValor('userEnteredFormat.backgroundColor'), false)
  assert.equal(tocaValor('*'), true)
  assert.equal(tocaValor(undefined), true)
})

test('grillaDeUpdateCells: acepta `start` y también `range` como ancla', () => {
  const conStart = grillaDeUpdateCells({ updateCells: { start: { sheetId: SID, rowIndex: 4, columnIndex: 2 }, rows: [{ values: [sv('a'), nv(3)] }], fields: '*' } })
  assert.deepEqual([conStart.fila0, conStart.col0, conStart.alto, conStart.ancho], [5, 2, 1, 2])
  assert.deepEqual(conStart.texto, [['a', 3]])
  const conRange = grillaDeUpdateCells({ updateCells: { range: { sheetId: SID, startRowIndex: 0, startColumnIndex: 0 }, rows: [{ values: [sv('x')] }], fields: '*' } })
  assert.deepEqual([conRange.fila0, conRange.col0], [1, 0])
})

test('recortarUpdateCells: los bloques salen con `start`, y ninguno menciona la celda respetada', () => {
  const req = { updateCells: { range: { sheetId: SID, startRowIndex: 9, startColumnIndex: 0, endRowIndex: 12, endColumnIndex: 3 }, rows: [
    { values: [sv('a'), sv('b'), sv('c')] },
    { values: [sv('d'), sv('e'), sv('f')] },
    { values: [sv('g'), sv('h'), sv('i')] },
  ], fields: 'userEnteredValue' } }
  const g = grillaDeUpdateCells(req)
  const escribible = [[true, true, true], [true, false, true], [true, true, true]]
  const rs = recortarUpdateCells(req, g, escribible)
  const mandados = rs.flatMap((r) => r.updateCells.rows.flatMap((f) => f.values.map((v) => v.userEnteredValue.stringValue)))
  assert.equal(mandados.includes('e'), false, '«e» era la celda del dueño y se mandó igual')
  assert.equal(mandados.length, 8)
  assert.ok(rs.every((r) => r.updateCells.start && !r.updateCells.range), 'el recorte usa `start`: escribe lo que manda y no limpia el sobrante')
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════

/** Ventana 3×3 sobre "Cheques Emitidos"!A10, con ocho huellas propias para que el mapa alinee. */
function escenario() {
  estado.huellas = []; estado.caida = false
  const filas = [['Nº', 'Banco', 'Importe'], ['1001', 'Santander', 500000], ['1002', 'Galicia', 750000]]
  filas.forEach((f, i) => f.forEach((v, j) => { if (!(i === 2 && j === 2)) sellar(10 + i, j, v) }))
  const rows = filas.map((f) => ({ values: f.map((v) => (typeof v === 'number' ? nv(v) : sv(String(v)))) }))
  const req = { updateCells: { start: { sheetId: SID, rowIndex: 9, columnIndex: 0 }, rows, fields: 'userEnteredValue' } }
  const vivo = filas.map((f) => [...f])
  return { req, vivo, filas }
}

const cliente = (vivo) => ({ async readSheetValues() { return vivo } })

test('updateCells CRUDO sobre una celda editada por el dueño: el request se RECORTA', async () => {
  const { req, vivo } = escenario()
  vivo[2][1] = 'CREDICOOP (lo cambié yo)' // C11 → la editó él: hay huella mía y el contenido es otro
  const r = await filtrarUpdateCells(cliente(vivo), 'FILE', [req], id2tab)
  const respetada = r.respetadas.find((x) => x.celda === 'B12')
  assert.ok(respetada, `B12 tenía que quedar respetada; quedaron: ${r.respetadas.map((x) => x.celda).join(',')}`)
  assert.equal(respetada.valorDueno, 'CREDICOOP (lo cambié yo)')
  const mandados = r.requests.flatMap((q) => q.updateCells.rows.flatMap((f) => f.values.map((v) => v.userEnteredValue.stringValue ?? v.userEnteredValue.numberValue)))
  assert.equal(mandados.includes('Galicia'), false, 'el updateCells pisó la celda que el dueño editó')
  assert.ok(mandados.includes('Santander'), 'y lo que sí es del OS se sigue escribiendo')
})

test('updateCells sin nada respetado sale TAL CUAL: el camino feliz no cambia', async () => {
  const { req, vivo } = escenario()
  const r = await filtrarUpdateCells(cliente(vivo), 'FILE', [req], id2tab)
  assert.equal(r.respetadas.length, 0)
  assert.equal(r.requests.length, 1)
  assert.equal(r.requests[0], req, 'se devolvió el mismo objeto, sin recortar')
})

test('updateCells de puro FORMATO no pasa por la propiedad de contenido', async () => {
  const req = { updateCells: { start: { sheetId: SID, rowIndex: 0, columnIndex: 0 }, rows: [{ values: [{ userEnteredFormat: { backgroundColor: {} } }] }], fields: 'userEnteredFormat' } }
  let leyo = false
  const r = await filtrarUpdateCells({ async readSheetValues() { leyo = true; return [] } }, 'FILE', [req], id2tab)
  assert.deepEqual(r.requests, [req])
  assert.equal(leyo, false)
})

test('base caída: el updateCells no escribe sobre ninguna celda con contenido (fail-closed)', async () => {
  const { req, vivo } = escenario()
  estado.caida = true
  const r = await filtrarUpdateCells(cliente(vivo), 'FILE', [req], id2tab)
  const mandados = r.requests.flatMap((q) => q.updateCells.rows.flatMap((f) => f.values.map((v) => v.userEnteredValue.stringValue ?? v.userEnteredValue.numberValue)))
  assert.deepEqual(mandados, [], 'sin base no se puede probar nada mío: no se pisa ninguna celda con contenido')
  assert.ok(r.respetadas.length >= 8)
})

test('no se puede releer el destino: el updateCells se descarta entero (fail-closed)', async () => {
  const { req } = escenario()
  const r = await filtrarUpdateCells({ async readSheetValues() { throw new Error('429') } }, 'FILE', [req], id2tab)
  assert.deepEqual(r.requests, [])
  assert.equal(r.descartados.length, 1)
})
