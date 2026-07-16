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

// Techo de vueltas del loop agéntico de tool-use (anti bucle infinito). El handler
// puede bajarlo con job.maxToolIterations. Configurable por entorno: los dominios que
// leen muchas fuentes de Drive (Continuidad de Datos, Equipos, Fiscal) superaban 8 y
// caían en reintento; 14 les da aire sin abrir el costo de par en par. Tope duro 24.
const MAX_TOOL_ITERATIONS = Math.min(24, Math.max(4, Number(process.env.ORQ_MAX_TOOL_ITERATIONS ?? 14)))

/** Suma los usages de varias vueltas del loop en un solo objeto de tokens. */
export function accumulateUsage(usages) {
  const acc = { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }
  for (const u of usages) {
    if (!u) continue
    acc.input_tokens += u.input_tokens || 0
    acc.output_tokens += u.output_tokens || 0
    acc.cache_creation_input_tokens += u.cache_creation_input_tokens || 0
    acc.cache_read_input_tokens += u.cache_read_input_tokens || 0
  }
  return acc
}

/** Costo total (USD) sumando el costo estimado de cada vuelta. null si el modelo no tiene precio. */
export function totalCostUsd(usages, modelId) {
  let usd = 0
  let known = false
  for (const u of usages) {
    const c = estimateCostUsd(modelId, u)
    if (c != null) { usd += c; known = true }
  }
  return known ? Math.round(usd * 1e6) / 1e6 : null
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

      // Tool-use OPT-IN: sólo si el handler pasa job.tools + job.toolExecutor. Sin
      // eso, el motor hace UNA vuelta y se comporta EXACTO como antes (retrocompat).
      const hasTools = Array.isArray(job.tools) && job.tools.length > 0
      if (hasTools && typeof job.toolExecutor !== 'function') {
        const e = new Error('anthropic-api: job.tools presente pero falta job.toolExecutor')
        e.retryable = false
        throw e
      }
      const maxIterations = hasTools ? (job.maxToolIterations ?? MAX_TOOL_ITERATIONS) : 1

      // Una llamada a la API, con manejo de error + breaker idéntico al de siempre.
      const callModel = async (messages) => {
        let response
        try {
          response = await sem.run(() =>
            api.messages.create(
              {
                model: modelId,
                // job.maxTokens acota la salida por pedido (respuestas más cortas y
                // rápidas, ej. el canal interactivo). Sin override, el default global.
                max_tokens: job.maxTokens ?? config.ANTHROPIC_MAX_TOKENS,
                // PROMPT CACHING: el system (skills, ~miles de tokens estáticos) y las
                // tools son idénticos en cada iteración del loop agéntico y entre pedidos
                // que usan las mismas skills. Cachearlos hace que las repeticiones se
                // lean a ~10% del costo (TTL ~5min). Es el mayor ahorro de API sin perder
                // capacidad. Marcar el ÚLTIMO bloque cachea todo el prefijo anterior.
                ...(job.system
                  ? { system: typeof job.system === 'string' ? [{ type: 'text', text: job.system, cache_control: { type: 'ephemeral' } }] : job.system }
                  : {}),
                messages,
                ...(hasTools ? { tools: job.tools.map((t, i) => (i === job.tools.length - 1 ? { ...t, cache_control: { type: 'ephemeral' } } : t)) } : {}),
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
        return response
      }

      // Loop agéntico. El modelo transporta tool_use/tool_result; el WORKER ejecuta
      // (via job.toolExecutor, que ya viene policy-gated). El motor no conoce policy.
      const messages = [{ role: 'user', content: job.prompt }]
      const usages = []
      let toolTurns = 0
      let lastResponse = null

      for (let i = 0; i < maxIterations; i++) {
        const response = await callModel(messages)
        lastResponse = response
        if (response.usage) usages.push(response.usage)

        if (hasTools && response.stop_reason === 'tool_use') {
          toolTurns++
          messages.push({ role: 'assistant', content: response.content })
          const toolResults = []
          for (const block of response.content || []) {
            if (!block || block.type !== 'tool_use') continue
            let content
            let isError = false
            try {
              const r = await job.toolExecutor(block.name, block.input, { id: block.id, agentSlug: job.agentSlug, task: job.task })
              content = typeof r === 'string' ? r : JSON.stringify(r ?? null)
              // TOPE DE CONTEXTO: un tool_result gigante (ej. leer una pestaña de 500 filas)
              // se ACUMULA y se re-manda cada vuelta → el contexto explotaba a 1M+ tokens y
              // $6 por tarea (o 400 por pasar el límite). Recortamos cada resultado y le
              // decimos al modelo que lea rangos más chicos. Es el freno real del gasto.
              const TOPE = 24000
              if (typeof content === 'string' && content.length > TOPE) {
                content = content.slice(0, TOPE) + `\n…[resultado recortado — eran ${content.length} caracteres. Leé un rango/porción MÁS CHICO (menos filas o menos columnas) en vez de la pestaña entera; no repitas lecturas grandes.]`
              }
            } catch (err) {
              // Un fallo de tool no rompe el razonamiento: vuelve al modelo como error.
              content = `ERROR: ${String(err?.message ?? err).slice(0, 500)}`
              isError = true
            }
            const tr = { type: 'tool_result', tool_use_id: block.id, content }
            if (isError) tr.is_error = true
            toolResults.push(tr)
          }
          messages.push({ role: 'user', content: toolResults })
          continue
        }

        // Respuesta final (o no había tools): construir el EngineResult del port.
        const singleTurn = toolTurns === 0 && usages.length <= 1
        const cost = { usd: totalCostUsd(usages, modelId) }
        const durationMs = Date.now() - startedAt

        // Soft-enforce del techo de costo de la ruta: no aborta (el costo se conoce
        // post-facto), pero lo deja registrado como señal.
        if (log && job.maxCostUsd != null && cost.usd != null && cost.usd > Number(job.maxCostUsd)) {
          log.warn('anthropic-api: costo supera el techo de la ruta', {
            model: modelId, cost_usd: cost.usd, max_cost_usd: Number(job.maxCostUsd),
          })
        }
        if (log) {
          const tot = accumulateUsage(usages)
          log.info('anthropic-api: request ok', {
            model: modelId,
            request_id: response._request_id ?? response.id ?? null,
            input_tokens: tot.input_tokens || null,
            output_tokens: tot.output_tokens || null,
            cost_usd: cost.usd,
            stop_reason: response.stop_reason ?? null,
            tool_turns: toolTurns,
            duration_ms: durationMs,
          })
        }

        return {
          sessionId: response.id ?? null,
          result: extractText(response.content),
          exitCode: 0,
          cost,
          // Sin tools: el usage exacto de la única vuelta (retrocompat). Con tools: suma de vueltas.
          tokens: singleTurn ? (usages[0] ?? response.usage ?? null) : accumulateUsage(usages),
          raw: {
            request_id: response._request_id ?? null,
            model: response.model ?? modelId,
            stop_reason: response.stop_reason ?? null,
            duration_ms: durationMs,
            ...(toolTurns > 0 ? { tool_turns: toolTurns } : {}),
          },
        }
      }

      // Agotó las iteraciones y el modelo seguía pidiendo tools. NO tiramos error (perdería
      // TODO el trabajo, incluidas las escrituras que YA se aplicaron vía las tools): devolvemos
      // lo que alcanzó a hacer + un aviso claro para continuar. Trabajo parcial > falla total.
      const parcial = extractText(lastResponse?.content) || ''
      const cost = { usd: totalCostUsd(usages, modelId) }
      if (log) {
        log.warn('anthropic-api: agotó iteraciones — devuelve trabajo parcial', {
          model: modelId, max_iterations: maxIterations, tool_turns: toolTurns, cost_usd: cost.usd,
        })
      }
      return {
        sessionId: lastResponse?.id ?? null,
        result: (parcial ? parcial + '\n\n' : '') +
          `_(Avancé por partes y me quedé sin pasos para terminar TODO de una. Lo que ya escribí quedó aplicado. Pedime "seguí" y continúo desde donde quedé.)_`,
        exitCode: 0,
        cost,
        tokens: accumulateUsage(usages),
        raw: { model: modelId, stop_reason: 'max_tool_iterations', duration_ms: Date.now() - startedAt, tool_turns: toolTurns, partial: true },
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
