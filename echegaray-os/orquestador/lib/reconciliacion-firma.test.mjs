import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  colALetraNum, numALetraCol, a1AFilaCol, filaColA1, inicioDeRango,
  diffGrids, clasificarCeldaPura, planReconciliacion, preguntaDeCelda, reInyectarEntrada,
  reconciliar, CAUSAS, ACCIONES,
} from './reconciliacion-firma.mjs'

// ─────────────────────────────── A1 ↔ fila/col (núcleo puro) ───────────────────────────────

test('columna ↔ letras: A/Z/AA ida y vuelta', () => {
  assert.equal(colALetraNum('A'), 0)
  assert.equal(colALetraNum('Z'), 25)
  assert.equal(colALetraNum('AA'), 26)
  assert.equal(colALetraNum('BZ'), 77)
  assert.equal(numALetraCol(0), 'A')
  assert.equal(numALetraCol(25), 'Z')
  assert.equal(numALetraCol(26), 'AA')
  assert.equal(numALetraCol(77), 'BZ')
})

test('a1AFilaCol / filaColA1: F12 ↔ {fila:11, col:5}', () => {
  assert.deepEqual(a1AFilaCol('F12'), { col: 5, fila: 11 })
  assert.deepEqual(a1AFilaCol('$F$12'), { col: 5, fila: 11 })
  assert.deepEqual(a1AFilaCol('F'), { col: 5, fila: 0 }) // sin fila → fila 0
  assert.equal(a1AFilaCol('12'), null)                    // sin columna → no es A1
  assert.equal(filaColA1(11, 5), 'F12')
  assert.equal(filaColA1(0, 0), 'A1')
})

test('inicioDeRango: toma la esquina superior-izquierda y tolera pestaña y ":"', () => {
  assert.deepEqual(inicioDeRango('Estructura!F1:H20'), { fila: 0, col: 5 })
  assert.deepEqual(inicioDeRango("'Cash Flow'!A5"), { fila: 4, col: 0 })
  assert.deepEqual(inicioDeRango('F1:H20'), { fila: 0, col: 5 })
})

// ─────────────────────────────── DIFF (núcleo puro) ───────────────────────────────

test('diffGrids: sólo las celdas que cambiaron, con su A1 y ambos valores', () => {
  const prev = [['Cabecera', '=B1*2'], ['', '=SUM(A1:A2)']]
  const curr = [['Cabecera', '=B1*3'], ['Dato', '=SUM(A1:A2)']]
  const d = diffGrids(prev, curr)
  assert.equal(d.length, 2)
  const b1 = d.find((x) => x.celda === 'B1')
  const a2 = d.find((x) => x.celda === 'A2')
  assert.deepEqual([b1.previo, b1.actual], ['=B1*2', '=B1*3'])
  assert.deepEqual([a2.previo, a2.actual], ['', 'Dato'])
})

test('diffGrids: espacios de más NO cuentan como cambio (mismo trim)', () => {
  assert.equal(diffGrids([['x', 'y']], [['x ', ' y']]).length, 0)
})

test('diffGrids: grids de distinto tamaño (fila/columna nueva del dueño)', () => {
  const d = diffGrids([['a']], [['a'], ['nueva']])
  assert.equal(d.length, 1)
  assert.equal(d[0].celda, 'A2')
  assert.equal(d[0].actual, 'nueva')
})

// ─────────────────────────────── CLASIFICACIÓN (núcleo puro) ───────────────────────────────

test('clasificar: dato nuevo (vacío → contenido) → ADOPTAR', () => {
  assert.deepEqual(clasificarCeldaPura({ previo: '', actual: '1500' }),
    { causa: CAUSAS.DATO_NUEVO, accion: ACCIONES.ADOPTAR, requiereCerebro: false })
})

test('clasificar: fórmula → fórmula (corrección) → APRENDER', () => {
  assert.deepEqual(clasificarCeldaPura({ previo: '=SUM(A1:A5)', actual: '=SUM(A1:A9)' }),
    { causa: CAUSAS.FORMULA_CORREGIDA, accion: ACCIONES.APRENDER, requiereCerebro: false })
})

test('clasificar: literal → fórmula (el dueño mejoró la celda) → APRENDER', () => {
  assert.equal(clasificarCeldaPura({ previo: '100', actual: '=A1*2' }).accion, ACCIONES.APRENDER)
})

test('clasificar: fórmula pisada con un valor a mano → OVERRIDE → PREGUNTAR', () => {
  assert.deepEqual(clasificarCeldaPura({ previo: '=SUM(A1:A5)', actual: '9999' }),
    { causa: CAUSAS.OVERRIDE, accion: ACCIONES.PREGUNTAR, requiereCerebro: false })
})

test('clasificar: el dueño BORRÓ lo que había → OVERRIDE → PREGUNTAR (no re-agregar en silencio)', () => {
  assert.equal(clasificarCeldaPura({ previo: '=A1', actual: '' }).accion, ACCIONES.PREGUNTAR)
})

test('clasificar: literal → literal es ambiguo → PREGUNTAR + requiereCerebro', () => {
  const r = clasificarCeldaPura({ previo: '100', actual: '200' })
  assert.equal(r.causa, CAUSAS.CONFLICTO)
  assert.equal(r.accion, ACCIONES.PREGUNTAR)
  assert.equal(r.requiereCerebro, true)
})

test('planReconciliacion: agrupa por acción y lista las dudosas', () => {
  const diffs = [
    { celda: 'A2', previo: '', actual: 'x' },        // adoptar
    { celda: 'B1', previo: '=x', actual: '=y' },     // aprender
    { celda: 'C1', previo: '=x', actual: '9' },      // preguntar (override)
    { celda: 'D1', previo: '1', actual: '2' },       // preguntar + dudosa
  ]
  const plan = planReconciliacion(diffs)
  assert.deepEqual(plan.adoptar.map((x) => x.celda), ['A2'])
  assert.deepEqual(plan.aprender.map((x) => x.celda), ['B1'])
  assert.deepEqual(plan.preguntar.map((x) => x.celda).sort(), ['C1', 'D1'])
  assert.deepEqual(plan.dudosas.map((x) => x.celda), ['D1'])
})

test('preguntaDeCelda: puntual por celda, distinta según la causa', () => {
  assert.match(preguntaDeCelda('Estructura', { celda: 'F12', previo: '=A1', actual: '99', causa: CAUSAS.OVERRIDE }), /Estructura!F12/)
  assert.match(preguntaDeCelda('Estructura', { celda: 'F12', previo: '=A1', actual: '', causa: CAUSAS.OVERRIDE }), /Borraste/)
  assert.match(preguntaDeCelda('Caja', { celda: 'B2', previo: '1', actual: '2', causa: CAUSAS.CONFLICTO }), /Caja!B2/)
})

// ─────────────────────────────── RE-INYECCIÓN (núcleo puro) ───────────────────────────────

test('reInyectarEntrada: estampa el valor del dueño en la celda aprendida, sin mutar el original', () => {
  const entrada = { range: 'T!A1:B2', values: [['gen0', 'gen1'], ['gen2', 'gen3']] }
  const out = reInyectarEntrada(entrada, new Map([['B1', 'DEL_DUEÑO']]))
  assert.equal(out.values[0][1], 'DEL_DUEÑO')          // B1 = fila0 col1
  assert.equal(out.values[0][0], 'gen0')                // el resto intacto
  assert.equal(entrada.values[0][1], 'gen1')            // original NO mutado
  assert.notEqual(out, entrada)                          // devolvió un clon
})

test('reInyectarEntrada: la celda aprendida cae dentro de un rango con offset (no empieza en A1)', () => {
  const entrada = { range: 'Estructura!F10:G11', values: [['a', 'b'], ['c', 'd']] }
  // F11 = fila 10, col 5; el rango arranca en F10 (fila9,col5) → offset [1][0]
  const out = reInyectarEntrada(entrada, new Map([['F11', 'X']]))
  assert.equal(out.values[1][0], 'X')
})

test('reInyectarEntrada: una celda aprendida FUERA del rango escrito no toca nada (identidad)', () => {
  const entrada = { range: 'T!A1:B2', values: [['a', 'b'], ['c', 'd']] }
  const out = reInyectarEntrada(entrada, new Map([['Z99', 'X']]))
  assert.equal(out, entrada) // sin cambios → misma referencia
})

// ─────────────────────────────── ORQUESTADOR reconciliar (integración con fakes) ───────────────────────────────

/** Fake de base + Sheet en memoria: cubre las tablas que toca reconciliar, por patrón de SQL. */
function fakeMundo({ gridPrev = null, gridActual = [], lockPor = 'auto' } = {}) {
  const cells = new Map()
  const locks = new Map()
  if (lockPor) locks.set('T', { pestana: 'T', motivo: 'auto', bloqueada_por: lockPor, bloqueada_en: new Date() })
  const query = async (sql, params = []) => {
    if (/create table/i.test(sql)) return { rows: [] }
    if (/select grid from public\.sheet_tab_firma/.test(sql)) {
      return { rows: gridPrev != null ? [{ grid: gridPrev }] : [] }
    }
    if (/insert into public\.sheet_reconciliacion_celda/.test(sql)) {
      const [, tab, celda, valorDueno, valorOs, causa, accion, estado, pregunta] = params
      cells.set(celda, { tab, celda, valor_dueno: valorDueno, valor_os: valorOs, causa, accion, estado, pregunta })
      return { rows: [] }
    }
    if (/from public\.sheet_reconciliacion_celda/.test(sql) && /'activa'/.test(sql)) {
      return { rows: [...cells.values()].filter((c) => c.estado === 'activa').map((c) => ({ celda: c.celda, valor_dueno: c.valor_dueno })) }
    }
    if (/from public\.sheet_reconciliacion_celda/.test(sql) && /'pendiente'/.test(sql)) {
      return { rows: [...cells.values()].filter((c) => c.estado === 'pendiente') }
    }
    if (/select pestana, motivo, bloqueada_por/.test(sql)) return { rows: [...locks.values()] }
    if (/delete from public\.sheet_pestanas_bloqueadas/.test(sql)) { locks.delete(params[1]); return { rows: [] } }
    return { rows: [] }
  }
  const google = { readSheetValues: async () => gridActual }
  const sellado = []
  const sellarFn = async (...a) => { sellado.push(a) }
  return { deps: { query }, google, cells, locks, sellado, sellarFn }
}

test('reconciliar FAIL-CLOSED: sin grid previo no diffea, deja candada y no resella', async () => {
  const m = fakeMundo({ gridPrev: null, gridActual: [['x']] })
  const r = await reconciliar(m.google, m.deps, 'F', 'T', { sellarFn: m.sellarFn })
  assert.equal(r.entendido, false)
  assert.equal(r.resuelto, false)
  assert.equal(m.locks.has('T'), true)     // sigue candada
  assert.equal(m.sellado.length, 0)        // no reselló
})

test('reconciliar ADOPTA + APRENDE: dato nuevo y fórmula corregida → resuelta, sella y descanda', async () => {
  const prev = [['Cabecera', '=B1*2'], ['', '=SUM(A1:A2)']]
  const curr = [['Cabecera', '=B1*3'], ['Dato nuevo', '=SUM(A1:A2)']]
  const m = fakeMundo({ gridPrev: JSON.stringify(prev), gridActual: curr })
  const r = await reconciliar(m.google, m.deps, 'F', 'T', { sellarFn: m.sellarFn })
  assert.equal(r.resuelto, true)
  assert.equal(r.aprendidas.length, 1)     // B1
  assert.equal(r.adoptadas.length, 1)      // A2
  assert.equal(r.preguntas.length, 0)
  // las dos celdas quedaron 'activa' (se re-inyectarán)
  assert.equal([...m.cells.values()].filter((c) => c.estado === 'activa').length, 2)
  assert.equal(m.locks.has('T'), false)    // descandada: vuelve a mantenerse sola
  assert.equal(m.sellado.length, 1)        // reselló el baseline
})

test('reconciliar PREGUNTA: override deliberado → queda candada, pregunta puntual, NO resella', async () => {
  const prev = [['Cabecera', '=SUM(A1:A5)']]
  const curr = [['Cabecera', '9999']]      // pisó la fórmula con un número a mano
  const m = fakeMundo({ gridPrev: JSON.stringify(prev), gridActual: curr })
  const r = await reconciliar(m.google, m.deps, 'F', 'T', { sellarFn: m.sellarFn })
  assert.equal(r.resuelto, false)
  assert.equal(r.preguntas.length, 1)
  assert.match(r.preguntas[0].pregunta, /9999/)
  assert.equal([...m.cells.values()][0].estado, 'pendiente')
  assert.equal(m.locks.has('T'), true)     // sigue candada (fail-closed)
  assert.equal(m.sellado.length, 0)
})

test('reconciliar con CEREBRO: resuelve un conflicto literal→literal ambiguo y lo adopta', async () => {
  const prev = [['100']]
  const curr = [['200']]                   // literal→literal: ambiguo
  const m = fakeMundo({ gridPrev: JSON.stringify(prev), gridActual: curr })
  const clasificadorCerebro = async () => ({ accion: ACCIONES.ADOPTAR, causa: CAUSAS.DATO_NUEVO })
  const r = await reconciliar(m.google, m.deps, 'F', 'T', { sellarFn: m.sellarFn, clasificadorCerebro })
  assert.equal(r.resuelto, true)           // el cerebro lo sacó de 'preguntar'
  assert.equal(r.adoptadas.length, 1)
  assert.equal(m.locks.has('T'), false)
})

test('reconciliar SIN cerebro: el mismo conflicto ambiguo queda como pregunta (lado seguro)', async () => {
  const m = fakeMundo({ gridPrev: JSON.stringify([['100']]), gridActual: [['200']] })
  const r = await reconciliar(m.google, m.deps, 'F', 'T', { sellarFn: m.sellarFn })
  assert.equal(r.resuelto, false)
  assert.equal(r.preguntas.length, 1)
})
