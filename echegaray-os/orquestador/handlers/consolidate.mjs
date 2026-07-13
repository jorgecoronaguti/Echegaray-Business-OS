// Handler de CONSOLIDACIÓN de Dirección (Etapa 4). Cierra el lazo
// Especialista -> Work Fabric -> Director -> Usuario dentro del mismo DAG: una
// tarea type='direction_consolidate' que DEPENDE de todas las hojas del plan; el
// ledger la mantiene 'ready' hasta que los especialistas terminan (deps
// 'succeeded'). Lee sus resultados, sintetiza el informe de cierre y emite
// 'direction.completed'. Nivel B (reportar), sin efecto externo.
import { z } from 'zod'
import { query, withTx } from '../lib/db.mjs'
import { emitEvent } from '../lib/events.mjs'
import { decide } from '../lib/policy.mjs'
import { route } from '../lib/router.mjs'
import { resolveEngine } from '../engines/index.mjs'

const Closure = z.object({
  closure_summary: z.string().max(6000),
  objective_status: z.enum(['cumplido', 'parcial', 'bloqueado']).default('parcial'),
  key_points: z.array(z.string()).max(20).default([]),
})

function extractJson(text) {
  if (typeof text !== 'string') throw new Error('consolidación: el engine no devolvió texto')
  const a = text.indexOf('{'); const b = text.lastIndexOf('}')
  if (a < 0 || b <= a) throw new Error('consolidación: no se encontró JSON en la salida')
  return JSON.parse(text.slice(a, b + 1))
}

/** Reúne el trabajo de los especialistas hermanos (mismo objetivo). */
async function gatherSiblings(objectiveId, selfId) {
  const { rows } = await query(
    `select id, title, type, agent_slug, state, result
       from orq.tasks
      where parent_task_id = $1 and id <> $2 and type <> 'direction_consolidate'
      order by created_at`,
    [objectiveId, selfId],
  )
  const specialists = []
  const openApprovals = []
  let succeeded = 0, failed = 0
  for (const r of rows) {
    if (r.state === 'succeeded') succeeded++
    if (['dead_letter', 'failed'].includes(r.state)) failed++
    const res = r.result || {}
    specialists.push({
      agent: r.agent_slug, org_title: res.org_title ?? null, title: r.title, state: r.state,
      confidence: res.confidence ?? null,
      recommendations: Array.isArray(res.recommendations) ? res.recommendations : [],
      findings: Array.isArray(res.findings) ? res.findings.length : 0,
    })
    for (const ar of (Array.isArray(res.approval_requests) ? res.approval_requests : [])) openApprovals.push({ ...ar, from: r.agent_slug })
  }
  return { specialists, openApprovals, succeeded, failed, total: rows.length }
}

function consolidationPrompt(objective, agg) {
  const lines = agg.specialists.map((s) =>
    `- ${s.org_title || s.agent} [${s.state}] conf=${s.confidence ?? '?'}: ${s.recommendations.slice(0, 3).join(' · ') || 'sin recomendaciones'}`,
  ).join('\n')
  return (
    `Sos el DIRECTOR GENERAL IA de Echegaray Construcciones. Tus especialistas ` +
    `terminaron el trabajo del objetivo. Consolidá para la Dirección humana.\n\n` +
    `OBJETIVO:\n${objective?.goal || objective?.title || '(sin objetivo)'}\n\n` +
    `TRABAJO DE LOS ESPECIALISTAS (${agg.succeeded}/${agg.total} ok):\n${lines || '(sin trabajo)'}\n\n` +
    `Devolvé ÚNICAMENTE un JSON: {"closure_summary":"cierre ejecutivo integrado ` +
    `(no una lista de opiniones pegadas)","objective_status":"cumplido|parcial|bloqueado",` +
    `"key_points":["3-6 puntos accionables priorizados"]}\n` +
    `Reglas: integrá, no repitas. Nombrá conflictos entre dominios sin resolver. No ` +
    `ejecutes nada; lo que requiera aprobación humana ya está registrado como solicitud.`
  )
}

async function synth(task, ctx, engineName, objective, agg) {
  if (engineName === 'fixture') {
    return {
      closure: Closure.parse({
        closure_summary: `Cierre determinístico: ${agg.succeeded}/${agg.total} especialistas completaron; ${agg.openApprovals.length} aprobaciones pendientes.`,
        objective_status: agg.failed > 0 ? 'parcial' : 'cumplido',
        key_points: agg.specialists.flatMap((s) => s.recommendations.slice(0, 1)).slice(0, 6),
      }),
      cost: { usd: 0 }, sessionId: null,
    }
  }
  const { candidates } = await route({ tenantId: ctx.context.tenantId, capabilitySlug: 'direction.report', preferredModel: task.inputs?.model })
  const engine = resolveEngine(engineName)
  const eng = await engine.run(
    { prompt: consolidationPrompt(objective, agg), worktreePath: ctx.context.repository.rootPath, model: candidates[0]?.model, allowedTools: 'Read,Glob,Grep', task, timeoutMs: ctx.config.ENGINE_TIMEOUT_MS },
    ctx,
  )
  return { closure: Closure.parse(extractJson(eng.result)), cost: eng.cost, sessionId: eng.sessionId }
}

async function directorPrincipalId(tenantId) {
  const { rows } = await query("select id from orq.principals where tenant_id=$1 and slug='agent:director-general'", [tenantId])
  return rows[0]?.id ?? null
}

export async function consolidateHandler(task, ctx) {
  const objectiveId = task.parent_task_id
  if (!objectiveId) throw new Error('consolidación: falta parent_task_id (el objetivo a cerrar)')

  const directorId = (await directorPrincipalId(ctx.context.tenantId)) || ctx.context.systemPrincipalId
  const dispo = await decide('direction.report', directorId, task.blast_override)
  if (dispo === 'forbidden') throw new Error('consolidación: direction.report prohibido por policy')

  const { rows: orows } = await query('select id, title, goal from orq.tasks where id=$1', [objectiveId])
  const objective = orows[0]
  const agg = await gatherSiblings(objectiveId, task.id)

  const engineName = task.engine || task.inputs?.engine || 'claude-cli'
  const { closure, cost, sessionId } = await synth(task, ctx, engineName, objective, agg)

  await withTx(async (client) => {
    await emitEvent(client, {
      tenantId: ctx.context.tenantId, subjectType: 'task', subjectId: objectiveId,
      type: 'direction.completed', actorId: directorId, projectId: ctx.context.projectId,
      correlationId: task.correlation_id, causationId: task.id,
      payload: {
        objective_status: closure.objective_status,
        specialists_ok: agg.succeeded, specialists_total: agg.total,
        open_approvals: agg.openApprovals.length,
      },
    })
  })

  ctx.logger.info('consolidación: objetivo cerrado', { objective_id: objectiveId, status: closure.objective_status, ok: agg.succeeded, total: agg.total })
  return {
    result: {
      engine: engineName, session_id: sessionId, cost,
      objective_id: objectiveId,
      objective_status: closure.objective_status,
      closure_summary: closure.closure_summary,
      key_points: closure.key_points,
      specialists: agg.specialists,
      open_approval_requests: agg.openApprovals,
      counts: { succeeded: agg.succeeded, failed: agg.failed, total: agg.total },
    },
    evidence: { gathered: agg.total },
  }
}
