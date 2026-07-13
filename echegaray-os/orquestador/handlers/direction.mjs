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
import { assembleReasoningSystem, ROLE_FRAMING } from '../lib/context-assembler.mjs'

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
    `dirigís una organización de especialistas. Comprendé el estado, priorizá, y descomponé ` +
    `el objetivo en trabajo para tus especialistas.\n\nESTADO ACTUAL DEL BUSINESS OS:\n${digest}\n\n` +
    `OBJETIVO DE DIRECCIÓN:\n${task.goal || task.title}\n\n` +
    `TUS ESPECIALISTAS (elegí capability_slug; cada uno enruta a su especialista):\n` +
    `- advise.finance → CFO IA · advise.accounting → Contador IA · advise.procurement → Compras IA\n` +
    `- advise.commercial → Comercial IA · advise.engineering → Ingeniería IA · advise.architecture → Arquitecto IA\n` +
    `- advise.civil → Ingeniero Civil IA · advise.legal → Abogado IA · advise.hr → RRHH IA\n` +
    `- read.analyze/doc.write → Software Architect IA · code.edit_worktree/run.tests/run.lint/run.build → Software Developer IA\n\n` +
    `Para cada subtarea, elegí el TYPE:\n` +
    `- type="specialist" para trabajo de análisis/asesoría de negocio (todas las advise.*).\n` +
    `- type="code_change" SOLO para cambios de código (capacidades code.*/run.*).\n\n` +
    `Devolvé ÚNICAMENTE un JSON con esta forma:\n` +
    `{"priorities":[{"titulo":"...","razon":"..."}],` +
    `"plan":{"subtasks":[{"key":"k1","type":"specialist","title":"...","goal":"instrucción concreta al especialista",` +
    `"capability_slug":"advise.finance","success_criteria":"...","depends_on":[]}]},` +
    `"recommendations":["..."],` +
    `"approval_requests":[{"titulo":"...","motivo":"...","capability_slug":"..."}],` +
    `"executive_summary":"..."}\n` +
    `Reglas: sólo trabajo interno (Nivel A–D) en el plan. Lo que requiera aprobación ` +
    `humana (Nivel E: push, deploy, escritura económica/fiscal/laboral/legal real, comunicación ` +
    `externa) va en approval_requests, NO en el plan. Asigná cada tema al especialista de su ` +
    `dominio. Mantené el DAG mínimo y accionable (no más de ~8 subtareas).`
  )
}

async function think(task, ctx, engineOverride, digest) {
  if (engineOverride === 'fixture') {
    const canned = task.inputs?.canned_direction
    if (canned) return { dir: Direction.parse(canned), cost: { usd: 0 }, sessionId: null, engine: 'fixture' }
    return {
      dir: Direction.parse({
        priorities: [{ titulo: 'Estabilizar y comprender', razon: 'línea base del OS' }],
        plan: { subtasks: [
          { key: 'fin', type: 'specialist', title: 'Diagnóstico financiero', capability_slug: 'advise.finance', success_criteria: 'caja comprendida' },
          { key: 'legal', type: 'specialist', title: 'Revisión contractual', capability_slug: 'advise.legal', depends_on: ['fin'] },
        ] },
        recommendations: ['Revisar dead-letter si > 0'],
        approval_requests: [],
        executive_summary: 'Ciclo de dirección (modo determinístico): finanzas + legal.',
      }),
      cost: { usd: 0 }, sessionId: null, engine: 'fixture',
    }
  }
  const { candidates } = await route({ tenantId: ctx.context.tenantId, capabilitySlug: 'direction.plan', preferredModel: task.inputs?.model })
  // Motor: override explícito de la tarea > engine de la ruta > default del negocio.
  const engineName = engineOverride || candidates[0]?.engine || ctx.config.AI_ENGINE_DEFAULT
  const engine = resolveEngine(engineName)
  // Gobernanza (CLAUDE.md) inyectada en el system; el Director no tiene skill de dominio.
  const { system } = await assembleReasoningSystem({
    rootPath: ctx.context.repository.rootPath, config: ctx.config,
    roleFraming: ROLE_FRAMING.director, logger: ctx.logger,
  })
  const eng = await engine.run(
    { system, prompt: directorPrompt(task, digest), worktreePath: ctx.context.repository.rootPath,
      model: candidates[0]?.model, maxCostUsd: candidates[0]?.maxCostUsd, allowedTools: 'Read,Glob,Grep', task },
    ctx,
  )
  return { dir: Direction.parse(extractJson(eng.result)), cost: eng.cost, sessionId: eng.sessionId, engine: engineName }
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
  const engineOverride = task.engine || task.inputs?.engine || null
  const { dir, cost, sessionId, engine: engineName } = await think(task, ctx, engineOverride, digest)

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

    // Nodo de CONSOLIDACIÓN: cierra el objetivo integrando el trabajo de los
    // especialistas. Depende de TODAS las hojas del plan (el ledger lo mantiene
    // en cola hasta que terminan). Lo asigna el propio Director (a sí mismo).
    let consolidationId = null
    if (routed.length > 0) {
      const consol = {
        type: 'direction_consolidate', title: `Cierre de dirección: ${task.title}`,
        goal: 'Integrar el trabajo de los especialistas y cerrar el objetivo para la Dirección.',
        capability_slug: 'direction.report', agent_slug: 'director-general',
        parent_task_id: task.id, causation_id: task.id, created_by: directorId,
        engine: task.engine || task.inputs?.engine || null,
        dedupe_key: `dir:${task.id}:__consolidate__`,
      }
      const { rows } = await client.query('select orq.enqueue_task($1::jsonb) as id', [JSON.stringify(consol)])
      consolidationId = rows[0].id
      await client.query('update orq.tasks set correlation_id=$1 where id=$2', [task.correlation_id, consolidationId])
      for (const id of Object.values(keyToId)) {
        await client.query('insert into orq.task_deps (task_id, depends_on_task_id) values ($1,$2) on conflict do nothing', [consolidationId, id])
        deps++
      }
    }

    await emitEvent(client, {
      tenantId: ctx.context.tenantId, subjectType: 'task', subjectId: task.id,
      type: 'direction.planned', actorId: directorId, projectId: ctx.context.projectId,
      correlationId: task.correlation_id, causationId: task.id,
      payload: { priorities: dir.priorities.length, subtasks: routed.length, deps, children: Object.values(keyToId), consolidation: consolidationId },
    })
    for (const ar of dir.approval_requests) {
      await emitEvent(client, {
        tenantId: ctx.context.tenantId, subjectType: 'task', subjectId: task.id,
        type: 'direction.approval_requested', actorId: directorId, projectId: ctx.context.projectId,
        correlationId: task.correlation_id, causationId: task.id, blastRadius: 'high',
        payload: ar,
      })
    }
    return { keyToId, deps, consolidationId }
  })

  ctx.logger.info('director: ciclo completado', { task_id: task.id, subtasks: routed.length, approvals: dir.approval_requests.length, consolidation: created.consolidationId })
  return {
    result: {
      engine: engineName, session_id: sessionId, cost,
      priorities: dir.priorities,
      assigned: routed.map((s) => ({ key: s.key, capability: s.capability_slug, agent: s.agent_slug })),
      children: created.keyToId,
      consolidation: created.consolidationId,
      recommendations: dir.recommendations,
      approval_requests: dir.approval_requests,
      executive_summary: dir.executive_summary,
    },
    evidence: { situation, digest },
  }
}
