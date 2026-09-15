// EL SCRIPT DEL P&L CON UN DOBLE DE GOOGLE: el dry no escribe, el aplicar escribe SÓLO lo planeado y
// relee, y un plan con problemas no escribe nada (15/09/2026).
import test from 'node:test'
import assert from 'node:assert/strict'
import { correrPyl, coordenadas, requestsDelPlan, diferenciasDeRelectura } from './pyl-correr-columna-obra.mjs'

const DASH = '=SUMIFS(CF_GAS!$M:$M;CF_GAS!$C:$C;">="&B$4)+SUMIFS(CF_GAS!$O:$O;CF_GAS!$I:$I;"Civil")'

function doble({ importa = 'A:Y', pisar = null, zOcupada = false } = {}) {
  const hojas = {
    CF_GAS: { sheetId: 10, grilla: [[`=IMPORTRANGE("x";"Compras!${importa}")`, 'Categoría'], ['1', 'B']] },
    '05_Dashboard_P&L': { sheetId: 20, grilla: [['=TODAY()', ''], ['', DASH], ['=CF_COB!J18', '']] },
  }
  const llamadas = []
  return {
    llamadas,
    hojas,
    async getSheetMeta() { return Object.entries(hojas).map(([title, h]) => ({ title, sheetId: h.sheetId, rows: h.grilla.length, cols: 2 })) },
    async readSheetValues(_id, rango) {
      llamadas.push(`leer:${rango}`)
      const col = /!([A-Z]+)1:([A-Z]+)$/.exec(rango)
      if (col) return zOcupada ? [[''], ['a mano']] : []
      return hojas[/^'(.+)'!/.exec(rango)[1].replace(/''/g, "'")].grilla.map((f) => [...f])
    },
    async spreadsheetBatchUpdate(_id, requests) {
      llamadas.push('escribir')
      for (const { updateCells: u } of requests) {
        const h = Object.values(hojas).find((x) => x.sheetId === u.range.sheetId)
        h.grilla[u.range.startRowIndex][u.range.startColumnIndex] = u.rows[0].values[0].userEnteredValue.formulaValue
      }
      if (pisar) pisar(hojas)
      return {}
    },
  }
}

const correr = (g, aplicar) => correrPyl({ google: g, aplicar, log: () => {}, guardar: (n) => n, id: 'pyl' })

test('coordenadas: M12 y AB3', () => {
  assert.deepEqual(coordenadas('M12'), { fila: 11, col: 12 })
  assert.deepEqual(coordenadas('AB3'), { fila: 2, col: 27 })
})

test('el dry lee, planea y NO escribe', async () => {
  const g = doble()
  const r = await correr(g, false)
  assert.equal(r.paso, 'dry')
  assert.equal(r.plan.cambios.length, 2)
  assert.equal(r.plan.citanCob, 1)
  assert.ok(!g.llamadas.includes('escribir'))
})

test('aplicar escribe exactamente las celdas del plan y las relee', async () => {
  const g = doble()
  const r = await correr(g, true)
  assert.equal(r.ok, true, JSON.stringify(r.detalle))
  assert.equal(g.hojas.CF_GAS.grilla[0][0], '=IMPORTRANGE("x";"Compras!A:Z")')
  assert.equal(g.hojas['05_Dashboard_P&L'].grilla[1][1], DASH.replace('$M:$M', '$N:$N').replace('$O:$O', '$P:$P'))
  assert.equal(g.hojas['05_Dashboard_P&L'].grilla[2][0], '=CF_COB!J18', 'CF_COB no se toca')
  const req = requestsDelPlan(r.plan.cambios)
  assert.deepEqual(req.map((x) => [x.updateCells.range.sheetId, x.updateCells.range.startRowIndex, x.updateCells.range.startColumnIndex]), [[10, 0, 0], [20, 1, 1]])
  assert.ok(g.llamadas.lastIndexOf('escribir') < g.llamadas.length - 1, 'relee después de escribir')
})

test('una celda que no quedó como se planeó es un fallo con su nombre', async () => {
  const g = doble({ pisar: (h) => { h['05_Dashboard_P&L'].grilla[1][1] = '=0' } })
  const r = await correr(g, true)
  assert.equal(r.paso, 'relectura')
  assert.match(r.detalle[0], /05_Dashboard_P&L!B2: quedó «=0»/)
})

test('si el import ya dice A:Z no escribe nada: no se corre dos veces', async () => {
  const g = doble({ importa: 'A:Z' })
  const r = await correr(g, true)
  assert.equal(r.paso, 'plan')
  assert.ok(!g.llamadas.includes('escribir'))
})

test('diferenciasDeRelectura: igual da 0; distinta, 1', () => {
  const c = [{ hoja: 'H', celda: 'A1', despues: '=1' }]
  assert.deepEqual(diferenciasDeRelectura(c, [{ hoja: 'H', celda: 'A1', formula: '=1' }]), [])
  assert.equal(diferenciasDeRelectura(c, [{ hoja: 'H', celda: 'A1', formula: '=2' }]).length, 1)
})

test('si la columna donde derrama el import de más tiene algo escrito, NO escribe: daría #REF!', async () => {
  const g = doble({ zOcupada: true })
  const r = await correr(g, true)
  assert.equal(r.paso, 'plan')
  assert.match(r.detalle.join(), /derramar sobre Z .*Z2/)
  assert.ok(!g.llamadas.includes('escribir'))
})
