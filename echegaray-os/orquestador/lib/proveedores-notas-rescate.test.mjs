// El rescate de «Qué hacer» antes de que el pipeline toque la columna: guarda lo escrito a mano, frena
// cuando no puede, y deja visible lo retenido. Con dobles de Google y de la base.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { antesDeEscribirLaColumna, rescatarNotas } from './proveedores-notas-rescate.mjs'

const F = (n) => `=IF($A${n}="";"";IFERROR(VLOOKUP($A${n};_PROVEEDORES_OS!$A:$C;3;FALSE);""))`

function google(proveedores, dDe = () => null) {
  const hoja = (render) => {
    const filas = Array.from({ length: 24 }, () => [])
    filas[13] = ['1 · QUÉ SE DEBE Y CUÁNDO']; filas[15] = ['control']
    filas[16] = ['Proveedor', 'Se le debe', 'Primer vencimiento', 'Qué hacer']
    for (let n = 18; n <= 22; n++) {
      const p = proveedores[n - 18] ?? ''
      const f = dDe(p, n) ?? F(n)
      filas[n - 1] = [p, p ? '1' : '', '', render === 'FORMULA' ? f : (f.startsWith('=') ? '' : f)]
    }
    filas[22] = ['1.1 · CADA OPERACIÓN']; filas[23] = ['2 · QUÉ SALE CADA DÍA']
    return filas
  }
  return { readSheetValues: async (_id, _r, { render }) => hoja(render) }
}

function base(notas = [], { falla = false, cola = true } = {}) {
  const sentencias = []
  return {
    sentencias,
    query: async (sql, params) => {
      sentencias.push({ sql, params })
      if (falla && /insert into public\.proveedor_notas/.test(sql)) throw new Error('conexión caída')
      if (sql.includes('select proveedor, clave, nota, escrita_en')) return { rows: notas.map(([clave, nota]) => ({ proveedor: clave, clave, nota, escrita_en: null })) }
      if (sql.includes('to_regclass')) return { rows: [{ hay: cola }] }
      if (sql.includes('insert into public.proveedor_nota_cambio')) return { rows: [{ id: 'c1' }] }
      return { rows: [] }
    },
  }
}
const anteriorConFormulas = (proveedores) => new Map(proveedores.map((p, i) => [18 + i, { clave: p.toLowerCase(), tipo: 'formula', texto: '' }]))

test('el texto a mano se guarda en la base ANTES de que el pipeline escriba', async () => {
  const db = base()
  await antesDeEscribirLaColumna({ google: google(['Hormiserv', 'Robles'], (p) => (p === 'Robles' ? 'cheque a 30' : null)), fileId: 'x', query: db.query, anterior: null })
  const g = db.sentencias.find((s) => s.sql.includes('insert into public.proveedor_notas'))
  assert.deepEqual(g.params.slice(1), ['Robles', 'robles', 'cheque a 30'])
})

test('si no puede guardar, FRENA: el pipeline no llega a escribir', async () => {
  const db = base([], { falla: true })
  await assert.rejects(antesDeEscribirLaColumna({ google: google(['Robles'], (p) => (p ? 'cheque a 30' : null)), fileId: 'x', query: db.query, anterior: null }), /conexión caída/)
})

test('más de dos borrados a la vez: frena y deja constancia visible (origen sheet)', async () => {
  const provs = ['A1', 'B2', 'C3']
  const db = base([['a1', 'x'], ['b2', 'y'], ['c3', 'z']])
  await assert.rejects(
    antesDeEscribirLaColumna({ google: google(provs, (p) => (p ? '' : null)), fileId: 'x', query: db.query, anterior: anteriorConFormulas(provs) }),
    /3 notas borradas a la vez/)
  const constancias = db.sentencias.filter((s) => s.sql.includes('insert into public.proveedor_nota_cambio'))
  assert.equal(constancias.length, 3)
  assert.match(constancias[0].sql, /'rechazado', \$4, 'sheet'/)
  assert.equal(db.sentencias.some((s) => s.sql.includes('delete from public.proveedor_notas')), false, 'no borra ninguna')
})

test('bloque sin fórmulas y con textos a mano: frena (no se sabe de quién son)', async () => {
  const db = base()
  await assert.rejects(antesDeEscribirLaColumna({ google: google(['Hormiserv'], (p) => (p ? 'algo' : '')), fileId: 'x', query: db.query, anterior: null }), /no sé de quién son/)
})

test('la sonda en seco no escribe la base', async () => {
  const db = base()
  const r = await rescatarNotas({ google: google(['Robles'], (p) => (p === 'Robles' ? 'cheque' : null)), fileId: 'x', query: db.query, anterior: null, escribir: false })
  assert.equal(r.guardar.length, 1)
  assert.equal(db.sentencias.some((s) => /insert|delete/.test(s.sql)), false)
})

test('los dos escritores del pipeline rescatan ANTES de su primera escritura', () => {
  for (const script of ['proveedores-dos-cuadros.mjs', 'proveedores-notas-visibles.mjs']) {
    const fuente = readFileSync(new URL(`../scripts/${script}`, import.meta.url), 'utf8')
    const main = fuente.slice(fuente.indexOf('async function main('))
    const rescate = main.indexOf('await antesDeEscribirLaColumna(')
    const escritura = main.search(/\.(spreadsheetBatchUpdate|batchUpdateValues|updateValues)\(/)
    assert.ok(rescate > 0, `${script} no rescata «Qué hacer»`)
    assert.ok(escritura < 0 || rescate < escritura, `${script} escribe antes de rescatar`)
  }
})
