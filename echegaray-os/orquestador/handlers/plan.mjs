// Handler Planner (Fase 3). Descompone un objetivo en un DAG de subtareas
// durables con criterios de éxito, y las encola con sus dependencias de forma
// ATÓMICA (mismo txn + outbox). El orden de ejecución lo hace cumplir el ledger
// (claim_task excluye tareas con deps no 'succeeded'). Nivel B (planificar), sin
// efecto externo. El engine corre READ-ONLY (sin worktree, sin Edit/Write).
import { z } from 'zod'
import { withTx } from '../lib/db.mjs'
import { emitEvent } from '../lib/events.mjs'
import { decide } from '../lib/policy.mjs'
import { route } from '../lib/router.mjs'
import { resolveEngine } from '../engines/index.mjs'

const SubtaskSchema = z.object({
  key: z.string().min(1).max(64),
  type: z.string().default('code_change'),
  title: z.string().min(1).max(200),
  goal: z.string().max(4000).optional(),
  capability_slug: z.string().min(1),
  success_criteria: z.string().max(2000).optional(),
  depends_on: z.array(z.string()).default([]),
})
const PlanSchema = z.object({ subtasks: z.array(SubtaskSchema).min(1).max(30) })

function extractJson(text) {
  if (typeof text !== 'string') throw new Error('planner: el engine no devolvió texto')
  const a = text.indexOf('{')
  const b = text.lastIndexOf('}')
  if (a < 0 || b <= a) throw new Error('planner: no se encontró bloque JSON en la salida')
  return JSON.parse(text.slice(a, b + 1))
}

function planPrompt(task) {
  return (
    `Sos el Planner del Work Fabric. Descomponé el siguiente objetivo en subtareas ` +
    `ejecutables por agentes especializados. Objetivo:\n\n${task.goal || task.title}\n\n` +
    (task.success_criteria ? `Criterio de éxito global: ${task.success_criteria}\n\n` : '') +
    `Devolvé ÚNICAMENTE un JSON válido con esta forma (sin texto adicional):\n` +
    `{"subtasks":[{"key":"slug-corto","type":"code_change","title":"...",` +
    `"goal":"instrucción concreta","capability_slug":"code.edit_worktree",` +
    `"success_criteria":"cómo se valida","depends_on":["key-previa"]}]}\n\n` +
    `Reglas: capability_slug debe existir en el registro (p.ej. read.analyze, ` +
    `code.edit_worktree, run.tests, doc.write). depends_on referencia keys previas. ` +
    `Mantené el DAG mínimo y correcto. No inventes pasos innecesarios.`
  )
}

/** Genera el plan: canned si engine='fixture' (test determinístico), si no via engine. */
async function buildPlan(task, ctx, engineName) {
  if (engineName === 'fixture') {
    const canned = task.inputs?.canned_plan
    if (canned) return { plan: PlanSchema.parse(canned), cost: { usd: 0 }, sessionId: null }
    // plan por defecto para validar la maquinaria sin gastar tokens
    return {
      plan: PlanSchema.parse({
        subtasks: [
          { key: 'analyze', type: 'noop', title: 'Analizar alcance', capability_slug: 'read.analyze', success_criteria: 'alcance claro' },
          { key: 'implement', type: 'noop', title: 'Implementar', capability_slug: 'code.edit_worktree', depends_on: ['analyze'] },
          { key: 'verify', type: 'noop', title: 'Verificar', capability_slug: 'run.tests', depends_on: ['implement'] },
        ],
      }),
      cost: { usd: 0 },
      sessionId: null,
    }
  }
  // engine real, read-only, modelo elegido por el router para plan.decompose
  const { candidates } = await route({ tenantId: ctx.context.tenantId, capabilitySlug: 'plan.decompose', preferredModel: task.inputs?.model })
  const model = candidates[0]?.model
  const engine = resolveEngine(engineName)
  const eng = await engine.run(
    { prompt: planPrompt(task), worktreePath: ctx.context.repository.rootPath, model, allowedTools: 'Read,Glob,Grep', task, timeoutMs: ctx.config.ENGINE_TIMEOUT_MS },
    ctx,
  )
  return { plan: PlanSchema.parse(extractJson(eng.result)), cost: eng.cost, sessionId: eng.sessionId }
}

export async function planHandler(task, ctx) {
  // Policy gate: planificar es Nivel B (auto), pero pasa por el mismo Policy Engine.
  const dispo = await decide('plan.decompose', ctx.context.systemPrincipalId, task.blast_override)
  if (dispo === 'forbidden') throw new Error('planner: plan.decompose prohibido por policy')

  const engineName = task.engine || task.inputs?.engine || 'claude-cli'
  const { plan, cost, sessionId } = await buildPlan(task, ctx, engineName)

  // Enrutar cada subtarea a su agente por defecto (por capability) para trazabilidad.
  const routed = []
  for (const st of plan.subtasks) {
    const { agent } = await route({ tenantId: ctx.context.tenantId, capabilitySlug: st.capability_slug })
    routed.push({ ...st, agent_slug: agent?.slug ?? null })
  }

  // Commit atómico del DAG: hijos + deps + evento en la MISMA transacción (outbox).
  const created = await withTx(async (client) => {
    const keyToId = {}
    for (const st of routed) {
      const child = {
        type: st.type,
        title: st.title,
        goal: st.goal,
        capability_slug: st.capability_slug,
        agent_slug: st.agent_slug,
        success_criteria: st.success_criteria,
        parent_task_id: task.id,
        causation_id: task.id,
        dedupe_key: `plan:${task.id}:${st.key}`,
      }
      const { rows } = await client.query('select orq.enqueue_task($1::jsonb) as id', [JSON.stringify(child)])
      const id = rows[0].id
      keyToId[st.key] = id
      // agrupar bajo la correlación del plan (traza de workflow)
      await client.query('update orq.tasks set correlation_id = $1 where id = $2', [task.correlation_id, id])
    }
    // dependencias
    let depCount = 0
    for (const st of routed) {
      for (const dep of st.depends_on) {
        const from = keyToId[st.key]
        const to = keyToId[dep]
        if (!to) throw new Error(`planner: dependencia '${dep}' no existe en el plan (subtarea '${st.key}')`)
        await client.query(
          'insert into orq.task_deps (task_id, depends_on_task_id) values ($1,$2) on conflict do nothing',
          [from, to],
        )
        depCount++
      }
    }
    await emitEvent(client, {
      tenantId: ctx.context.tenantId,
      subjectType: 'task',
      subjectId: task.id,
      type: 'plan.created',
      actorId: ctx.context.systemPrincipalId,
      projectId: ctx.context.projectId,
      correlationId: task.correlation_id,
      causationId: task.id,
      payload: { subtasks: routed.length, deps: depCount, children: Object.values(keyToId) },
    })
    return { keyToId, depCount }
  })

  ctx.logger.info('plan creado', { task_id: task.id, subtasks: routed.length, deps: created.depCount })
  return {
    result: {
      engine: engineName,
      session_id: sessionId,
      subtasks: routed.length,
      deps: created.depCount,
      children: created.keyToId,
      cost,
    },
    evidence: {
      plan: routed.map((s) => ({ key: s.key, capability: s.capability_slug, agent: s.agent_slug, depends_on: s.depends_on })),
    },
  }
}
