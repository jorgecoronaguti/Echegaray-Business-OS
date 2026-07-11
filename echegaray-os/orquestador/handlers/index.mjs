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

export const HANDLERS = {
  noop: noopHandler,
  generic: noopHandler, // por defecto, hasta que existan handlers reales (Fase 2+)
}

export function resolveHandler(type) {
  return HANDLERS[type] ?? null
}
