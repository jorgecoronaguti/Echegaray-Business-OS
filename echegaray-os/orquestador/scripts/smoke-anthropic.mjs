#!/usr/bin/env node
// Smoke del Reasoner Anthropic END-TO-END por el MISMO adaptador que usa el
// worker. Prueba que la API responde y que registramos request-id, tokens y
// costo. NO toca la base de datos (no usa loadConfig): arma la config del
// adaptador desde el entorno, con los mismos defaults que orquestador/lib/config.mjs.
//
// Uso:
//   ANTHROPIC_API_KEY=... node orquestador/scripts/smoke-anthropic.mjs
//   node orquestador/scripts/smoke-anthropic.mjs --dry   (sin llamar a la API)
import { makeAnthropicEngine } from '../engines/anthropic-api.mjs'
import { createLogger } from '../lib/logger.mjs'

const DRY = process.argv.includes('--dry')

// Mismos defaults que config.mjs (evita depender de DATABASE_URL para un smoke de API).
const num = (v, d) => (v == null || v === '' ? d : Number(v))
const cfg = {
  ANTHROPIC_MODEL_SONNET: process.env.ANTHROPIC_MODEL_SONNET || 'claude-sonnet-4-6',
  ANTHROPIC_MODEL_HAIKU: process.env.ANTHROPIC_MODEL_HAIKU || 'claude-haiku-4-5',
  ANTHROPIC_MODEL_OPUS: process.env.ANTHROPIC_MODEL_OPUS || 'claude-opus-4-8',
  ANTHROPIC_MAX_TOKENS: num(process.env.ANTHROPIC_MAX_TOKENS, 8000),
  ANTHROPIC_TIMEOUT_MS: num(process.env.ANTHROPIC_TIMEOUT_MS, 120000),
  ANTHROPIC_MAX_RETRIES: num(process.env.ANTHROPIC_MAX_RETRIES, 3),
  ANTHROPIC_MAX_CONCURRENCY: num(process.env.ANTHROPIC_MAX_CONCURRENCY, 4),
  ANTHROPIC_BREAKER_THRESHOLD: num(process.env.ANTHROPIC_BREAKER_THRESHOLD, 5),
  ANTHROPIC_BREAKER_COOLDOWN_MS: num(process.env.ANTHROPIC_BREAKER_COOLDOWN_MS, 30000),
}

const log = createLogger({ component: 'smoke-anthropic' })

async function main() {
  log.info('config del adaptador', {
    modelo_sonnet: cfg.ANTHROPIC_MODEL_SONNET, max_tokens: cfg.ANTHROPIC_MAX_TOKENS,
    timeout_ms: cfg.ANTHROPIC_TIMEOUT_MS, max_retries: cfg.ANTHROPIC_MAX_RETRIES,
    max_concurrency: cfg.ANTHROPIC_MAX_CONCURRENCY, api_key_presente: Boolean(process.env.ANTHROPIC_API_KEY),
  })

  const engine = makeAnthropicEngine({ config: cfg })

  if (DRY) {
    log.info('DRY: adaptador construido OK; no se llama a la API', {})
    process.exit(0)
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    log.error('ANTHROPIC_API_KEY ausente: definila para el smoke real (o usá --dry)', {})
    process.exit(1)
  }

  const ctx = { config: cfg, logger: log }
  const out = await engine.run(
    {
      system: 'Sos un verificador. Respondé ÚNICAMENTE con JSON válido, sin texto extra.',
      prompt: 'Devolvé exactamente este JSON: {"ok":true,"fuente":"smoke"}',
      model: 'sonnet',
    },
    ctx,
  )

  log.info('SMOKE OK — Reasoner respondió', {
    request_id: out.raw?.request_id ?? out.sessionId,
    modelo: out.raw?.model,
    input_tokens: out.tokens?.input_tokens ?? null,
    output_tokens: out.tokens?.output_tokens ?? null,
    costo_usd: out.cost?.usd ?? null,
    stop_reason: out.raw?.stop_reason,
    duration_ms: out.raw?.duration_ms,
  })
  console.log('Respuesta del modelo:', out.result)
  process.exit(0)
}

main().catch((e) => { log.error('SMOKE FALLÓ', { error: String(e?.message ?? e).slice(0, 300) }); process.exit(1) })
