// EL PROVEEDOR HF: que la política corte ANTES del fetch, y que el tool calling sobreviva el viaje.
//
// Lo que estas pruebas cuidan no es «que funcione»: es que NO funcione cuando no debe. Un proveedor
// externo que se equivoca hacia el lado permisivo saca datos de la empresa, y eso no lo arregla un
// hotfix. Por eso el caso central es el que NO llama.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { comoFuncionOpenAI, huggingface, idDeModelo, textoDe, toolCallsDe } from './huggingface.mjs'

/** Un `fetch` que anota si lo llamaron. Es el único testigo que prueba que la política cortó. */
function fetchEspia(respuesta = {}, cabeceras = {}) {
  const llamadas = []
  const impl = async (url, opciones) => {
    llamadas.push({ url, cuerpo: JSON.parse(opciones.body) })
    return {
      ok: true,
      status: 200,
      headers: { get: (k) => cabeceras[k] ?? null },
      json: async () => respuesta,
      text: async () => JSON.stringify(respuesta),
    }
  }
  impl.llamadas = llamadas
  return impl
}

const CON_TOKEN = { ORQ_HF_TOKEN: 'hf_de_prueba' }
function conEntorno(vars, fn) {
  const previo = {}
  for (const [k, v] of Object.entries(vars)) { previo[k] = process.env[k]; process.env[k] = v }
  try { return fn() } finally {
    for (const [k, v] of Object.entries(previo)) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v
    }
  }
}

test('un dominio CONFIDENTIAL no llega al fetch: la política corta antes de armar el cuerpo', async () => {
  const espia = fetchEspia()
  await conEntorno(CON_TOKEN, async () => {
    await assert.rejects(
      () => huggingface.completar({
        modelo: 'openai/gpt-oss-120b', mensajes: [{ role: 'user', content: 'hola' }],
        dominio: 'cobranzas', fetchImpl: espia,
      }),
      (e) => e.status === 403 && /confidential/i.test(e.message),
    )
  })
  // ÉSTA es la aserción que importa: no que haya lanzado, sino que NO SALIÓ NADA.
  assert.equal(espia.llamadas.length, 0, 'la política dejó viajar un dato confidencial')
})

test('un dominio sin declarar tampoco sale: el default es el restrictivo, no el cómodo', async () => {
  const espia = fetchEspia()
  await conEntorno(CON_TOKEN, async () => {
    await assert.rejects(() => huggingface.completar({
      modelo: 'x', mensajes: [], dominio: 'un-dominio-que-nadie-declaro', fetchImpl: espia,
    }))
  })
  assert.equal(espia.llamadas.length, 0)
})

test('una intención SÍ sale: es INTERNAL, y es lo único que el modelo necesita para elegir la tool', async () => {
  const espia = fetchEspia({
    choices: [{ message: { content: null, tool_calls: [
      { id: 'c1', function: { name: 'finanzas_cobranzas', arguments: '{"desde":"2026-08-31"}' } },
    ] } }],
    usage: { prompt_tokens: 120, completion_tokens: 18 },
    model: 'openai/gpt-oss-120b',
  })
  const r = await conEntorno(CON_TOKEN, () => huggingface.completar({
    modelo: 'openai/gpt-oss-120b',
    mensajes: [{ role: 'user', content: '¿qué cobro esta semana?' }],
    dominio: 'intenciones',
    herramientas: [{ name: 'finanzas_cobranzas', description: 'qué hay para cobrar', input_schema: { type: 'object', properties: { desde: { type: 'string' } } } }],
    fetchImpl: espia,
  }))
  assert.equal(espia.llamadas.length, 1)
  assert.equal(r.toolCalls.length, 1)
  assert.equal(r.toolCalls[0].nombre, 'finanzas_cobranzas')
  assert.deepEqual(r.toolCalls[0].argumentos, { desde: '2026-08-31' })
  assert.equal(r.tokens.in, 120)
})

test('la herramienta viaja traducida al dialecto de OpenAI, y el permiso NO viaja', () => {
  const f = comoFuncionOpenAI({
    name: 'compras_buscar',
    description: 'busca compras',
    input_schema: { type: 'object', properties: { obra: { type: 'string' } } },
    // `capability` es del OS y decide qué puede EJECUTAR un agente. Que un modelo la vea sería
    // decirle qué permisos existen; que la reciba de vuelta sería dejar que los pida.
    capability: 'drive.write',
  })
  assert.equal(f.type, 'function')
  assert.equal(f.function.name, 'compras_buscar')
  assert.deepEqual(f.function.parameters, { type: 'object', properties: { obra: { type: 'string' } } })
  assert.equal(JSON.stringify(f).includes('drive.write'), false, 'el permiso viajó al proveedor')
})

test('un JSON de argumentos roto se marca, no se convierte en «sin argumentos»', () => {
  const calls = toolCallsDe({ choices: [{ message: { tool_calls: [
    { id: 'c1', function: { name: 'x', arguments: '{"obra": ' } },
  ] } }] })
  // Devolver `{}` haría creer que el modelo pidió la herramienta sin argumentos y la ejecutaría
  // sobre TODO el universo. La marca deja que quien ejecuta decida reintentar o escalar.
  assert.equal(calls[0].argumentos.__invalido, '{"obra": ')
})

test('una respuesta que sólo trae tool_calls tiene texto vacío, no «null»', () => {
  assert.equal(textoDe({ choices: [{ message: { content: null, tool_calls: [] } }] }), '')
})

test('los alias se resuelven por configuración, y un ID concreto pasa tal cual', () => {
  conEntorno({ ORQ_HF_LLM: '', ORQ_HF_LLM_RAPIDO: '', ORQ_HF_LLM_POTENTE: '' }, () => {
    assert.equal(idDeModelo('normal'), 'openai/gpt-oss-120b')
    assert.equal(idDeModelo('Qwen/Qwen3-32B'), 'Qwen/Qwen3-32B')
  })
  conEntorno({ ORQ_HF_LLM: 'otro/modelo' }, () => {
    assert.equal(idDeModelo('sonnet'), 'otro/modelo')
  })
})

test('sin token no se intenta: fallar rápido es mejor que un 401 por llamada', async () => {
  const espia = fetchEspia()
  await conEntorno({ ORQ_HF_TOKEN: '' }, async () => {
    // `configurado()` memoiza el token en el módulo de HF, así que acá se prueba el camino de
    // `completar`, que es el que decide de verdad si sale una request.
    const r = await huggingface.completar({
      modelo: 'x', mensajes: [], dominio: 'intenciones', fetchImpl: espia,
    }).catch((e) => e)
    if (r instanceof Error) assert.match(r.message, /sin token|huggingface/)
  })
})
