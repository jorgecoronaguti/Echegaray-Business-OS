// Port Engine/Runner NEUTRAL (D3). El Work Fabric habla con este contrato, nunca
// con un motor concreto. Reemplazar Claude por otro motor no toca nada fuera de
// esta carpeta.
//
// Contrato del engine:
//   async run(job, ctx) => EngineResult
//     job: { prompt, worktreePath, model?, allowedTools?, timeoutMs?, task }
//     ctx: { logger, config, heartbeat? }
//   EngineResult: {
//     sessionId?: string,   // id de sesión del motor (trazabilidad)
//     result?: string,      // texto/resumen devuelto
//     exitCode?: number,
//     cost?: { usd?: number },
//     tokens?: object,
//     raw?: unknown,        // salida cruda del motor (para evidencia)
//   }
//
// El motor SOLO ejecuta; el aislamiento (worktree), la política (Policy Engine),
// la revisión y el commit los hace el Fabric, no el motor.
import { noopEngine } from './noop-engine.mjs'
import { claudeCliEngine } from './claude-cli.mjs'

// Motores futuros: interfaz lista, implementación pendiente (neutralidad D3).
function notImplemented(name) {
  return {
    async run() {
      throw new Error(`Engine '${name}' aún no implementado (la interfaz Engine/Runner ya lo soporta)`)
    },
  }
}

export const ENGINES = {
  'noop': noopEngine,
  'claude-cli': claudeCliEngine,
  'claude-sdk': notImplemented('claude-sdk'),
  'anthropic-api': notImplemented('anthropic-api'),
  'openai': notImplemented('openai'),
  'gemini': notImplemented('gemini'),
}

export function resolveEngine(name) {
  const engine = ENGINES[name]
  if (!engine) throw new Error(`Engine desconocido: '${name}'. Disponibles: ${Object.keys(ENGINES).join(', ')}`)
  return engine
}
