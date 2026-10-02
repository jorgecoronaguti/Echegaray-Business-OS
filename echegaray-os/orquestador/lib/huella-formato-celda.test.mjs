// LA HUELLA POR CELDA, PROBADA CONTRA UNA HOJA QUE SE FORMATEA DE VERDAD.
//
// Los dobles no devuelven respuestas fijas: la hoja falsa APLICA los `repeatCell` que la guarda deja
// pasar y la base falsa GUARDA lo que se sella. Así cada test recorre corridas completas —decidir,
// aplicar, releer, sellar— y lo que se afirma es el formato que quedó en la hoja, no la respuesta de
// la guarda. El layout imita al de «OBRAS»: un reset de toda la pestaña en un lote y, en otro, capas
// cuyo alto depende de cuántas obras hay.

import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'

const db = { filas: new Map(), caida: false, fallaTipo: null }
registerHooks({
  load(url, context, next) {
    if (!url.endsWith('/orquestador/lib/db.mjs')) return next(url, context)
    return { format: 'module', shortCircuit: true, source: 'export const query = (...a) => globalThis.__dbHuellaCelda(...a)' }
  },
})
globalThis.__dbHuellaCelda = async (sql, p) => {
  if (db.caida) throw new Error('sin base')
  const s = String(sql)
  if (/to_regclass/.test(s)) return { rows: [{ t: 'public.sheet_huella_formato' }] }
  if (/select rango_a1, tipo, huella/.test(s)) {
    return { rows: [...db.filas.values()].filter((x) => x.file === p[0] && x.tab === p[1]) }
  }
  if (/insert into public\.sheet_huella_formato/.test(s)) {
    const filas = Array.isArray(p[3])
      ? p[3].map((r, i) => ({ file: p[0], tab: p[1], rango_a1: r, tipo: p[2], huella: p[4][i] }))
      : [{ file: p[0], tab: p[1], rango_a1: p[2], tipo: p[3], huella: p[4] }]
    if (filas.some((f) => f.tipo === db.fallaTipo)) throw new Error(`upsert ${db.fallaTipo} caído`)
    for (const f of filas) db.filas.set(`${f.file}|${f.tab}|${f.tipo}|${f.rango_a1}`, f)
    return { rows: [] }
  }
  if (/delete from public\.sheet_huella_formato/.test(s)) {
    if (db.fallaBorrar) throw new Error('delete caído')
    const borrar = [...db.filas].filter(([, x]) => x.file === p[0] && x.tab === p[1] && p[2].includes(x.tipo))
    for (const [k] of borrar) db.filas.delete(k)
    return { rows: [], rowCount: borrar.length }
  }
  return { rows: [] }
}

const { filtrarFormato, olvidarCacheFormato, olvidarVirgenes, TIPO } = await import('./huella-formato.mjs')
const { recortarRango, huellaDeCelda, TIPO_CELDA1 } = await import('./huella-formato-celda.mjs')
const { fijarEsperasDeReintento } = await import('./huella-formato-sello.mjs')

const SID = 7
const TAB = 'OBRAS'
const FILE = 'FILE'
const id2tab = new Map([[SID, TAB]])
const FILAS = 30
const COLS = 4

beforeEach(() => {
  db.filas.clear(); db.caida = false; db.fallaTipo = null; db.fallaBorrar = false
  olvidarVirgenes(); olvidarCacheFormato(); fijarEsperasDeReintento([0, 0, 0])
})

// ─── la hoja falsa ───
function hojaNueva() {
  return Array.from({ length: FILAS }, () => Array.from({ length: COLS }, () => ({ formato: null })))
}
// Como Google (medido el 02/10 en el Sheet real): cada canal de color se guarda truncado a 8 bits.
// Escrito aparte del código bajo prueba a propósito: un doble que usa la función que prueba no prueba.
function comoGoogle(x) {
  if (!x || typeof x !== 'object') return x
  return Object.fromEntries(Object.entries(x).map(([k, v]) => [k, ['red', 'green', 'blue'].includes(k) ? Math.floor(v * 255 + 1e-6) / 255 : comoGoogle(v)]))
}
function aplicar(grilla, requests) {
  for (const r of requests) {
    if (!r.repeatCell) continue
    const g = r.repeatCell.range
    const f1 = g.endRowIndex ?? FILAS; const c1 = g.endColumnIndex ?? COLS
    for (let f = g.startRowIndex ?? 0; f < f1; f++) {
      for (let c = g.startColumnIndex ?? 0; c < c1; c++) grilla[f][c].formato = comoGoogle(structuredClone(r.repeatCell.cell.userEnteredFormat))
    }
  }
}
/** `falla(n)` decide si la lectura número n de esta corrida se cae. */
function cliente(grilla, falla = () => false) {
  return {
    lecturas: 0,
    async readSheetUserFormats() {
      this.lecturas++
      if (falla(this.lecturas)) throw new Error('429 de la API')
      return structuredClone({ filas: grilla, anchos: [], congeladas: { filas: 0, columnas: 0 } })
    },
  }
}

// ─── el layout de OBRAS, en miniatura ───
const gr = (f0, f1, c0, c1) => ({ sheetId: SID, startRowIndex: f0, endRowIndex: f1, startColumnIndex: c0, endColumnIndex: c1 })
const pintar = (range, fmt) => ({ repeatCell: { range, cell: { userEnteredFormat: fmt }, fields: 'userEnteredFormat' } })
function estilo(v = 1) {
  const arial = { fontFamily: 'Arial', fontSize: v === 1 ? 10 : 11 }
  return {
    base: { textFormat: arial, backgroundColor: { red: 1, green: 1, blue: 1 } },
    // Una tinta que Google NO guarda tal cual (0.52 → 132/255): el sello pendiente tiene que preverlo.
    fecha: { textFormat: { ...arial, foregroundColor: { red: 0.52, green: 0.49, blue: 0.1 } }, numberFormat: { type: 'DATE', pattern: v === 1 ? 'dd/mm/yyyy' : 'd/m/yy' } },
    total: { textFormat: { ...arial, bold: true }, numberFormat: { type: 'CURRENCY' } },
    nota: { textFormat: { ...arial, italic: true } },
  }
}
/** Dos lotes, como el formateador real: el reset entero primero, las capas que dependen de `n` después. */
function lotes(n, v = 1) {
  const e = estilo(v)
  return [
    [pintar(gr(0, FILAS, 0, COLS), e.base)],
    [pintar(gr(9, 9 + n, 1, 2), e.fecha), pintar(gr(9 + n, 11 + n, 1, 2), e.total), pintar(gr(11 + n, 25, 1, 2), e.nota)],
  ]
}
function esperado(n, v = 1) {
  const g = hojaNueva()
  for (const l of lotes(n, v)) aplicar(g, l)
  return g
}
const posDeA1 = (a1) => {
  const m = /^([A-Z]+)(\d+)$/.exec(a1)
  return m ? { fila: Number(m[2]) - 1, col: [...m[1]].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1 } : null
}
/**
 * Una corrida = un proceso: olvida la «primera pasada» y el caché, decide, aplica y sella cada lote.
 * Y en CADA lote verifica la invariante: ninguna celda informada como respetada cambió.
 */
async function correr(grilla, lotesDeLaCorrida, falla = () => false) {
  olvidarVirgenes(); olvidarCacheFormato()
  const g = cliente(grilla, falla)
  const out = { mandados: 0, aplicados: [], respetadas: [], fallas: [] }
  for (const l of lotesDeLaCorrida) {
    out.mandados += l.length
    const antes = structuredClone(grilla)
    const r = await filtrarFormato(g, FILE, l, id2tab)
    aplicar(grilla, r.requests)
    for (const x of r.respetadas) {
      const p = posDeA1(x.celda)
      if (p) assert.deepEqual(grilla[p.fila][p.col], antes[p.fila][p.col], `${x.celda} figura como respetada pero el lote la cambió`)
    }
    out.aplicados.push(...r.requests)
    out.respetadas.push(...r.respetadas)
    out.fallas.push(...((await r.sellar())?.fallas ?? []))
  }
  return out
}
/** Captura lo que la guarda avisa por `console.warn` mientras corre `fn`. */
async function conAvisos(fn) {
  const avisos = []
  const original = console.warn
  console.warn = (...a) => avisos.push(a.join(' '))
  try { return { valor: await fn(), avisos } } finally { console.warn = original }
}
const sellosCelda = () => [...db.filas.values()].filter((x) => x.tipo === TIPO_CELDA1)

test('el layout crece una fila (9 → 10 obras) con todo sellado por celda: entran TODOS los requests, reset incluido', async () => {
  const hoja = hojaNueva()
  await correr(hoja, lotes(9))
  assert.ok(sellosCelda().length >= FILAS * COLS, 'la primera pasada tiene que sembrar el sello de cada celda')
  const r = await correr(hoja, lotes(10))
  assert.deepEqual(r.respetadas, [], `quedaron retenidos: ${r.respetadas.map((x) => x.celda).join(', ')}`)
  assert.equal(r.aplicados.length, r.mandados, 'algún request no entró entero')
  assert.deepEqual(hoja, esperado(10), 'la pestaña no quedó con el layout de 10 obras')
})

test('el dueño pinta UNA celda: reset y capa se aplican recortados a su alrededor y el resto se reformatea', async () => {
  const hoja = hojaNueva()
  await correr(hoja, lotes(9))
  const suyo = { textFormat: { bold: true }, backgroundColor: { red: 1, green: 1, blue: 0 } }
  hoja[11][1].formato = structuredClone(suyo)                       // B12, dentro del reset y de la capa de fechas
  const esperada = esperado(9, 2); esperada[11][1].formato = suyo
  for (let corrida = 1; corrida <= 2; corrida++) {
    // Cambia el estilo del OS: si el resto de la pestaña no se reformatea, la comparación lo ve.
    const r = await correr(hoja, lotes(9, 2))
    assert.deepEqual(hoja[11][1].formato, suyo, `corrida ${corrida}: se pisó la celda del dueño`)
    assert.deepEqual(hoja, esperada, `corrida ${corrida}: el resto de la pestaña no se reformateó`)
    // Una vez por lote que la toca (el reset y la capa): cada lote informa lo que retuvo.
    assert.deepEqual([...new Set(r.respetadas.map((x) => x.celda))], ['B12'], `corrida ${corrida}: respetadas debería ser sólo B12`)
    assert.ok(r.aplicados.length > r.mandados, 'el reset y la capa tenían que partirse, no descartarse')
  }
})

test('un request recortado NO sella la huella de su rango: la corrida siguiente no lo aplica entero encima del dueño', async () => {
  // Con un solo lote nada cambia el rango entre corridas. Si el rango recortado se sellara, su huella
  // —que incluye la celda del dueño— coincidiría con la viva y el request entraría ENTERO.
  const hoja = hojaNueva()
  const capa = (v) => [[pintar(gr(9, 18, 1, 2), estilo(v).fecha)]]
  await correr(hoja, capa(1))
  const suyo = { textFormat: { bold: true } }
  hoja[11][1].formato = structuredClone(suyo)
  for (let corrida = 1; corrida <= 3; corrida++) {
    await correr(hoja, capa(2))
    assert.deepEqual(hoja[11][1].formato, suyo, `corrida ${corrida}: se pisó la celda del dueño`)
    assert.deepEqual(hoja[10][1].formato, comoGoogle(estilo(2).fecha))
  }
})

// ═══ AUDITORÍA 02/10, HALLAZGO 1: el atajo «el bloque se corrió de fila» decidía antes que la celda ═══
test('el dueño pega en D10:D18 el formato que el OS selló en B10:B18: la capa del OS no lo pisa ni lo sella como propio', async () => {
  const hoja = hojaNueva()
  await correr(hoja, [[pintar(gr(9, 18, 1, 2), estilo().fecha)]])
  for (let f = 9; f < 18; f++) hoja[f][3].formato = structuredClone(hoja[f][1].formato)   // copiar formato y pegar en D
  const suyo = structuredClone(hoja.map((f) => f[3].formato))
  const r = await correr(hoja, [[pintar(gr(9, 18, 3, 4), estilo().total)]])
  assert.deepEqual(hoja.map((f) => f[3].formato), suyo, 'la capa del OS pisó el formato que el dueño pegó en D10:D18')
  assert.deepEqual(r.aplicados, [], 'entró por el atajo del bloque corrido')
  assert.ok(r.respetadas.some((x) => x.celda === 'D10:D18'), 'D10:D18 no se informó como respetada')
  assert.deepEqual(sellosCelda().filter((x) => x.rango_a1.startsWith('D')).map((x) => x.rango_a1), [], 'D quedó sellada como del OS')
})

test('respetadas nunca lista una celda que otra capa del mismo lote pisó', async () => {
  // Pestaña de antes del 01/10: el rango A1:B2 tiene huella de RANGO pero sus celdas no tienen sello.
  // La capa B1:C3 ve B1 y B2 como ajenas y se recorta; el reset A1:B2 entra entero (su huella coincide)
  // y las cambia. Informarlas como respetadas sería mentir: `correr` lo verifica lote por lote.
  const hoja = hojaNueva()
  await correr(hoja, [[pintar(gr(0, 2, 0, 2), estilo(1).base)]])
  for (const [k, x] of [...db.filas]) if (x.tipo !== TIPO.CELDA) db.filas.delete(k)
  const r = await correr(hoja, [[pintar(gr(0, 2, 0, 2), estilo(2).base), pintar(gr(0, 3, 1, 3), estilo(1).nota)]])
  assert.deepEqual(r.respetadas.map((x) => x.celda), [])
  assert.deepEqual(hoja[0][1].formato, comoGoogle(estilo(2).base), 'B1 tenía que quedar con el reset nuevo')
})

test('celda con formato SIN sello por celda (pestaña de antes): se respeta, como hoy', async () => {
  const hoja = hojaNueva()
  const ajeno = { textFormat: { fontFamily: 'Calibri' } }
  hoja[0][0].formato = structuredClone(ajeno); hoja[0][1].formato = structuredClone(ajeno)
  // La pestaña ya tenía huellas de RANGO (no es primera pasada) pero ningún sello por celda.
  db.filas.set('x', { file: FILE, tab: TAB, rango_a1: 'Z1:Z1', tipo: TIPO.CELDA, huella: 'vieja' })
  const entero = await correr(hoja, [[pintar(gr(0, 1, 0, 2), estilo().base)]])
  assert.deepEqual(entero.aplicados, [], 'se aplicó formato sobre celdas que no se puede probar que sean del OS')
  assert.deepEqual(hoja[0][0].formato, ajeno)
  // Con una celda virgen al lado, sólo esa recibe formato; las que tienen formato siguen intactas.
  const parcial = await correr(hoja, [[pintar(gr(0, 1, 0, 3), estilo().base)]])
  assert.deepEqual([hoja[0][0].formato, hoja[0][1].formato], [ajeno, ajeno])
  assert.deepEqual(hoja[0][2].formato, estilo().base)
  assert.deepEqual(parcial.respetadas.map((x) => x.celda), ['A1', 'B1'])
})

test('sin base o sin lectura viva no se aplica nada, aunque los sellos lo permitirían', async () => {
  const hoja = hojaNueva()
  await correr(hoja, lotes(9))
  db.caida = true
  const sinBase = await correr(hoja, lotes(10))
  assert.deepEqual(sinBase.aplicados, [])
  db.caida = false
  olvidarVirgenes(); olvidarCacheFormato()
  const sinLectura = await filtrarFormato({ async readSheetUserFormats() { throw new Error('429') } }, FILE, lotes(10)[1], id2tab)
  assert.deepEqual(sinLectura.requests, [])
  assert.match(sinLectura.respetadas[0].causa, /fail-closed/)
})

test('un updateCells de formato que toca una celda del dueño se retiene ENTERO (sólo repeatCell se parte)', async () => {
  const hoja = hojaNueva()
  await correr(hoja, lotes(9))
  hoja[11][1].formato = { textFormat: { bold: true } }
  const uc = { updateCells: { range: gr(9, 13, 1, 2), rows: [], fields: 'userEnteredFormat' } }
  const rc = pintar(gr(9, 13, 1, 2), estilo(2).fecha)
  olvidarVirgenes(); olvidarCacheFormato()
  const r = await filtrarFormato(cliente(hoja), FILE, [uc, rc], id2tab)
  assert.ok(!r.requests.includes(uc), 'el updateCells pasó sobre la celda del dueño')
  assert.ok(r.respetadas.some((x) => x.celda === 'B10:B13'), 'el updateCells retenido no se informó')
  assert.equal(r.requests.length, 2, 'el repeatCell de al lado tenía que partirse en dos (B10:B11 y B13)')
  assert.ok(r.requests.every((x) => x.repeatCell && !(x.repeatCell.range.startRowIndex <= 11 && x.repeatCell.range.endRowIndex > 11)))
})

test('el sello por celda sale de la relectura POSTERIOR al lote, no de la lectura cacheada de antes', async () => {
  const antes = { textFormat: { fontFamily: 'Arial' } }
  const despues = { textFormat: { fontFamily: 'Arial', bold: true } }
  let n = 0
  const filas = (f) => [[{ formato: f }]]
  const g = { async readSheetUserFormats() { n++; return { filas: filas(n === 1 ? antes : despues), anchos: [], congeladas: {} } } }
  const r = await filtrarFormato(g, FILE, [pintar(gr(0, 1, 0, 1), despues)], id2tab)
  await r.sellar()
  const sello = sellosCelda().find((x) => x.rango_a1 === 'A1')
  assert.ok(sello, 'no se selló A1')
  assert.equal(sello.huella, huellaDeCelda({ filas: filas(despues) }, 0, 0))
  assert.notEqual(sello.huella, huellaDeCelda({ filas: filas(antes) }, 0, 0))
})

test('recortarRango: cubre exactamente el rango menos las celdas excluidas, sin solaparse', () => {
  const cubiertas = (rects, filas, cols) => {
    const vistas = new Map()
    for (const r of rects) {
      for (let f = r.startRowIndex; f < (r.endRowIndex ?? filas); f++) {
        for (let c = r.startColumnIndex; c < (r.endColumnIndex ?? cols); c++) vistas.set(`${f},${c}`, (vistas.get(`${f},${c}`) ?? 0) + 1)
      }
    }
    return vistas
  }
  const fuera = [{ fila: 2, col: 1 }, { fila: 2, col: 3 }, { fila: 5, col: 0 }]
  for (const rango of [gr(1, 7, 0, 5), { sheetId: SID, startRowIndex: 1, startColumnIndex: 0 }]) {
    const rects = recortarRango(rango, fuera)
    const v = cubiertas(rects, 12, 5)
    for (let f = 1; f < 12; f++) {
      for (let c = 0; c < 5; c++) {
        const dentro = rango.endRowIndex === undefined || f < rango.endRowIndex
        const esperado = dentro && !fuera.some((x) => x.fila === f && x.col === c) ? 1 : 0
        assert.equal(v.get(`${f},${c}`) ?? 0, esperado, `celda fila ${f} col ${c}`)
      }
    }
    if (rango.endRowIndex === undefined) assert.ok(rects.some((r) => r.endRowIndex === undefined), 'se perdió el borde sin límite')
  }
})

// ═══ AUDITORÍA 02/10, HALLAZGO 3: el sellado posterior fallaba en silencio y la celda quedaba «del dueño» ═══
const fallasDelSellado = [
  ['se cae la relectura posterior al lote', { falla: (n) => n >= 2 && n <= 4 }, /releer/],
  ['se cae el upsert de los sellos por celda', { fallaTipo: TIPO_CELDA1 }, /sellar \d+ celda/],
]
for (const [caso, { falla = () => false, fallaTipo = null }, motivo] of fallasDelSellado) {
  test(`${caso}: la falla se informa con su motivo y la corrida siguiente se recupera sola`, async () => {
    const hoja = hojaNueva()
    await correr(hoja, lotes(9))
    db.fallaTipo = fallaTipo
    const { valor: rota, avisos } = await conAvisos(() => correr(hoja, lotes(9, 2), falla))
    db.fallaTipo = null
    assert.ok(rota.fallas.some((f) => f.pestana === TAB && motivo.test(f.motivo)), `la falla no volvió en sellar(): ${JSON.stringify(rota.fallas)}`)
    assert.ok(avisos.some((a) => motivo.test(a)), 'la falla no se avisó')
    // El reset que quedó sin sello tampoco puede trabar las capas del lote siguiente de la MISMA corrida.
    assert.deepEqual(rota.respetadas.map((x) => x.celda), [], 'la corrida rota retuvo formato del propio OS')
    // Lo que el OS formateó en la corrida rota no tiene sello, pero sí pendiente: no es «del dueño».
    const r = await correr(hoja, lotes(10, 2))
    assert.deepEqual(r.respetadas.map((x) => x.celda), [], 'lo que formateó el OS quedó tomado como del dueño')
    assert.deepEqual(hoja, esperado(10, 2))
  })
}

test('si no se puede guardar el sello pendiente, las capas de celdas no se aplican (fail-closed)', async () => {
  const hoja = hojaNueva()
  await correr(hoja, lotes(9))
  const antes = structuredClone(hoja)
  db.fallaTipo = 'celda1p'
  const { valor: r } = await conAvisos(() => correr(hoja, lotes(9, 2)))
  assert.deepEqual(r.aplicados, [], 'se aplicó formato sin evidencia escrita de lo que el OS mandó')
  assert.deepEqual(hoja, antes)
  assert.ok(r.respetadas.length && r.respetadas.every((x) => /sello pendiente/.test(x.causa)))
})

// ═══ AUDITORÍA 02/10, HALLAZGO 2: resembrar sólo las celdas tiene que destrabar las celdas, y nada más ═══
test('la marca de resembrado hace primera pasada para las celdas, conserva el ancho y se gasta al aplicar', async () => {
  const hoja = hojaNueva()
  await correr(hoja, lotes(9))
  // Lo que deja `formato-resembrar --aplicar` sin banderas: sin huellas de celdas, con la de ancho y la marca.
  for (const [k, x] of [...db.filas]) if (x.tipo.startsWith('celda')) db.filas.delete(k)
  const ancho = { file: FILE, tab: TAB, rango_a1: 'COLUMNS:0-1', tipo: TIPO.ANCHO, huella: 'h-ancho' }
  db.filas.set('ancho', ancho)
  db.filas.set('marca', { file: FILE, tab: TAB, rango_a1: 'celdas', tipo: 'resembrar', huella: 'marca' })
  const r = await correr(hoja, lotes(10, 2))
  assert.deepEqual(r.respetadas.map((x) => x.celda), [], 'el resembrado no destrabó las celdas')
  assert.deepEqual(hoja, esperado(10, 2))
  assert.ok(![...db.filas.values()].some((x) => x.tipo === 'resembrar'), 'la marca sobrevivió a la primera pasada')
  assert.deepEqual(db.filas.get('ancho'), ancho, 'el resembrado de celdas tocó la huella del ancho')
  // Y no vale para el ancho: un ancho nuevo sobre uno puesto sigue respetándose.
  olvidarVirgenes(); olvidarCacheFormato()
  db.filas.set('marca', { file: FILE, tab: TAB, rango_a1: 'celdas', tipo: 'resembrar', huella: 'marca' })
  const g = { async readSheetUserFormats() { return { filas: hojaNueva(), anchos: [120, 90], congeladas: {} } } }
  const anchoNuevo = { updateDimensionProperties: { range: { sheetId: SID, dimension: 'COLUMNS', startIndex: 1, endIndex: 2 }, properties: { pixelSize: 50 }, fields: 'pixelSize' } }
  const x = await filtrarFormato(g, FILE, [anchoNuevo], id2tab)
  assert.deepEqual(x.requests, [], 'la marca de celdas destrabó un ancho')
})

// ═══ RE-AUDITORÍA 02/10 (H3d): la marca sobrevivía a un sellado caído y la corrida siguiente pisaba ═══
function resembrarConservandoElAncho() {
  for (const [k, x] of [...db.filas]) if (x.tipo.startsWith('celda')) db.filas.delete(k)
  db.filas.set('ancho', { file: FILE, tab: TAB, rango_a1: 'COLUMNS:0-1', tipo: TIPO.ANCHO, huella: 'h-ancho' })
  db.filas.set('marca', { file: FILE, tab: TAB, rango_a1: 'celdas', tipo: 'resembrar', huella: 'marca' })
}
const reset = () => [[pintar(gr(0, FILAS, 0, COLS), estilo().base)]]

test('resembrado + relectura caída: la marca se gastó al aplicar y lo que el dueño toca en el medio se respeta', async () => {
  const hoja = hojaNueva()
  await correr(hoja, reset())
  resembrarConservandoElAncho()
  const { valor: rota } = await conAvisos(() => correr(hoja, reset(), (n) => n >= 2))
  assert.ok(rota.fallas.length, 'el sellado caído no se informó')
  assert.ok(![...db.filas.values()].some((x) => x.tipo === 'resembrar'), 'la marca sobrevivió a la aplicación')
  hoja[4][2].formato = { ...structuredClone(hoja[4][2].formato), textFormat: { fontFamily: 'Arial', fontSize: 10, bold: true } }
  const suyo = structuredClone(hoja[4][2].formato)
  const r = await correr(hoja, reset())
  assert.deepEqual(hoja[4][2].formato, suyo, 'la corrida siguiente volvió a ser primera pasada y pisó C5')
  assert.deepEqual([...new Set(r.respetadas.map((x) => x.celda))], ['C5'])
})

test('si la marca de resembrado no se puede quitar, las capas de celdas no se aplican (fail-closed)', async () => {
  const hoja = hojaNueva()
  await correr(hoja, reset())
  resembrarConservandoElAncho()
  hoja[4][2].formato = { textFormat: { bold: true } }
  const antes = structuredClone(hoja)
  db.fallaBorrar = true
  const { valor: r } = await conAvisos(() => correr(hoja, [[pintar(gr(0, FILAS, 0, COLS), estilo(2).base)]]))
  assert.deepEqual(r.aplicados, [], 'aplicó una primera pasada sin poder gastar la marca')
  assert.deepEqual(hoja, antes)
  assert.ok(r.respetadas.some((x) => /marca de resembrado/.test(x.causa)))
})

// ═══ RE-AUDITORÍA 02/10 (H1c): un sello de RANGO viejo ganaba sobre el veto por celda ═══
test('el dueño repone en B18 un formato viejo del OS: el rango coincide con un sello viejo pero manda la celda', async () => {
  const hoja = hojaNueva()
  const capas = (n, v = 1) => [[pintar(gr(9, 9 + n, 1, 2), estilo(v).fecha), pintar(gr(9 + n, 11 + n, 1, 2), estilo(v).total)]]
  await correr(hoja, capas(9))
  await correr(hoja, capas(8))
  hoja[17][1].formato = structuredClone(hoja[16][1].formato)          // B18 vuelve a fecha, a mano
  const suyo = structuredClone(hoja[17][1].formato)
  const r = await correr(hoja, capas(9, 2))
  assert.deepEqual(hoja[17][1].formato, suyo, 'B18 del dueño pisada por el sello de rango viejo')
  assert.ok(r.respetadas.some((x) => x.celda === 'B18'), 'B18 no se informó')
  assert.deepEqual(hoja[9][1].formato, comoGoogle(estilo(2).fecha), 'el resto del rango tenía que reformatearse')
})

test('una celda sin sello propio dentro de un rango que coincide la prueba el rango (evidencia de antes del 01/10)', async () => {
  const hoja = hojaNueva()
  const capa = (v) => [[pintar(gr(9, 18, 1, 2), estilo(v).fecha)]]
  await correr(hoja, capa(1))
  for (const [k, x] of [...db.filas]) if (x.rango_a1 === 'B12' && x.tipo.startsWith('celda1')) db.filas.delete(k)
  const r = await correr(hoja, capa(2))
  assert.deepEqual(r.respetadas, [], 'el rango intacto no alcanzó para probar la celda sin sello')
  assert.deepEqual(hoja[11][1].formato, comoGoogle(estilo(2).fecha))
})
