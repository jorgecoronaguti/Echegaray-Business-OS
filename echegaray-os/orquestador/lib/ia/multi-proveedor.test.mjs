// EL FALLBACK ENTRE PROVEEDORES, EJERCITADO DE VERDAD.
//
// Hasta ahora la lista de proveedores tenía UNO solo: el bucle de fallback existía y nunca daba una
// segunda vuelta, así que un error en esa vuelta no lo hubiera detectado nadie. Estos tests corren
// el bucle entero con un `fetch` inyectado — cero tokens, cero red.
process.env.ORQ_IA_SIN_REGISTRO = '1' // un control no ensucia la contabilidad que otros leen
process.env.ORQ_IA_ESPERA_MS = '1'    // no se esperan segundos reales entre reintentos

import test from 'node:test'
import assert from 'node:assert/strict'

import { pedirTexto } from './cliente.mjs'
import { openaiCompatible, idDeModelo, textoDe } from './proveedores/openai-compatible.mjs'

const ALT = 'https://modelo-alternativo.invalido/v1'

function conAlt(fn) {
  const antes = { ...process.env }
  process.env.ORQ_IA_ALT_BASE_URL = ALT
  process.env.ORQ_IA_ALT_API_KEY = 'clave-de-prueba'
  process.env.ORQ_IA_ALT_MODELO = 'modelo-alt-1'
  return fn().finally(() => {
    for (const k of ['ORQ_IA_ALT_BASE_URL', 'ORQ_IA_ALT_API_KEY', 'ORQ_IA_ALT_MODELO']) {
      if (antes[k] === undefined) delete process.env[k]
      else process.env[k] = antes[k]
    }
  })
}

/** Un `fetch` que falla en Anthropic con el status pedido y contesta bien en el alternativo. */
function fetchDoble(statusAnthropic, llamadas = []) {
  return async (url) => {
    llamadas.push(String(url))
    if (String(url).includes('anthropic')) {
      return { ok: false, status: statusAnthropic, text: async () => 'caído' }
    }
    return {
      ok: true,
      json: async () => ({ model: 'modelo-alt-1', choices: [{ message: { content: 'contestó el alternativo' } }], usage: { prompt_tokens: 7, completion_tokens: 3 } }),
    }
  }
}

test('SIN CREDENCIALES DEL SEGUNDO PROVEEDOR NO EXISTE: el comportamiento es el de siempre', () => {
  delete process.env.ORQ_IA_ALT_BASE_URL
  delete process.env.ORQ_IA_ALT_API_KEY
  assert.equal(openaiCompatible.configurado(), false)
})

test('(E) el primario agota sus reintentos y contesta el FALLBACK, que queda anotado', async () => {
  await conAlt(async () => {
    const llamadas = []
    const r = await pedirTexto({
      mensajes: [{ role: 'user', content: 'hola' }],
      apiKey: 'clave-anthropic',
      fetchImpl: fetchDoble(529, llamadas),
      reintentos: 1,
      agente: 'test', funcion: 'fallback',
    })
    assert.equal(r.texto, 'contestó el alternativo')
    assert.equal(r.proveedor, 'openai-compatible')
    assert.equal(r.modelo, 'modelo-alt-1')
    assert.equal(r.fallbackDe, 'anthropic', 'la respuesta dice QUIÉN falló antes: sin eso, una respuesta del fallback se ve igual que una normal')
    assert.equal(llamadas.filter((u) => u.includes('anthropic')).length, 2, 'un 529 se reintenta una vez y no más')
  })
})

test('un 400 NO se reintenta: es un bug nuestro y reintentarlo lo esconde', async () => {
  await conAlt(async () => {
    const llamadas = []
    await pedirTexto({
      mensajes: [{ role: 'user', content: 'hola' }], apiKey: 'k',
      fetchImpl: fetchDoble(400, llamadas), reintentos: 3,
    })
    assert.equal(llamadas.filter((u) => u.includes('anthropic')).length, 1)
  })
})

test('(F) los DOS proveedores caídos: lanza con la clasificación puesta, sin colgarse', async () => {
  await conAlt(async () => {
    const caidoTodo = async (url) => ({ ok: false, status: 503, text: async () => `caído ${url}` })
    await assert.rejects(
      pedirTexto({ mensajes: [{ role: 'user', content: 'hola' }], apiKey: 'k', fetchImpl: caidoTodo, reintentos: 0 }),
      (e) => e.clasificacion?.kind === 'server',
    )
  })
})

test('el alias se CONFIGURA, no se adivina: nadie le elige el modelo al dueño', () => {
  const antes = process.env.ORQ_IA_ALT_MODELO_POTENTE
  process.env.ORQ_IA_ALT_MODELO_POTENTE = 'el-grande'
  assert.equal(idDeModelo('opus'), 'el-grande')
  if (antes === undefined) delete process.env.ORQ_IA_ALT_MODELO_POTENTE
  else process.env.ORQ_IA_ALT_MODELO_POTENTE = antes
})

test('una respuesta que sólo trae tool_calls no rompe el lector de texto', () => {
  assert.equal(textoDe({ choices: [{ message: { content: null, tool_calls: [] } }] }), '')
})

test('EL DEFECTO: el proveedor APAGADO pisaba el error del que sí intentó', async () => {
  // Sin credenciales del alternativo, un 402 del primario salía como «sin credencial» con
  // clasificación `auth`. El OS habría marcado credencial vencida —que arregla una persona— en vez
  // de saldo agotado, y habría mandado a mirar el lugar equivocado.
  delete process.env.ORQ_IA_ALT_BASE_URL
  delete process.env.ORQ_IA_ALT_API_KEY
  const sinSaldo = async () => ({ ok: false, status: 402, text: async () => 'credit balance is too low' })
  await assert.rejects(
    pedirTexto({ mensajes: [{ role: 'user', content: 'x' }], apiKey: 'k', fetchImpl: sinSaldo, reintentos: 0 }),
    (e) => e.clasificacion?.kind === 'credit',
  )
})
