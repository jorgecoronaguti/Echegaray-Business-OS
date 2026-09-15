// Las huellas NO se corren con una relectura que falló: la pestaña que existe y no se leyó aborta todo.
import test from 'node:test'
import assert from 'node:assert/strict'
import { correrHuellas, lectorDeGrilla } from './huellas-correr-columna.mjs'

function google({ falla = null } = {}) {
  const leidas = []
  return {
    leidas,
    async getSheetMeta() { return [{ title: 'Compras' }, { title: 'Cobranzas' }] },
    async readSheetValues(_id, rango) {
      leidas.push(rango)
      if (falla && rango.includes(`'${falla}'`)) throw new Error('503 backend error')
      return [['a', 'b'], ['=SUM(M4:M)']]
    },
  }
}

test('lee sólo las pestañas que existen; la grafía que no está en el archivo no se pide', async () => {
  const g = google()
  const leer = await lectorDeGrilla(g)
  assert.deepEqual(g.leidas.map((r) => r.split('!')[0]), ["'Compras'", "'Cobranzas'"])
  assert.equal(leer('Compras', 2, 0), '=SUM(M4:M)')
  assert.equal(leer('COBRANZAS', 2, 0), null)
})

test('EL DEFECTO: una pestaña que existe y no se pudo leer ABORTA, no deja la huella vieja', async () => {
  await assert.rejects(lectorDeGrilla(google({ falla: 'Cobranzas' })), /503/)
})

test('con la relectura caída no se abre la transacción', async () => {
  let tx = false
  const db = { async query() { return { rows: [{ pestana: 'Compras', fila: 5, col: 14, forma: 'x', huella: 'h', valor: '=SUM(O4:O)' }] } }, async withTx() { tx = true } }
  await assert.rejects(correrHuellas({ db, google: google({ falla: 'Compras' }), aplicar: true, dirRespaldo: '/tmp', log: () => {} }), /503/)
  assert.equal(tx, false)
})
