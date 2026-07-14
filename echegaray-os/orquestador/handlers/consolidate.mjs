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
import { assembleReasoningSystem, ROLE_FRAMING } from '../lib/context-assembler.mjs'

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
    // Con la dependencia por estado TERMINAL, un especialista muerto ya no bloquea
    // la consolidación: acá se contabiliza para cerrar en 'parcial' sin ocultarlo.
    if (['dead_letter', 'failed', 'cancelled', 'rejected'].includes(r.state)) failed++
    const res = r.result || {}
    specialists.push({
      agent: r.agent_slug, org_title: res.org_title ?? null, title: r.title, state: r.state,
      confidence: res.confidence ?? null,
      recommendations: Array.isArray(res.recommendations) ? res.recommendations : [],
      findings: Array.isArray(res.findings) ? res.findings.length : 0,
      findingsList: Array.isArray(res.findings) ? res.findings : [], // para auto-acción Nivel D
    })
    for (const ar of (Array.isArray(res.approval_requests) ? res.approval_requests : [])) openApprovals.push({ ...ar, from: r.agent_slug })
  }
  return { specialists, openApprovals, succeeded, failed, total: rows.length }
}

// ── AUTO-ACCIÓN NIVEL D (romper el muro N6→N7) ──────────────────────────────
// Al cerrar un objetivo, los hallazgos MATERIALES de los especialistas se
// convierten SOLOS en Acciones con seguimiento (interno, reversible). La acción es
// un REGISTRO de trabajo pendiente (estado='pendiente', sin responsable → un humano
// lo asigna): su RESOLUCIÓN real (pagar, renovar, firmar) sigue siendo Nivel E. Se
// activa con ORQ_AUTO_ACTIONS=on (apagado → comportamiento A–C previo). Deduplica
// contra acciones abiertas y contra sí mismo; tope por objetivo para no inundar.
const AUTO_ACTIONS = String(process.env.ORQ_AUTO_ACTIONS ?? 'off').toLowerCase() === 'on'
const MAX_AUTO_ACTIONS = Math.max(1, Number(process.env.ORQ_AUTO_ACTIONS_MAX ?? 8))

// agent_slug → area válida de public.acciones (constraint acciones_area_check).
const AGENT_AREA = {
  cfo: 'administracion_finanzas', contador: 'administracion_finanzas', fiscal: 'administracion_finanzas', administracion: 'administracion_finanzas',
  ingenieria: 'obras_produccion', arquitecto: 'obras_produccion', 'ingeniero-civil': 'obras_produccion', calidad: 'obras_produccion', 'jefe-obra': 'obras_produccion',
  compras: 'compras_abastecimiento', equipos: 'compras_abastecimiento',
  rrhh: 'personas_productividad', seguridad: 'personas_productividad',
  comercial: 'comercial_presupuestacion', presupuestador: 'comercial_presupuestacion',
  abogado: 'direccion', 'continuidad-datos': 'direccion',
}
// severidad del especialista (info|baja|media|alta) → severidad de acciones (critica|alta|media|informativa).
const SEV_MAP = { alta: 'alta', media: 'media', baja: 'informativa', info: 'informativa' }
const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 120)

/**
 * Crea Acciones de seguimiento a partir de los hallazgos materiales (Nivel D).
 * Idempotente: no duplica contra acciones ya abiertas ni dentro del mismo lote.
 * @returns {Promise<{created:number, titles:string[]}>}
 */
async function autoCreateActions(client, objectiveId, agg) {
  if (!AUTO_ACTIONS) return { created: 0, titles: [] }
  // candidatos: hallazgos alta/media de especialistas que terminaron OK.
  const candidatos = []
  for (const s of agg.specialists) {
    if (s.state !== 'succeeded') continue
    const area = AGENT_AREA[s.agent] || 'direccion'
    for (const f of s.findingsList) {
      const sev = SEV_MAP[String(f?.severidad || '').toLowerCase()]
      if (sev !== 'alta' && sev !== 'media') continue // sólo material
      const titulo = String(f?.titulo || '').trim().slice(0, 200)
      if (!titulo) continue
      candidatos.push({ titulo, causa: String(f?.detalle || '').slice(0, 1000), area, sev, agent: s.org_title || s.agent, weight: sev === 'alta' ? 0 : 1 })
    }
  }
  if (!candidatos.length) return { created: 0, titles: [] }

  // dedup contra acciones abiertas existentes (por título normalizado).
  const { rows: abiertas } = await client.query(
    "select titulo from public.acciones where estado in ('pendiente','en_curso')")
  const vistos = new Set(abiertas.map((r) => norm(r.titulo)))

  candidatos.sort((a, b) => a.weight - b.weight) // alta primero
  const aCrear = []
  for (const c of candidatos) {
    const k = norm(c.titulo)
    if (vistos.has(k)) continue
    vistos.add(k)
    aCrear.push(c)
    if (aCrear.length >= MAX_AUTO_ACTIONS) break
  }
  if (!aCrear.length) return { created: 0, titles: [] }

  const titles = []
  for (let i = 0; i < aCrear.length; i++) {
    const c = aCrear[i]
    await client.query(
      `insert into public.acciones (origen, alerta_origen_id, titulo, causa, area, severidad, estado)
       values ('sistema', $1, $2, $3, $4, $5, 'pendiente')`,
      [`auto:${objectiveId}:${i}`, `[${c.agent}] ${c.titulo}`.slice(0, 200), c.causa, c.area, c.sev],
    )
    titles.push(c.titulo)
  }
  return { created: titles.length, titles }
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

async function synth(task, ctx, engineOverride, objective, agg) {
  if (engineOverride === 'fixture') {
    return {
      closure: Closure.parse({
        closure_summary: `Cierre determinístico: ${agg.succeeded}/${agg.total} especialistas completaron; ${agg.openApprovals.length} aprobaciones pendientes.`,
        objective_status: agg.failed > 0 ? 'parcial' : 'cumplido',
        key_points: agg.specialists.flatMap((s) => s.recommendations.slice(0, 1)).slice(0, 6),
      }),
      cost: { usd: 0 }, sessionId: null, engine: 'fixture',
    }
  }
  const { candidates } = await route({ tenantId: ctx.context.tenantId, capabilitySlug: 'direction.report', preferredModel: task.inputs?.model })
  const engineName = engineOverride || candidates[0]?.engine || ctx.config.AI_ENGINE_DEFAULT
  const engine = resolveEngine(engineName)
  const { system } = await assembleReasoningSystem({
    rootPath: ctx.context.repository.rootPath, config: ctx.config,
    roleFraming: ROLE_FRAMING.consolidation, logger: ctx.logger,
  })
  const eng = await engine.run(
    { system, prompt: consolidationPrompt(objective, agg), worktreePath: ctx.context.repository.rootPath,
      model: candidates[0]?.model, maxCostUsd: candidates[0]?.maxCostUsd, allowedTools: 'Read,Glob,Grep', task },
    ctx,
  )
  return { closure: Closure.parse(extractJson(eng.result)), cost: eng.cost, sessionId: eng.sessionId, engine: engineName }
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

  const engineOverride = task.engine || task.inputs?.engine || null
  const { closure, cost, sessionId, engine: engineName } = await synth(task, ctx, engineOverride, objective, agg)

  const autoActions = await withTx(async (client) => {
    // Nivel D: los hallazgos materiales se vuelven Acciones con seguimiento (si está
    // habilitado). Atómico con el cierre: o se cierra y se crean, o nada.
    const aa = await autoCreateActions(client, objectiveId, agg)
    await emitEvent(client, {
      tenantId: ctx.context.tenantId, subjectType: 'task', subjectId: objectiveId,
      type: 'direction.completed', actorId: directorId, projectId: ctx.context.projectId,
      correlationId: task.correlation_id, causationId: task.id,
      payload: {
        objective_status: closure.objective_status,
        specialists_ok: agg.succeeded, specialists_total: agg.total,
        open_approvals: agg.openApprovals.length,
        auto_actions: aa.created,
      },
    })
    if (aa.created > 0) {
      await emitEvent(client, {
        tenantId: ctx.context.tenantId, subjectType: 'task', subjectId: objectiveId,
        type: 'direction.auto_actions_created', actorId: directorId, projectId: ctx.context.projectId,
        correlationId: task.correlation_id, causationId: task.id, blastRadius: 'low',
        payload: { count: aa.created, titles: aa.titles },
      })
    }
    return aa
  })

  ctx.logger.info('consolidación: objetivo cerrado', { objective_id: objectiveId, status: closure.objective_status, ok: agg.succeeded, total: agg.total, auto_actions: autoActions.created })
  return {
    result: {
      engine: engineName, session_id: sessionId, cost,
      objective_id: objectiveId,
      objective_status: closure.objective_status,
      closure_summary: closure.closure_summary,
      key_points: closure.key_points,
      specialists: agg.specialists,
      open_approval_requests: agg.openApprovals,
      auto_actions_created: autoActions.created,
      counts: { succeeded: agg.succeeded, failed: agg.failed, total: agg.total },
    },
    evidence: { gathered: agg.total },
  }
}
