// La lectura de planos toma el modelo de ORQ_PLANOS_MODELO — con un `pedir` falso: CERO llamadas a la
// API (el 25/09 una prueba vació la cuenta prepaga). `fetch` queda envenenado.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { interpretarLamina, modeloDePlanos } from './lectura.mjs'

let fetchOriginal
before(() => { fetchOriginal = globalThis.fetch; globalThis.fetch = () => { throw new Error('RED PROHIBIDA en este test') } })
after(() => { globalThis.fetch = fetchOriginal })

const cacheVacio = { leer: async () => null, guardar: async () => {} }
const doc = { name: 'E-01.pdf', drive_file_id: 'x', mime_type: 'application/pdf' }

async function modeloPedido(env) {
  const antes = process.env.ORQ_PLANOS_MODELO
  if (env == null) delete process.env.ORQ_PLANOS_MODELO; else process.env.ORQ_PLANOS_MODELO = env
  try {
    let visto
    const pedir = async (p) => { visto = p; return { texto: '{}', modelo: p.modelo ?? 'opus', usd: 0 } }
    await interpretarLamina(doc, Buffer.from('%PDF-1.4 falso'), { pedir, cache: cacheVacio })
    return visto
  } finally {
    if (antes == null) delete process.env.ORQ_PLANOS_MODELO; else process.env.ORQ_PLANOS_MODELO = antes
  }
}

test('sin ORQ_PLANOS_MODELO: modelo null → la capacidad COMPLEX decide (opus), como hasta hoy', async () => {
  const p = await modeloPedido(null)
  assert.equal(p.modelo, null)
  assert.equal(p.capacidad, 'complex')
})

test('con ORQ_PLANOS_MODELO=claude-sonnet-5 la lectura lo pide explícito', async () => {
  assert.equal((await modeloPedido('claude-sonnet-5')).modelo, 'claude-sonnet-5')
})

test('espacios o vacío no cuentan como override', () => {
  assert.equal(modeloDePlanos({ ORQ_PLANOS_MODELO: '   ' }), null)
  assert.equal(modeloDePlanos({}), null)
})
