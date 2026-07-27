// RAZONADOR PRODUCTIVO del FE1. Une el núcleo puro (fe-multiexperto.mjs) con la infraestructura de
// razonamiento REAL del OS: el Context Assembler (inyecta gobernanza + SKILL.md de cada lente) y el
// engine Anthropic (Messages API, texto→texto). Vive separado del núcleo para que los tests del núcleo
// jamás importen el SDK ni la red.
//
// Es el punto donde las skills se ENCHUFAN de verdad: assembleReasoningSystem lee las SKILL.md por
// nombre y las mete en el `system` de cada lente. El núcleo decide QUÉ skills; acá se CARGAN.
//
// Cost-aware: modelo barato por defecto (haiku), techo de costo por lente, respuestas cortas. Sólo se
// invoca cuando el dueño pregunta (lo dispara el route handler). Nada autónomo, nada en timer.
import { assembleReasoningSystem } from './context-assembler.mjs'
import { makeAnthropicEngine } from '../engines/anthropic-api.mjs'
import { APP_DIR } from './config.mjs'

// Config MÍNIMA del razonador, leída de process.env con los MISMOS defaults del schema de config.mjs
// (bloque Anthropic). Se separa de loadConfig() a propósito: loadConfig exige DATABASE_URL y otras
// ORQ_* que el runtime de la Web (Next/Vercel) no tiene por qué tener — el FE1 sólo razona (texto→texto),
// no toca la base ni el Work Fabric. La CREDENCIAL (ANTHROPIC_API_KEY) no va acá: la lee el SDK de env.
export function configRazonador(env = process.env) {
  const num = (v, d) => {
    const n = Number(v)
    return Number.isFinite(n) ? n : d
  }
  return {
    ANTHROPIC_MODEL_SONNET: env.ANTHROPIC_MODEL_SONNET || 'claude-sonnet-4-6',
    ANTHROPIC_MODEL_HAIKU: env.ANTHROPIC_MODEL_HAIKU || 'claude-haiku-4-5',
    ANTHROPIC_MODEL_OPUS: env.ANTHROPIC_MODEL_OPUS || 'claude-opus-4-8',
    ANTHROPIC_MAX_TOKENS: num(env.ANTHROPIC_MAX_TOKENS, 8000),
    ANTHROPIC_TIMEOUT_MS: num(env.ANTHROPIC_TIMEOUT_MS, 120000),
    ANTHROPIC_MAX_RETRIES: num(env.ANTHROPIC_MAX_RETRIES, 3),
    ANTHROPIC_MAX_CONCURRENCY: num(env.ANTHROPIC_MAX_CONCURRENCY, 4),
    ANTHROPIC_BREAKER_THRESHOLD: num(env.ANTHROPIC_BREAKER_THRESHOLD, 5),
    ANTHROPIC_BREAKER_COOLDOWN_MS: num(env.ANTHROPIC_BREAKER_COOLDOWN_MS, 30000),
    GOVERNANCE_FULL: env.ORQ_GOVERNANCE_FULL === '1' || env.ORQ_GOVERNANCE_FULL === 'true',
  }
}

/**
 * Crea el `razonar` que espera analizarMultiexperto. Cada llamada:
 *   1. arma el `system` con la gobernanza + las SKILL.md de la lente (compact: extracto operativo),
 *   2. corre el engine Anthropic (texto→texto, sin tools: es lectura+razonamiento, no toca nada),
 *   3. devuelve { texto, model, costUsd }.
 *
 * @param {object} [deps]
 * @param {object} [deps.config]  config validada (si no, loadConfig)
 * @param {object} [deps.engine]  engine con run(job,ctx) (para inyectar en pruebas de integración)
 * @param {object} [deps.logger]
 * @param {string} [deps.rootPath]
 * @returns {(job:object)=>Promise<{texto:string,model:string,costUsd:number|null}>}
 */
export function crearRazonadorProductivo(deps = {}) {
  const config = deps.config || configRazonador()
  const rootPath = deps.rootPath || APP_DIR
  const logger = deps.logger || null
  const engine = deps.engine || makeAnthropicEngine({ config })
  const ctx = { config, logger }

  return async function razonar({ skills, roleFraming, prompt, model, maxTokens }) {
    const { system } = await assembleReasoningSystem({
      rootPath,
      config,
      roleFraming,
      // Aquí se enchufan las skills de la lente: se leen sus SKILL.md y entran al system.
      skillNames: Array.isArray(skills) && skills.length ? skills : undefined,
      logger,
      compact: true, // extracto operativo (sin secciones meta) — más barato, sin perder criterio
    })
    const out = await engine.run(
      {
        system,
        prompt,
        model: model || 'haiku',
        maxTokens: maxTokens || 700,
        // Techo de costo por lente: una consulta = 3 lentes + 1 comparación. Con este tope una
        // consulta jamás se dispara de precio aunque el modelo se pase de largo.
        maxCostUsd: 0.4,
        task: { id: 'fe-multiexperto', capability_slug: 'advise.finance' },
        label: 'fe-multiexperto',
      },
      ctx,
    )
    return { texto: out?.result ?? '', model: out?.raw?.model ?? model ?? 'haiku', costUsd: out?.cost?.usd ?? null }
  }
}
