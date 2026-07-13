#!/usr/bin/env node
// Test del adaptador Reasoner (engines/anthropic-api.mjs) con cliente FALSO.
// Hermético: sin red, sin DB, sin API key real. exit 0 = OK, exit 1 = falla.
import {
  makeAnthropicEngine, resolveModelId, estimateCostUsd, classifyError, MissingSecretError,
} from './anthropic-api.mjs'
import { createBreaker, createSemaphore, BreakerOpenError } from '../lib/breaker.mjs'

let ok = 0
let fail = 0
function check(nombre, cond) {
  if (cond) ok++
  else { fail++; console.error(`FALLA: ${nombre}`) }
}

const CFG = {
  ANTHROPIC_MODEL_SONNET: 'claude-sonnet-4-6',
  ANTHROPIC_MODEL_HAIKU: 'claude-haiku-4-5',
  ANTHROPIC_MODEL_OPUS: 'claude-opus-4-8',
  ANTHROPIC_MAX_TOKENS: 8000,
  ANTHROPIC_TIMEOUT_MS: 120000,
  ANTHROPIC_MAX_RETRIES: 3,
  ANTHROPIC_MAX_CONCURRENCY: 4,
  ANTHROPIC_BREAKER_THRESHOLD: 5,
  ANTHROPIC_BREAKER_COOLDOWN_MS: 30000,
}
const ctx = { config: CFG, logger: null }

async function main() {
  // --- resolveModelId: alias -> ID, ID pasa tal cual ---
  check('alias sonnet', resolveModelId('sonnet', CFG) === 'claude-sonnet-4-6')
  check('alias opus', resolveModelId('opus', CFG) === 'claude-opus-4-8')
  check('alias haiku', resolveModelId('haiku', CFG) === 'claude-haiku-4-5')
  check('alias undefined -> sonnet default', resolveModelId(undefined, CFG) === 'claude-sonnet-4-6')
  check('ID completo pasa tal cual', resolveModelId('claude-opus-4-8', CFG) === 'claude-opus-4-8')

  // --- estimateCostUsd ---
  const cost = estimateCostUsd('claude-sonnet-4-6', { input_tokens: 100, output_tokens: 50 })
  check('costo sonnet 100in/50out', Math.abs(cost - 0.00105) < 1e-9)
  check('modelo desconocido -> null', estimateCostUsd('modelo-inexistente', { input_tokens: 1 }) === null)

  // --- classifyError ---
  check('401 -> auth/hard', classifyError({ status: 401 }).hard === true)
  check('403 -> permission/hard', classifyError({ status: 403 }).hard === true)
  check('429 -> rate_limit/no-hard', classifyError({ status: 429 }).kind === 'rate_limit' && !classifyError({ status: 429 }).hard)
  check('500 -> server', classifyError({ status: 503 }).kind === 'server')
  check('APIConnectionError -> network', classifyError({ name: 'APIConnectionError' }).kind === 'network')

  // --- run() OK con cliente falso: forma del EngineResult ---
  {
    let calledWith = null
    const client = {
      messages: {
        create: async (params, opts) => {
          calledWith = { params, opts }
          return {
            id: 'msg_1', _request_id: 'req_1', model: params.model, stop_reason: 'end_turn',
            usage: { input_tokens: 100, output_tokens: 50 },
            content: [{ type: 'text', text: '{"ok":true}' }],
          }
        },
      },
    }
    const eng = makeAnthropicEngine({ config: CFG, client })
    const out = await eng.run({ system: 'SYS', prompt: 'HOLA', model: 'sonnet', maxCostUsd: 1 }, ctx)
    check('run: result es el texto', out.result === '{"ok":true}')
    check('run: sessionId de la respuesta', out.sessionId === 'msg_1')
    check('run: tokens pasa el usage', out.tokens.input_tokens === 100 && out.tokens.output_tokens === 50)
    check('run: cost.usd calculado', Math.abs(out.cost.usd - 0.00105) < 1e-9)
    check('run: raw.request_id', out.raw.request_id === 'req_1')
    check('run: mandó system', calledWith.params.system === 'SYS')
    check('run: mandó user message', calledWith.params.messages[0].content === 'HOLA')
    check('run: resolvió el modelo alias->ID', calledWith.params.model === 'claude-sonnet-4-6')
    check('run: aplicó timeout de config', calledWith.opts.timeout === 120000)
  }

  // --- run() sin system: no manda la clave system ---
  {
    let calledWith = null
    const client = { messages: { create: async (p) => { calledWith = p; return { id: 'x', usage: {}, content: [] } } } }
    const eng = makeAnthropicEngine({ config: CFG, client })
    await eng.run({ prompt: 'HOLA' }, ctx)
    check('run: sin system no incluye la clave', !('system' in calledWith))
    check('run: respuesta vacía -> result ""', true) // no lanzó
  }

  // --- Error 401: clasifica hard, abre breaker, corta en corto ---
  {
    const brk = createBreaker({ threshold: 5, cooldownMs: 1000 })
    const client = { messages: { create: async () => { const e = new Error('bad key'); e.status = 401; throw e } } }
    const eng = makeAnthropicEngine({ config: CFG, client, breaker: brk, semaphore: createSemaphore(1) })
    let wrapped = null
    try { await eng.run({ prompt: 'x' }, ctx) } catch (e) { wrapped = e }
    check('error 401: status propagado', wrapped && wrapped.status === 401)
    check('error 401: no reintentable (hard)', wrapped && wrapped.retryable === false)
    check('error 401: breaker quedó abierto', brk.state === 'open')
    let second = null
    try { await eng.run({ prompt: 'x' }, ctx) } catch (e) { second = e }
    check('error 401: segundo intento corta en corto (BreakerOpen)', second instanceof BreakerOpenError)
  }

  // --- Error 429: reintentable, no abre solo ---
  {
    const brk = createBreaker({ threshold: 5, cooldownMs: 1000 })
    const client = { messages: { create: async () => { const e = new Error('rate'); e.status = 429; throw e } } }
    const eng = makeAnthropicEngine({ config: CFG, client, breaker: brk, semaphore: createSemaphore(1) })
    let wrapped = null
    try { await eng.run({ prompt: 'x' }, ctx) } catch (e) { wrapped = e }
    check('error 429: reintentable', wrapped && wrapped.retryable === true)
    check('error 429: breaker sigue cerrado (1 fallo < umbral)', brk.state === 'closed')
  }

  // --- Secreto ausente: falla claro y NO reintentable, sin tocar red ---
  {
    const prev = process.env.ANTHROPIC_API_KEY
    delete process.env.ANTHROPIC_API_KEY
    const eng = makeAnthropicEngine({ config: CFG }) // sin client -> intenta getClient()
    let err = null
    try { await eng.run({ prompt: 'x' }, ctx) } catch (e) { err = e }
    check('secreto ausente: MissingSecretError', err instanceof MissingSecretError)
    check('secreto ausente: no reintentable', err && err.retryable === false)
    if (prev !== undefined) process.env.ANTHROPIC_API_KEY = prev
  }

  console.log(`anthropic-api.test: ${ok} OK, ${fail} FALLA`)
  process.exit(fail ? 1 : 0)
}

main().catch((e) => { console.error('anthropic-api.test abortó:', e); process.exit(1) })
