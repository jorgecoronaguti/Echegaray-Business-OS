// Adaptador REASONER — API oficial de Anthropic (Messages API). Es el motor del
// NEGOCIO 24×7 detrás del port neutral (engines/index.mjs). Texto→texto, SIN
// herramientas ni filesystem: el conocimiento (gobernanza + SKILL.md) lo inyecta
// el Context Assembler en `job.system`. El aislamiento, la política y la revisión
// los hace el Fabric, no el motor.
//
// Contrato del port (idéntico al resto de motores):
//   run(job, ctx) => EngineResult
//     job.system?    → prompt de sistema (gobernanza + conocimiento de dominio)
//     job.prompt     → mensaje de usuario (digest situacional + tarea)
//     job.model?     → alias de tier ('sonnet'|'opus'|'haiku') o ID completo
//     job.maxCostUsd? → techo de costo de la ruta (soft-enforce: warn si se supera)
//   EngineResult: { sessionId, result, exitCode, cost:{usd}, tokens, raw }
//
// Resiliencia: reintentos 429/5xx/red + retry-after los maneja el SDK (maxRetries).
// El breaker + semáforo (lib/breaker.mjs) protegen a nivel proveedor. NUNCA hay
// fallback silencioso a claude-cli: si la API falla, la tarea reintenta por el
// ledger o va a dead-letter con post-mortem.
import Anthropic from '@anthropic-ai/sdk'
import { createBreaker, createSemaphore, BreakerOpenError } from '../lib/breaker.mjs'

/** Falta la credencial. Tipado para fallar claro y NO reintentar en vano. */
export class MissingSecretError extends Error {
  constructor() {
    super('ANTHROPIC_API_KEY ausente: definila en el EnvironmentFile de systemd (nunca en git/logs).')
    this.name = 'MissingSecretError'
    this.code = 'MISSING_SECRET'
    this.retryable = false
  }
}

// Precios de referencia (USD por 1M de tokens) para ESTIMAR costo — la API no
// devuelve dólares. Tabla acotada; si el modelo no está, cost.usd = null (honesto,
// nunca inventa precisión). Editar acá si cambian precios/modelos.
const PRICES = {
  'claude-opus-4-8': { in: 5, out: 25 },
  'claude-opus-4-7': { in: 5, out: 25 },
  'claude-opus-4-6': { in: 5, out: 25 },
  'claude-opus-4-5': { in: 5, out: 25 },
  'claude-sonnet-5': { in: 3, out: 15 },
  'claude-sonnet-4-6': { in: 3, out: 15 },
  'claude-sonnet-4-5': { in: 3, out: 15 },
  'claude-haiku-4-5': { in: 1, out: 5 },
}

/** Traduce alias de tier ('sonnet'|'opus'|'haiku') a ID de modelo de la API.
 *  Un valor que ya sea un ID ('claude-...') pasa tal cual. */
export function resolveModelId(alias, cfg) {
  if (!alias) return cfg.ANTHROPIC_MODEL_SONNET
  const a = String(alias).toLowerCase()
  if (a === 'sonnet') return cfg.ANTHROPIC_MODEL_SONNET
  if (a === 'haiku') return cfg.ANTHROPIC_MODEL_HAIKU
  if (a === 'opus') return cfg.ANTHROPIC_MODEL_OPUS
  return alias // ya es un ID completo
}

/** Costo estimado en USD a partir del usage. Devuelve null si no hay precio. */
export function estimateCostUsd(modelId, usage) {
  const p = PRICES[modelId]
  if (!p || !usage) return null
  const input = (usage.input_tokens || 0) + (usage.cache_creation_input_tokens || 0) + (usage.cache_read_input_tokens || 0)
  const output = usage.output_tokens || 0
  const usd = (input / 1e6) * p.in + (output / 1e6) * p.out
  return Math.round(usd * 1e6) / 1e6
}

/** Clasifica un error del SDK por status HTTP. `hard` = credencial (no reintentar). */
export function classifyError(err) {
  const status = err?.status ?? err?.statusCode ?? null
  if (status === 401) return { kind: 'auth', hard: true, status }
  if (status === 403) return { kind: 'permission', hard: true, status }
  if (status === 429) return { kind: 'rate_limit', hard: false, status }
  if (typeof status === 'number' && status >= 500) return { kind: 'server', hard: false, status }
  if (typeof status === 'number' && status >= 400) return { kind: 'client', hard: false, status }
  if (err?.name === 'APIConnectionError' || err?.name === 'APIConnectionTimeoutError') return { kind: 'network', hard: false, status: null }
  return { kind: 'unknown', hard: false, status }
}

/** Concatena los bloques de texto de la respuesta. Robusto ante refusal (vacío). */
function extractText(content) {
  if (!Array.isArray(content)) return ''
  return content
    .filter((b) => b && b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text)
    .join('')
}

/**
 * Fábrica del engine. En producción se construye con el SDK real; en tests se
 * inyecta un `client` falso (con messages.create) para no tocar la red.
 * @param {object} deps
 * @param {object} deps.config
 * @param {object} [deps.client]     override para tests
 * @param {object} [deps.breaker]    override para tests
 * @param {object} [deps.semaphore]  override para tests
 */
export function makeAnthropicEngine({ config, client, breaker, semaphore }) {
  const brk =
    breaker ||
    createBreaker({
      provider: 'anthropic',
      threshold: config.ANTHROPIC_BREAKER_THRESHOLD,
      cooldownMs: config.ANTHROPIC_BREAKER_COOLDOWN_MS,
    })
  const sem = semaphore || createSemaphore(config.ANTHROPIC_MAX_CONCURRENCY)

  function getClient() {
    if (client) return client
    if (!process.env.ANTHROPIC_API_KEY) throw new MissingSecretError()
    // La key la lee el SDK de process.env; no la pasamos ni la logueamos.
    client = new Anthropic({ maxRetries: config.ANTHROPIC_MAX_RETRIES })
    return client
  }

  return {
    _breaker: brk, // expuesto sólo para observabilidad/health
    _semaphore: sem,
    async run(job, ctx) {
      const modelId = resolveModelId(job.model, config)
      const log = ctx?.logger
      const startedAt = Date.now()

      // Falla rápido si el breaker está abierto (protección anti-tormenta).
      brk.assertClosed()

      // Falla claro y NO reintentable si falta la credencial.
      const api = getClient()

      let response
      try {
        response = await sem.run(() =>
          api.messages.create(
            {
              model: modelId,
              max_tokens: config.ANTHROPIC_MAX_TOKENS,
              ...(job.system ? { system: job.system } : {}),
              messages: [{ role: 'user', content: job.prompt }],
            },
            { timeout: job.timeoutMs || config.ANTHROPIC_TIMEOUT_MS },
          ),
        )
      } catch (err) {
        const c = classifyError(err)
        brk.onFailure({ hard: c.hard })
        // El mensaje del SDK no contiene la key; igual acotamos por prudencia.
        const detail = String(err?.message ?? err).slice(0, 300)
        const wrapped = new Error(`anthropic-api: ${c.kind}${c.status ? ` (${c.status})` : ''}: ${detail}`)
        wrapped.cause = err
        wrapped.kind = c.kind
        wrapped.status = c.status
        wrapped.retryable = err instanceof BreakerOpenError ? false : c.hard ? false : true
        if (log) log.warn('anthropic-api: request falló', { model: modelId, kind: c.kind, status: c.status, duration_ms: Date.now() - startedAt })
        throw wrapped
      }

      brk.onSuccess()
      const usage = response.usage ?? null
      const cost = { usd: estimateCostUsd(modelId, usage) }
      const durationMs = Date.now() - startedAt

      // Soft-enforce del techo de costo de la ruta: no aborta (el costo se conoce
      // post-facto), pero lo deja registrado como señal.
      if (log && job.maxCostUsd != null && cost.usd != null && cost.usd > Number(job.maxCostUsd)) {
        log.warn('anthropic-api: costo supera el techo de la ruta', {
          model: modelId, cost_usd: cost.usd, max_cost_usd: Number(job.maxCostUsd),
        })
      }

      if (log) {
        log.info('anthropic-api: request ok', {
          model: modelId,
          request_id: response._request_id ?? response.id ?? null,
          input_tokens: usage?.input_tokens ?? null,
          output_tokens: usage?.output_tokens ?? null,
          cost_usd: cost.usd,
          stop_reason: response.stop_reason ?? null,
          duration_ms: durationMs,
        })
      }

      return {
        sessionId: response.id ?? null,
        result: extractText(response.content),
        exitCode: 0,
        cost,
        tokens: usage, // {input_tokens, output_tokens, cache_*} — consumido por public.orq_org
        raw: {
          request_id: response._request_id ?? null,
          model: response.model ?? modelId,
          stop_reason: response.stop_reason ?? null,
          duration_ms: durationMs,
        },
      }
    },
  }
}

// Singleton productivo (perezoso): construido con la config real y el SDK real.
let _singleton = null
export const anthropicApiEngine = {
  async run(job, ctx) {
    if (!_singleton) _singleton = makeAnthropicEngine({ config: ctx.config })
    return _singleton.run(job, ctx)
  },
}
