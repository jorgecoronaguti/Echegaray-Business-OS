// Handler del DIRECTOR IA (Etapa 3). El "pensar" de la Dirección.
// Objetivo (tarea type='direction') -> comprende estado -> prioriza -> planifica
// -> crea y ASIGNA un DAG a especialistas (Work Fabric) -> registra informe
// ejecutivo, recomendaciones y solicitudes de aprobación. NO ejecuta acciones de
// aprobación humana (las deja registradas). El Director es el ÚNICO que asigna a
// especialistas (invariante reforzado en DB); reusa Planner/router/ledger.
import { z } from 'zod'
import { query, withTx } from '../lib/db.mjs'
import { emitEvent } from '../lib/events.mjs'
import { decide } from '../lib/policy.mjs'
import { route } from '../lib/router.mjs'
import { resolveEngine } from '../engines/index.mjs'
import { assembleSituation, situationDigest } from '../lib/situation.mjs'

const Subtask = z.object({
  key: z.string().min(1).max(64),
  type: z.string().default('code_change'),
  title: z.string().min(1).max(200),
  goal: z.string().max(4000).optional(),
  capability_slug: z.string().min(1),
  success_criteria: z.string().max(2000).optional(),
  depends_on: z.array(z.string()).default([]),
})
const Direction = z.object({
  priorities: z.array(z.object({ titulo: z.string(), razon: z.string().optional() })).default([]),
  plan: z.object({ subtasks: z.array(Subtask).max(30) }).default({ subtasks: [] }),
  recommendations: z.array(z.string()).default([]),
  approval_requests: z.array(z.object({ titulo: z.string(), motivo: z.string().optional(), capability_slug: z.string().optional() })).default([]),
  executive_summary: z.string().default(''),
})

function extractJson(text) {
  if (typeof text !== 'string') throw new Error('director: el engine no devolvió texto')
  const a = text.indexOf('{'); const b = text.lastIndexOf('}')
  if (a < 0 || b <= a) throw new Error('director: no se encontró JSON en la salida')
  return JSON.parse(text.slice(a, b + 1))
}

function directorPrompt(task, digest) {
  return (
    `Sos el DIRECTOR GENERAL IA de Echegaray Construcciones. No implementás ni calculás: ` +
    `dirigís. Comprendé el estado, priorizá, y descomponé el objetivo en trabajo para ` +
    `especialistas.\n\nESTADO ACTUAL DEL BUSINESS OS:\n${digest}\n\n` +
    `OBJETIVO DE DIRECCIÓN:\n${task.goal || task.title}\n\n` +
    `Capacidades disponibles para asignar (capability_slug): read.analyze, doc.write, ` +
    `code.edit_worktree, run.tests, run.lint, run.build, knowledge.write_memory, ` +
    `plan.decompose. Cada subtarea se enruta al especialista dueño de esa capacidad.\n\n` +
    `Devolvé ÚNICAMENTE un JSON con esta forma:\n` +
    `{"priorities":[{"titulo":"...","razon":"..."}],` +
    `"plan":{"subtasks":[{"key":"k1","type":"code_change","title":"...","goal":"...",` +
    `"capability_slug":"read.analyze","success_criteria":"...","depends_on":[]}]},` +
    `"recommendations":["..."],` +
    `"approval_requests":[{"titulo":"...","motivo":"...","capability_slug":"..."}],` +
    `"executive_summary":"..."}\n` +
    `Reglas: sólo trabajo interno (Nivel A–D) en el plan. Lo que requiera aprobación ` +
    `humana (Nivel E: push, deploy, escritura económica real, comunicación externa) va ` +
    `en approval_requests, NO en el plan. Mantené el DAG mínimo y accionable.`
  )
}

async function think(task, ctx, engineName, digest) {
  if (engineName === 'noop') {
    const canned = task.inputs?.canned_direction
    if (canned) return { dir: Direction.parse(canned), cost: { usd: 0 }, sessionId: null }
    return {
      dir: Direction.parse({
        priorities: [{ titulo: 'Estabilizar y comprender', razon: 'línea base del OS' }],
        plan: { subtasks: [
          { key: 'diag', type: 'noop', title: 'Diagnóstico de estado', capability_slug: 'read.analyze', success_criteria: 'estado comprendido' },
          { key: 'doc', type: 'noop', title: 'Documentar hallazgos', capability_slug: 'doc.write', depends_on: ['diag'] },
        ] },
        recommendations: ['Revisar dead-letter si > 0'],
        approval_requests: [],
        executive_summary: 'Ciclo de dirección (modo determinístico): diagnóstico + documentación.',
      }),
      cost: { usd: 0 }, sessionId: null,
    }
  }
  const { candidates } = await route({ tenantId: ctx.context.tenantId, capabilitySlug: 'direction.plan', preferredModel: task.inputs?.model })
  const engine = resolveEngine(engineName)
  const eng = await engine.run(
    { prompt: directorPrompt(task, digest), worktreePath: ctx.context.repository.rootPath, model: candidates[0]?.model, allowedTools: 'Read,Glob,Grep', task, timeoutMs: ctx.config.ENGINE_TIMEOUT_MS },
    ctx,
  )
  return { dir: Direction.parse(extractJson(eng.result)), cost: eng.cost, sessionId: eng.sessionId }
}

async function directorPrincipalId(tenantId) {
  const { rows } = await query("select id from orq.principals where tenant_id=$1 and slug='agent:director-general'", [tenantId])
  if (!rows.length) throw new Error('director: falta el principal agent:director-general (¿corriste la migración de Etapa 3?)')
  return rows[0].id
}

export async function directionHandler(task, ctx) {
  const dispo = await decide('direction.plan', ctx.context.systemPrincipalId, task.blast_override)
  if (dispo === 'forbidden') throw new Error('director: direction.plan prohibido por policy')

  const situation = await assembleSituation()
  const digest = situationDigest(situation)
  const engineName = task.engine || task.inputs?.engine || 'claude-cli'
  const { dir, cost, sessionId } = await think(task, ctx, engineName, digest)

  const directorId = await directorPrincipalId(ctx.context.tenantId)

  // enrutar cada subtarea a su especialista
  const routed = []
  for (const st of dir.plan.subtasks) {
    const { agent } = await route({ tenantId: ctx.context.tenantId, capabilitySlug: st.capability_slug })
    routed.push({ ...st, agent_slug: agent?.slug ?? null })
  }

  // commit atómico: DAG de especialistas + informe + eventos (outbox)
  const created = await withTx(async (client) => {
    const keyToId = {}
    for (const st of routed) {
      const child = {
        type: st.type, title: st.title, goal: st.goal, capability_slug: st.capability_slug,
        agent_slug: st.agent_slug, success_criteria: st.success_criteria,
        parent_task_id: task.id, causation_id: task.id,
        created_by: directorId, // el Director es el asignador autorizado (invariante D5)
        dedupe_key: `dir:${task.id}:${st.key}`,
      }
      const { rows } = await client.query('select orq.enqueue_task($1::jsonb) as id', [JSON.stringify(child)])
      keyToId[st.key] = rows[0].id
      await client.query('update orq.tasks set correlation_id=$1 where id=$2', [task.correlation_id, rows[0].id])
    }
    let deps = 0
    for (const st of routed) {
      for (const d of st.depends_on) {
        if (!keyToId[d]) throw new Error(`director: dependencia '${d}' inexistente en el plan`)
        await client.query('insert into orq.task_deps (task_id, depends_on_task_id) values ($1,$2) on conflict do nothing', [keyToId[st.key], keyToId[d]])
        deps++
      }
    }
    await emitEvent(client, {
      tenantId: ctx.context.tenantId, subjectType: 'task', subjectId: task.id,
      type: 'direction.planned', actorId: directorId, projectId: ctx.context.projectId,
      correlationId: task.correlation_id, causationId: task.id,
      payload: { priorities: dir.priorities.length, subtasks: routed.length, deps, children: Object.values(keyToId) },
    })
    for (const ar of dir.approval_requests) {
      await emitEvent(client, {
        tenantId: ctx.context.tenantId, subjectType: 'task', subjectId: task.id,
        type: 'direction.approval_requested', actorId: directorId, projectId: ctx.context.projectId,
        correlationId: task.correlation_id, causationId: task.id, blastRadius: 'high',
        payload: ar,
      })
    }
    return { keyToId, deps }
  })

  ctx.logger.info('director: ciclo completado', { task_id: task.id, subtasks: routed.length, approvals: dir.approval_requests.length })
  return {
    result: {
      engine: engineName, session_id: sessionId, cost,
      priorities: dir.priorities,
      assigned: routed.map((s) => ({ key: s.key, capability: s.capability_slug, agent: s.agent_slug })),
      children: created.keyToId,
      recommendations: dir.recommendations,
      approval_requests: dir.approval_requests,
      executive_summary: dir.executive_summary,
    },
    evidence: { situation, digest },
  }
}
