import { test } from 'node:test'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'

const estado = { huellas: [], caida: false }
registerHooks({
  load(url, context, next) {
    if (!url.endsWith('/orquestador/lib/db.mjs')) return next(url, context)
    return { format: 'module', shortCircuit: true, source: 'export const query = (...a) => globalThis.__dbEst(...a)' }
  },
})
globalThis.__dbEst = async (sql) => {
  if (estado.caida) throw new Error('sin base')
  if (/select fila, col, forma, huella/.test(String(sql))) return { rows: estado.huellas }
  return { rows: [] }
}

const { formaDe } = await import('./huella-forma.mjs')
const { huellaDe } = await import('./huella-celda.mjs')
const { tramosDe, ajenasDelTramo, filtrarEstructura } = await import('./propiedad-estructura.mjs')

const SID = 4
const TAB = 'Impuestos y Financieros'
const id2tab = new Map([[SID, TAB], [9, '_ARCA_RAW']])

/** 10 filas × 2 columnas del OS, en las filas 21..30. */
const FILAS = Array.from({ length: 10 }, (_, i) => [`concepto ${i}`, (i + 1) * 1000])
function sembrar() {
  estado.huellas = []; estado.caida = false
  FILAS.forEach((f, i) => f.forEach((v, j) => estado.huellas.push({
    fila: 21 + i, col: j, forma: formaDe(v), huella: huellaDe(v), valor: String(v), borrada_en: null, abandonada_en: null,
  })))
}
const BORRAR = [{ deleteDimension: { range: { sheetId: SID, dimension: 'ROWS', startIndex: 20, endIndex: 30 } } }]
const cliente = (filas) => ({ async readSheetValues() { return filas.map((f) => [...f]) } })

test('tramosDe: filas, columnas, un rango y un movimiento', () => {
  const filas = tramosDe({ deleteDimension: { range: { sheetId: SID, dimension: 'ROWS', startIndex: 20, endIndex: 30 } } })
  assert.equal(filas.rangos[0].a1(TAB), "'Impuestos y Financieros'!21:30")
  assert.equal(filas.rangos[0].fila0, 21)
  const cols = tramosDe({ deleteDimension: { range: { sheetId: SID, dimension: 'COLUMNS', startIndex: 2, endIndex: 5 } } })
  assert.equal(cols.rangos[0].a1('CAJA'), 'CAJA!C:E')
  assert.equal(cols.rangos[0].col0, 2)
  const rango = tramosDe({ deleteRange: { range: { sheetId: SID, startRowIndex: 4, endRowIndex: 7, startColumnIndex: 1, endColumnIndex: 3 }, shiftDimension: 'ROWS' } })
  assert.equal(rango.rangos[0].a1('CAJA'), 'CAJA!B5:C7')
  // Un movimiento se juzga sobre TODO el tramo entre el origen y el destino: mover un bloque mío
  // sobre filas del dueño le corre el trabajo igual que borrárselo.
  const mov = tramosDe({ moveDimension: { source: { sheetId: SID, dimension: 'ROWS', startIndex: 5, endIndex: 8 }, destinationIndex: 20 } })
  assert.equal(mov.rangos[0].a1('CAJA'), 'CAJA!6:23')
  // Lo que no es estructura no es asunto de este módulo.
  assert.equal(tramosDe({ repeatCell: { range: { sheetId: SID } } }), null)
  assert.equal(tramosDe({ insertDimension: { range: { sheetId: SID, dimension: 'ROWS', startIndex: 3, endIndex: 5 } } }), null)
})

test('ajenasDelTramo: mías por huella → ninguna ajena; una celda cambiada → ajena', () => {
  sembrar()
  const huellas = new Map(estado.huellas.map((h) => [`${h.fila}:${h.col}`, { forma: h.forma, huella: h.huella, valor: h.valor }]))
  const limpio = ajenasDelTramo(FILAS, huellas, { fila0: 21, col0: 0 })
  assert.deepEqual(limpio.ajenas, [])
  const conLoSuyo = FILAS.map((f) => [...f])
  conLoSuyo[3][1] = 'NO TOCAR — lo puse yo'
  const sucio = ajenasDelTramo(conLoSuyo, huellas, { fila0: 21, col0: 0 })
  assert.equal(sucio.ajenas.length, 1)
  assert.equal(sucio.ajenas[0].celda, 'B24')
})

test('deleteDimension sobre un tramo TODO mío: pasa', async () => {
  sembrar()
  const r = await filtrarEstructura(cliente(FILAS), 'FILE', BORRAR, id2tab)
  assert.equal(r.requests.length, 1)
  assert.deepEqual(r.frenados, [])
})

test('MUTACIÓN: una sola celda tuya en el tramo y el borrado entero se frena', async () => {
  sembrar()
  const filas = FILAS.map((f) => [...f])
  filas[3][1] = 'NO TOCAR — lo puse yo'
  const r = await filtrarEstructura(cliente(filas), 'FILE', BORRAR, id2tab)
  assert.deepEqual(r.requests, [], 'se borraron diez filas con una celda del dueño adentro')
  assert.equal(r.frenados.length, 1)
  assert.match(r.frenados[0].motivo, /B24/)
  assert.equal(r.respetadas[0].celda, 'B24')
})

test('sin huellas no se puede afirmar nada: el borrado se frena (fail-closed)', async () => {
  estado.huellas = []; estado.caida = false
  const r = await filtrarEstructura(cliente(FILAS), 'FILE', BORRAR, id2tab)
  assert.deepEqual(r.requests, [])
})

test('base caída: el borrado se frena', async () => {
  sembrar(); estado.caida = true
  const r = await filtrarEstructura(cliente(FILAS), 'FILE', BORRAR, id2tab)
  assert.deepEqual(r.requests, [])
  assert.match(r.frenados[0].motivo, /sin base/)
})

test('no se puede releer el tramo: el borrado se frena', async () => {
  sembrar()
  const r = await filtrarEstructura({ async readSheetValues() { throw new Error('429') } }, 'FILE', BORRAR, id2tab)
  assert.deepEqual(r.requests, [])
})

test('un tramo VACÍO se borra sin preguntar, y un espejo _RAW ni se mira', async () => {
  sembrar()
  const vacio = await filtrarEstructura(cliente([]), 'FILE', BORRAR, id2tab)
  assert.equal(vacio.requests.length, 1)
  const espejo = [{ deleteDimension: { range: { sheetId: 9, dimension: 'ROWS', startIndex: 0, endIndex: 500 } } }]
  const r = await filtrarEstructura({ async readSheetValues() { throw new Error('no debería leer un espejo') } }, 'FILE', espejo, id2tab)
  assert.deepEqual(r.requests, espejo)
})
