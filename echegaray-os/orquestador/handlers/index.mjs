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
import { directionHandler } from './direction.mjs'
import { specialistHandler } from './specialist.mjs'
import { consolidateHandler } from './consolidate.mjs'
import { operationExecuteHandler } from './operation_execute.mjs'
import { scheduledDirectiveHandler } from './scheduled_directive.mjs'
import { comunicacionResponderHandler } from './comunicacion.mjs'
import { cotizacionPlanoHandler } from './cotizacion_plano.mjs'

export const HANDLERS = {
  noop: noopHandler,
  generic: noopHandler,
  code_change: codeChangeHandler, // Fase 2: worktree -> engine -> review -> commit local
  plan: planHandler, // Fase 3: descompone un objetivo en un DAG de subtareas
  direction: directionHandler, // Etapa 3: ciclo del Director IA (comprende->prioriza->planifica->asigna)
  specialist: specialistHandler, // Etapa 4: trabajo de análisis/preparación de un especialista de dominio
  direction_consolidate: consolidateHandler, // Etapa 4: cierra el objetivo integrando el trabajo de los especialistas
  operation_execute: operationExecuteHandler, // PRP-015 F1: ejecuta una operación aprobada (escritura en Drive) idempotentemente
  scheduled_directive: scheduledDirectiveHandler, // PRP-015 F4: corre una directiva programada (recurrencia)
  'comunicacion.responder': comunicacionResponderHandler, // PR-4: responde en el chat el trabajo del Work Fabric
  'cotizacion.plano': cotizacionPlanoHandler, // cotizar un plano es un trabajo asíncrono: la web encola, el worker lee y computa
}

export function resolveHandler(type) {
  return HANDLERS[type] ?? null
}
