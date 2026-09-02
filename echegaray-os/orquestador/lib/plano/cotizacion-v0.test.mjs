// LA LECTURA DEL PLANO PERSISTE CON SU COTIZACIÓN — «Presupuestos v5 · Lectura del plano».
// El razonamiento estructurado entra en `cotizaciones.razonamiento`; sin lectura, NULL — no `{}`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { persistir } from './cotizacion-v0.mjs'

function fakeQuery(capturas) {
  return async (sql, params) => {
    capturas.push({ sql, params })
    if (/select id from public\.parametro_comercial/.test(sql)) return { rows: [{ id: 'pc-1' }] }
    if (/insert into public\.cotizaciones/.test(sql)) return { rows: [{ id: 'cot-1' }] }
    return { rows: [] }
  }
}

const COT = { cliente: 'ARCOR', obraNombre: 'Ampliación planta', partidas: [] }

test('persistir escribe el razonamiento como JSON junto a la cotización', async () => {
  const capturas = []
  const rz = { superficies: { faltan: [] }, bases: { bases: [], muertos: [] } }
  const { cotizacionId } = await persistir({ query: fakeQuery(capturas) }, COT, { numero: 'COT-T-1', razonamiento: rz })
  assert.equal(cotizacionId, 'cot-1')
  const ins = capturas.find((c) => /insert into public\.cotizaciones/.test(c.sql))
  assert.match(ins.sql, /razonamiento/)
  // El parámetro 6 es el razonamiento serializado (cliente, obra, numero, origen, notas, razonamiento, pc).
  assert.deepEqual(JSON.parse(ins.params[5]), rz)
})

test('sin razonamiento la columna queda NULL, no un objeto vacío', async () => {
  const capturas = []
  await persistir({ query: fakeQuery(capturas) }, COT, { numero: 'COT-T-2' })
  const ins = capturas.find((c) => /insert into public\.cotizaciones/.test(c.sql))
  assert.equal(ins.params[5], null)
})
