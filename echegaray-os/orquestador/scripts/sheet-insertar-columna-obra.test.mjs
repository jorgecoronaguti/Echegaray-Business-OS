// LA INSERCIÓN DE «OBRA», CON DOBLES DE GOOGLE: aborta, compara y respeta el orden (14/09/2026).
import test from 'node:test'
import assert from 'node:assert/strict'
import { insertarColumnaObra, diferencias, verificarEncabezado, INSERCIONES, ROTULO } from './sheet-insertar-columna-obra.mjs'
import { COMPRAS_2508, COBRANZAS_1409 } from '../lib/encabezados-referencia.mjs'

const [COMPRAS, COBRANZAS] = INSERCIONES

/** Una pestaña mínima: la fila de rótulos en su lugar y dos filas de datos. */
function hojaDe(ins, encabezado) {
  const g = Array.from({ length: ins.filaEncabezado - 1 }, () => ['titulo'])
  g.push([...encabezado])
  g.push(encabezado.map((_, j) => `d1-${j}`))
  g.push(encabezado.map((_, j) => (j % 3 ? j * 10 : '')))
  return g
}

/** Un doble de Google que inserta de verdad sobre la grilla en memoria y anota cada llamada. */
function dobleDeGoogle({ encCompras = COMPRAS_2508, encCobranzas = COBRANZAS_1409, tocar = null } = {}) {
  const hojas = { Compras: hojaDe(COMPRAS, encCompras), Cobranzas: hojaDe(COBRANZAS, encCobranzas) }
  const llamadas = []
  const pestanaDe = (r) => /^'?([^'!]+)'?!/.exec(r)[1]
  return {
    llamadas,
    hojas,
    async getSheetMeta() { llamadas.push('meta'); return [{ title: 'Compras', sheetId: 1 }, { title: 'Cobranzas', sheetId: 2 }] },
    async readSheetValues(_id, rango) {
      const p = pestanaDe(rango)
      const fila = /!A(\d+):BZ\d+$/.exec(rango)
      llamadas.push(fila ? `encabezado:${p}` : `leer:${p}`)
      return fila ? [hojas[p][Number(fila[1]) - 1]] : hojas[p].map((f) => [...f])
    },
    async spreadsheetBatchUpdate(_id, requests) {
      llamadas.push('escribir')
      for (const r of requests) {
        const p = r.insertDimension?.range.sheetId ?? r.updateCells?.range.sheetId
        const hoja = hojas[p === 1 ? 'Compras' : 'Cobranzas']
        if (r.insertDimension) for (const f of hoja) f.splice(r.insertDimension.range.startIndex, 0, '')
        else hoja[r.updateCells.range.startRowIndex][r.updateCells.range.startColumnIndex] = ROTULO
      }
      if (tocar) tocar(hojas)
      return {}
    },
  }
}

const correr = (google, aplicar = true) => {
  const pasos = google.llamadas
  return insertarColumnaObra({
    google, aplicar, log: () => {},
    guardar: (n) => { pasos.push(`guardar:${n}`); return n },
    correrHuellas: async () => { pasos.push('huellas') },
  })
}

test('el encabezado real de hoy pasa el portón; «ORDEN DE  COMPRA» con doble espacio es el mismo rótulo', () => {
  assert.deepEqual(verificarEncabezado(COMPRAS_2508, COMPRAS), [])
  assert.deepEqual(verificarEncabezado(COBRANZAS_1409, COBRANZAS), [])
})

test('ABORTA si el encabezado no coincide — y no llama a ninguna escritura', async () => {
  const ya = [...COMPRAS_2508.slice(0, 11), 'Obra', ...COMPRAS_2508.slice(11)]
  const g = dobleDeGoogle({ encCompras: ya })
  const r = await correr(g)
  assert.equal(r.ok, false)
  assert.equal(r.paso, 'encabezado')
  assert.match(r.detalle.join(' '), /esperaba «Concepto» y dice «Obra»/)
  assert.ok(!g.llamadas.includes('escribir') && !g.llamadas.includes('huellas'))
})

test('el --dry fotografía y no escribe', async () => {
  const g = dobleDeGoogle()
  const r = await correr(g, false)
  assert.equal(r.paso, 'dry')
  assert.ok(!g.llamadas.includes('escribir'))
  assert.ok(g.llamadas.includes('guardar:antes'))
})

test('el orden es encabezado → foto → insertar → releer y comparar → huellas → foto nueva', async () => {
  const g = dobleDeGoogle()
  const r = await correr(g)
  assert.equal(r.ok, true, JSON.stringify(r))
  const hitos = g.llamadas.filter((x) => /^(encabezado|guardar|escribir|huellas)/.test(x))
  assert.deepEqual(hitos, ['encabezado:Compras', 'encabezado:Cobranzas', 'guardar:antes', 'escribir', 'huellas', 'guardar:despues'])
  const iEscribir = g.llamadas.indexOf('escribir')
  assert.ok(g.llamadas.slice(iEscribir).includes('leer:Compras'), 'relee después de escribir')
  assert.equal(g.hojas.Compras[2][11], ROTULO)
  assert.equal(g.hojas.Cobranzas[3][7], ROTULO)
})

test('la comparación detecta UNA celda cambiada y frena antes de las huellas', async () => {
  const g = dobleDeGoogle({ tocar: (hojas) => { hojas.Compras[3][20] = 'pisada' } })
  const r = await correr(g)
  assert.equal(r.ok, false)
  assert.equal(r.paso, 'comparacion')
  assert.equal(r.detalle.length, 1)
  assert.match(r.detalle[0], /Compras!f4:c20/)
  assert.ok(!g.llamadas.includes('huellas'))
})

test('diferencias(): una columna corrida sin cambios da 0; un valor perdido a la derecha, 1', () => {
  const antes = [['a', 'b', 'c'], [1, 2, 3]]
  const ins = { pestana: 'X', indice: 1, filaEncabezado: 1 }
  assert.deepEqual(diferencias(antes, [['a', 'Obra', 'b', 'c'], [1, '', 2, 3]], ins), [])
  assert.equal(diferencias(antes, [['a', 'Obra', 'b', 'c'], [1, '', 2, '']], ins).length, 1)
})

// ═══ EL P&L (15/09/2026) ═══
// El P&L importa Compras como texto y suma por letra: Google no lo ajusta. Se PLANEA antes de insertar
// (un plan con dudas no inserta) y se APLICA después de las huellas.

const conPyl = (google, { aplicar = true, pylOk = true } = {}) => insertarColumnaObra({
  google, aplicar, log: () => {},
  guardar: (n) => { google.llamadas.push(`guardar:${n}`); return n },
  correrHuellas: async () => { google.llamadas.push('huellas') },
  correrPyl: async (o) => { google.llamadas.push(`pyl:${o.aplicar ? 'aplicar' : 'plan'}`); return { ok: pylOk || !o.aplicar ? pylOk : false, paso: pylOk ? 'fin' : 'plan', detalle: pylOk ? [] : ['X!C3: duda'] } },
})

test('con P&L: plan antes de insertar, aplicar después de las huellas', async () => {
  const g = dobleDeGoogle()
  const r = await conPyl(g)
  assert.equal(r.ok, true, JSON.stringify(r))
  const hitos = g.llamadas.filter((x) => /^(guardar|escribir|huellas|pyl)/.test(x))
  assert.deepEqual(hitos, ['guardar:antes', 'pyl:plan', 'escribir', 'huellas', 'pyl:aplicar', 'guardar:despues'])
})

test('un plan del P&L con dudas NO inserta la columna', async () => {
  const g = dobleDeGoogle()
  const r = await conPyl(g, { pylOk: false })
  assert.equal(r.paso, 'pyl-plan')
  assert.ok(!g.llamadas.includes('escribir'))
  assert.equal(g.hojas.Compras[2][11], COMPRAS_2508[11], 'Compras sigue como estaba')
})

test('el dry sólo planea el P&L', async () => {
  const g = dobleDeGoogle()
  const r = await conPyl(g, { aplicar: false })
  assert.equal(r.paso, 'dry')
  assert.ok(g.llamadas.includes('pyl:plan') && !g.llamadas.includes('pyl:aplicar'))
})
