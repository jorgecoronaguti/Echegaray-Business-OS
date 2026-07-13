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
import { anthropicApiEngine } from './anthropic-api.mjs'

// ARQUITECTURA DE DOS PUERTOS (Anthropic-only, sin plataforma multi-proveedor):
//   'anthropic-api' → REASONER: motor del negocio 24×7 (API oficial de Anthropic).
//   'claude-cli'    → BUILDER: desarrollo del propio OS (herramientas locales).
//   'fixture'       → determinista, SOLO tests (no se resuelve en producción).
// No hay stubs de otros proveedores: la capa AI existe únicamente para aislar los
// detalles de la API de Anthropic, no para abstraer proveedores.

// 'fixture' es un motor determinista SOLO para tests. En producción no se resuelve
// (evita que cualquier tarea corra sobre un stub): Etapa 4 retiró 'noop'.
function fixtureAllowed() {
  return process.env.ORQ_ALLOW_FIXTURE === '1' || process.env.NODE_ENV === 'test'
}

export const ENGINES = {
  'anthropic-api': anthropicApiEngine,
  'claude-cli': claudeCliEngine,
  'fixture': fixtureEngine,
}

export function resolveEngine(name) {
  if (name === 'fixture' && !fixtureAllowed()) {
    throw new Error("Engine 'fixture' es solo para tests (definí ORQ_ALLOW_FIXTURE=1). En producción usá 'anthropic-api' (negocio) o 'claude-cli' (dev).")
  }
  const engine = ENGINES[name]
  if (!engine) throw new Error(`Engine desconocido: '${name}'. Disponibles: ${Object.keys(ENGINES).join(', ')}`)
  return engine
}
