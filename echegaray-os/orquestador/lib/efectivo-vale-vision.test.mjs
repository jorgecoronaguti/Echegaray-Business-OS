// La foto del vale de entrega (22/09/2026). Lo que se prueba es que NO invente: un dato dudoso es null,
// y una factura no es un vale.
import test from 'node:test'
import assert from 'node:assert/strict'
import { leerVale, normalizarVale, PROMPT_VALE } from './efectivo-vale-vision.mjs'

const respuesta = (obj) => ({
  ok: true,
  async json() { return { content: [{ type: 'text', text: JSON.stringify(obj) }], usage: {}, model: 'x' } },
})

test('el prompt le prohíbe inventar y le pide distinguir un vale de una factura', () => {
  assert.match(PROMPT_VALE, /NUNCA inventes/)
  assert.match(PROMPT_VALE, /factura/)
})

test('lee el vale y normaliza el importe escrito a la argentina', async () => {
  const r = await leerVale({ data: 'x', mediaType: 'image/jpeg' }, {
    apiKey: 'k', fetchImpl: async () => respuesta({ es_vale: true, monto: '1.250.000,50', persona: 'Rubén Sosa', para_que: 'galpón 8', fecha: '2026-09-22', firmado: true }),
  })
  assert.deepEqual(r.vale, {
    esVale: true, monto: 1250000.5, persona: 'Rubén Sosa', paraQue: 'galpón 8', fecha: '2026-09-22', firmado: true, nota: null,
  })
})

test('una factura NO es un vale, y se dice', async () => {
  const r = await leerVale({ data: 'x', mediaType: 'image/jpeg' }, {
    apiKey: 'k', fetchImpl: async () => respuesta({ es_vale: false, monto: 32000, persona: null }),
  })
  assert.equal(r.vale.esVale, false)
})

test('lo dudoso queda en null: no se completa ni se redondea', () => {
  const v = normalizarVale({ es_vale: true, monto: 'ilegible', persona: '   ', fecha: '22/09/2026', firmado: 'si' })
  assert.deepEqual(v, { esVale: true, monto: null, persona: null, paraQue: null, fecha: null, firmado: false, nota: null })
  assert.equal(normalizarVale({ monto: -500 }).monto, null, 'un negativo no es una entrega')
})

test('si la API falla, se devuelve el error y NO un vale vacío', async () => {
  const r = await leerVale({ data: 'x', mediaType: 'image/jpeg' }, {
    apiKey: 'k', fetchImpl: async () => ({ ok: false, status: 500, async text() { return 'boom' } }),
  })
  assert.equal(r.ok, false)
  assert.match(r.error, /500/)
})

test('un archivo que no se puede mirar se rechaza antes de gastar una llamada', async () => {
  let llamo = false
  const r = await leerVale({ data: 'x', mediaType: 'application/zip' }, { apiKey: 'k', fetchImpl: async () => { llamo = true; return respuesta({}) } })
  assert.equal(r.ok, false)
  assert.equal(llamo, false)
})
