// Registry de handlers por tipo de tarea. En Fase 1 solo existe 'noop', que
// valida TODO el ciclo (claim -> ejecutar -> revisar -> completar -> eventos)
// sin usar IA. En Fase 2 se agrega el handler que invoca el Engine/Runner.
//
// Contrato del handler:
//   async (task, ctx) => { result?: object, evidence?: object }
//   - task: fila de orq.tasks
//   - ctx: { logger, config, context (ejes), heartbeat() }
//   - lanzar un Error marca el intento como fallido (dispara reintento/backoff).

import { noopHandler } from './noop.mjs'
import { codeChangeHandler } from './code_change.mjs'
import { planHandler } from './plan.mjs'

export const HANDLERS = {
  noop: noopHandler,
  generic: noopHandler,
  code_change: codeChangeHandler, // Fase 2: worktree -> engine -> review -> commit local
  plan: planHandler, // Fase 3: descompone un objetivo en un DAG de subtareas
}

export function resolveHandler(type) {
  return HANDLERS[type] ?? null
}
