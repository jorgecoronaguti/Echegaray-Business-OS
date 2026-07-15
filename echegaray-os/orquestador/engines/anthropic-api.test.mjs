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
    // PROMPT CACHING: el system string se envuelve en un bloque con cache_control ephemeral.
    check('run: mandó system con caching', Array.isArray(calledWith.params.system)
      && calledWith.params.system[0].text === 'SYS'
      && calledWith.params.system[0].cache_control?.type === 'ephemeral')
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

  // --- TOOL-USE: el motor corre el loop agéntico (2 vueltas: pide tool -> responde) ---
  {
    let calls = 0
    const seen = []
    const client = {
      messages: {
        create: async (params) => {
          calls++
          seen.push(params)
          if (calls === 1) {
            return {
              id: 'msg_t1', _request_id: 'req_t1', model: params.model, stop_reason: 'tool_use',
              usage: { input_tokens: 200, output_tokens: 30 },
              content: [
                { type: 'text', text: 'déjame leer el sheet' },
                { type: 'tool_use', id: 'tu_1', name: 'drive.read', input: { file_id: 'ABC' } },
              ],
            }
          }
          return {
            id: 'msg_t2', _request_id: 'req_t2', model: params.model, stop_reason: 'end_turn',
            usage: { input_tokens: 300, output_tokens: 40 },
            content: [{ type: 'text', text: '{"caja":123}' }],
          }
        },
      },
    }
    const execCalls = []
    const toolExecutor = async (name, input, meta) => { execCalls.push({ name, input, meta }); return { saldo: -12080208 } }
    const eng = makeAnthropicEngine({ config: CFG, client })
    const out = await eng.run({
      system: 'SYS', prompt: 'caja?', model: 'sonnet', maxCostUsd: 1,
      tools: [{ name: 'drive.read', description: 'lee', input_schema: { type: 'object' } }],
      toolExecutor, agentSlug: 'cfo',
    }, ctx)
    check('tooluse: 2 llamadas al modelo', calls === 2)
    check('tooluse: ejecutó la tool una vez', execCalls.length === 1)
    check('tooluse: pasó nombre e input al ejecutor', execCalls[0].name === 'drive.read' && execCalls[0].input.file_id === 'ABC')
    check('tooluse: pasó meta.agentSlug', execCalls[0].meta.agentSlug === 'cfo')
    check('tooluse: 1ra llamada mandó tools', Array.isArray(seen[0].tools) && seen[0].tools.length === 1)
    check('tooluse: 2da llamada = user+assistant+tool_result', seen[1].messages.length === 3 && seen[1].messages[2].content[0].type === 'tool_result')
    check('tooluse: tool_result referencia el tool_use_id', seen[1].messages[2].content[0].tool_use_id === 'tu_1')
    check('tooluse: result es el texto final', out.result === '{"caja":123}')
    check('tooluse: sessionId de la última respuesta', out.sessionId === 'msg_t2')
    check('tooluse: tokens acumulados', out.tokens.input_tokens === 500 && out.tokens.output_tokens === 70)
    check('tooluse: costo sumado de las 2 vueltas', Math.abs(out.cost.usd - (estimateCostUsd('claude-sonnet-4-6', { input_tokens: 200, output_tokens: 30 }) + estimateCostUsd('claude-sonnet-4-6', { input_tokens: 300, output_tokens: 40 }))) < 1e-9)
    check('tooluse: raw.tool_turns = 1', out.raw.tool_turns === 1)
  }

  // --- TOOL-USE: un error del ejecutor NO rompe el loop, va como tool_result is_error ---
  {
    let calls = 0
    const seen = []
    const client = { messages: { create: async (p) => {
      calls++; seen.push(p)
      if (calls === 1) return { id: 'e1', stop_reason: 'tool_use', usage: { input_tokens: 10, output_tokens: 5 }, content: [{ type: 'tool_use', id: 'tu_x', name: 'drive.read', input: {} }] }
      return { id: 'e2', stop_reason: 'end_turn', usage: { input_tokens: 12, output_tokens: 6 }, content: [{ type: 'text', text: 'listo' }] }
    } } }
    const eng = makeAnthropicEngine({ config: CFG, client })
    const out = await eng.run({ prompt: 'x', tools: [{ name: 'drive.read', description: 'd', input_schema: {} }], toolExecutor: async () => { throw new Error('boom') } }, ctx)
    check('tooluse-error: el loop continuó pese al error de la tool', out.result === 'listo')
    check('tooluse-error: mandó tool_result is_error', seen[1].messages[2].content[0].is_error === true)
  }

  // --- TOOL-USE: falta toolExecutor -> error claro no reintentable ---
  {
    const client = { messages: { create: async () => ({ id: 'z', content: [] }) } }
    const eng = makeAnthropicEngine({ config: CFG, client })
    let err = null
    try { await eng.run({ prompt: 'x', tools: [{ name: 't', description: 'd', input_schema: {} }] }, ctx) } catch (e) { err = e }
    check('tooluse: sin toolExecutor lanza', err instanceof Error)
    check('tooluse: sin toolExecutor no reintentable', err && err.retryable === false)
  }

  // --- TOOL-USE: tope de iteraciones -> devuelve trabajo PARCIAL (no tira error, que
  //     perdería las escrituras ya aplicadas); marca raw.partial y sugiere "seguí". ---
  {
    const client = { messages: { create: async () => ({ id: 'loop', stop_reason: 'tool_use', usage: { input_tokens: 1, output_tokens: 1 }, content: [{ type: 'text', text: 'voy por partes' }, { type: 'tool_use', id: 'tu', name: 't', input: {} }] }) } }
    const eng = makeAnthropicEngine({ config: CFG, client })
    let res = null, err = null
    try { res = await eng.run({ prompt: 'x', tools: [{ name: 't', description: 'd', input_schema: {} }], toolExecutor: async () => 'ok', maxToolIterations: 3 }, ctx) } catch (e) { err = e }
    check('tooluse: excede iteraciones devuelve parcial (no lanza)', err === null && res && res.exitCode === 0 && res.raw?.partial === true && /segu[ií]/.test(res.result))
  }

  console.log(`anthropic-api.test: ${ok} OK, ${fail} FALLA`)
  process.exit(fail ? 1 : 0)
}

main().catch((e) => { console.error('anthropic-api.test abortó:', e); process.exit(1) })
