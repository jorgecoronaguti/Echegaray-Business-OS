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
import { fixtureEngine } from './fixture-engine.mjs'
import { claudeCliEngine } from './claude-cli.mjs'

// Motores futuros: interfaz lista, implementación pendiente (neutralidad D3).
function notImplemented(name) {
  return {
    async run() {
      throw new Error(`Engine '${name}' aún no implementado (la interfaz Engine/Runner ya lo soporta)`)
    },
  }
}

// 'fixture' es un motor determinista SOLO para tests. En producción no se resuelve
// (evita que cualquier tarea corra sobre un stub): Etapa 4 retiró 'noop'.
function fixtureAllowed() {
  return process.env.ORQ_ALLOW_FIXTURE === '1' || process.env.NODE_ENV === 'test'
}

export const ENGINES = {
  'claude-cli': claudeCliEngine,
  'fixture': fixtureEngine,
  'claude-sdk': notImplemented('claude-sdk'),
  'anthropic-api': notImplemented('anthropic-api'),
  'openai': notImplemented('openai'),
  'gemini': notImplemented('gemini'),
}

export function resolveEngine(name) {
  if (name === 'fixture' && !fixtureAllowed()) {
    throw new Error("Engine 'fixture' es solo para tests (definí ORQ_ALLOW_FIXTURE=1). En producción usá 'claude-cli'.")
  }
  const engine = ENGINES[name]
  if (!engine) throw new Error(`Engine desconocido: '${name}'. Disponibles: ${Object.keys(ENGINES).join(', ')}`)
  return engine
}
