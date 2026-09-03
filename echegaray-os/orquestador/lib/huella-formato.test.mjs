import { test } from 'node:test'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'

const estado = { huellas: [], caida: false, guardadas: [] }
registerHooks({
  load(url, context, next) {
    if (!url.endsWith('/orquestador/lib/db.mjs')) return next(url, context)
    return { format: 'module', shortCircuit: true, source: 'export const query = (...a) => globalThis.__dbFmt(...a)' }
  },
})
globalThis.__dbFmt = async (sql, params) => {
  if (estado.caida) throw new Error('sin base')
  const s = String(sql)
  if (/to_regclass/.test(s)) return { rows: [{ t: 'public.sheet_huella_formato' }] }
  if (/select rango_a1, tipo, huella/.test(s)) return { rows: estado.huellas }
  if (/insert into public\.sheet_huella_formato/.test(s)) { estado.guardadas.push(params); return { rows: [] } }
  return { rows: [] }
}

const { TIPO, claveDeFormato, decidirFormato, huellaDeRango, esFormatoVirgen, filtrarFormato } = await import('./huella-formato.mjs')

const SID = 2
const TAB = 'CAJA'
const id2tab = new Map([[SID, TAB]])
const PINTAR = { repeatCell: { range: { sheetId: SID, startRowIndex: 0, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: 2 }, cell: {}, fields: 'userEnteredFormat.backgroundColor' } }

const negrita = { textFormat: { bold: true } }
const fila = (f) => [{ formato: f }, { formato: f }]
const lecturaCon = (f) => ({ filas: [fila(f), fila(f)], anchos: [], congeladas: { filas: 0, columnas: 0 } })

test('claveDeFormato: reconoce lo que formatea, y no lo que escribe contenido', () => {
  assert.equal(claveDeFormato(PINTAR).tipo, TIPO.CELDA)
  assert.equal(claveDeFormato(PINTAR).rango, 'A1:B2')
  assert.equal(claveDeFormato({ mergeCells: { range: { sheetId: SID, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 3 } } }).tipo, TIPO.MERGE)
  assert.equal(claveDeFormato({ updateDimensionProperties: { range: { sheetId: SID, dimension: 'COLUMNS', startIndex: 1, endIndex: 4 }, fields: 'pixelSize' } }).tipo, TIPO.ANCHO)
  assert.equal(claveDeFormato({ updateSheetProperties: { properties: { sheetId: SID, tabColor: {} }, fields: 'tabColor' } }).tipo, TIPO.PESTANA)
  // Un updateCells CON valor es contenido, y lo decide la propiedad por celda, no ésta.
  assert.equal(claveDeFormato({ updateCells: { range: { sheetId: SID }, fields: 'userEnteredValue' } }), null)
  assert.equal(claveDeFormato({ addChart: {} }), null)
})

test('decidirFormato: las cinco ramas, y cuál falla cerrado', () => {
  assert.equal(decidirFormato({ huellaViva: null }).aplica, false)
  assert.equal(decidirFormato({ huellaViva: 'a', huellaGuardada: 'a' }).aplica, true)
  assert.equal(decidirFormato({ huellaViva: 'b', huellaGuardada: 'a' }).aplica, false)
  assert.equal(decidirFormato({ huellaViva: 'b', huellaGuardada: null, pestanaSinHuellas: true }).aplica, true)
  assert.equal(decidirFormato({ huellaViva: 'b', huellaGuardada: null, pestanaSinHuellas: false, virgen: true }).aplica, true)
  assert.equal(decidirFormato({ huellaViva: 'b', huellaGuardada: null, pestanaSinHuellas: false, virgen: false }).aplica, false)
})

test('huellaDeRango: dos formatos distintos no pueden dar la misma huella', () => {
  const a = huellaDeRango(TIPO.CELDA, lecturaCon(negrita), PINTAR.repeatCell.range)
  const b = huellaDeRango(TIPO.CELDA, lecturaCon({ textFormat: { bold: false } }), PINTAR.repeatCell.range)
  assert.notEqual(a, b)
  assert.equal(huellaDeRango(TIPO.CELDA, null, PINTAR.repeatCell.range), null)
  assert.equal(esFormatoVirgen(TIPO.CELDA, lecturaCon(null), PINTAR.repeatCell.range), true)
  assert.equal(esFormatoVirgen(TIPO.CELDA, lecturaCon(negrita), PINTAR.repeatCell.range), false)
})

function cliente(lectura) {
  return { async readSheetUserFormats() { return lectura } }
}

test('MUTACIÓN: el dueño cambió el diseño de ese rango → el formato NO se re-aplica', async () => {
  estado.caida = false; estado.guardadas = []
  // El OS dejó el rango con negrita y lo selló; hoy tiene otra cosa.
  const sellada = huellaDeRango(TIPO.CELDA, lecturaCon(negrita), PINTAR.repeatCell.range)
  estado.huellas = [{ rango_a1: 'A1:B2', tipo: TIPO.CELDA, huella: sellada }]
  const r = await filtrarFormato(cliente(lecturaCon({ backgroundColor: { red: 1 } })), 'FILE', [PINTAR], id2tab)
  assert.deepEqual(r.requests, [], 'se re-aplicó el formato sobre el diseño que el dueño cambió')
  assert.equal(r.respetadas.length, 1)
  assert.match(r.respetadas[0].causa, /lo cambiaste vos/)
})

test('el formato que dejé sigue igual: se re-aplica y se vuelve a sellar', async () => {
  estado.caida = false; estado.guardadas = []
  const sellada = huellaDeRango(TIPO.CELDA, lecturaCon(negrita), PINTAR.repeatCell.range)
  estado.huellas = [{ rango_a1: 'A1:B2', tipo: TIPO.CELDA, huella: sellada }]
  const r = await filtrarFormato(cliente(lecturaCon(negrita)), 'FILE', [PINTAR], id2tab)
  assert.deepEqual(r.requests, [PINTAR])
  await r.sellar()
  assert.equal(estado.guardadas.length, 1)
  assert.deepEqual(estado.guardadas[0].slice(0, 4), ['FILE', TAB, 'A1:B2', TIPO.CELDA])
})

test('primera pasada sobre una pestaña sin huellas de formato: aplica y siembra', async () => {
  estado.caida = false; estado.huellas = []; estado.guardadas = []
  const r = await filtrarFormato(cliente(lecturaCon({ backgroundColor: { red: 1 } })), 'FILE', [PINTAR], id2tab)
  assert.deepEqual(r.requests, [PINTAR])
})

test('sin base, o sin poder leer el formato vivo: no se re-aplica nada (fail-closed)', async () => {
  estado.caida = true
  const a = await filtrarFormato(cliente(lecturaCon(negrita)), 'FILE', [PINTAR], id2tab)
  assert.deepEqual(a.requests, [])
  estado.caida = false; estado.huellas = [{ rango_a1: 'otro', tipo: TIPO.CELDA, huella: 'x' }]
  const b = await filtrarFormato({ async readSheetUserFormats() { throw new Error('429') } }, 'FILE', [PINTAR], id2tab)
  assert.deepEqual(b.requests, [])
  assert.match(b.respetadas[0].causa, /fail-closed/)
})
