// Handler del ESPECIALISTA IA (Etapa 4). El "trabajar" de la organización.
// Una tarea type='specialist' es trabajo de análisis/preparación (Nivel C) que el
// Director asignó a un especialista de dominio (CFO, Abogado, Contador, ...).
//   recibe tarea -> obtiene contexto (estado real + su skill de dominio) ->
//   razona (claude-cli READ-ONLY) -> registra evidencia -> emite evento -> responde.
// NO produce un diff (su salida es conocimiento estructurado, no código) y NO
// ejecuta acciones de aprobación humana (Nivel E): las deja como approval_requests.
// El trabajo de SOFTWARE sigue por el handler code_change (worktree + review).
import { z } from 'zod'
import { query, withTx } from '../lib/db.mjs'
import { emitEvent } from '../lib/events.mjs'
import { decide } from '../lib/policy.mjs'
import { route } from '../lib/router.mjs'
import { resolveEngine } from '../engines/index.mjs'
import { getCapability } from '../lib/registry.mjs'
import { assembleSituation, domainDigest } from '../lib/situation.mjs'
import { assembleReasoningSystem, ROLE_FRAMING } from '../lib/context-assembler.mjs'
import { makeGoogleClient } from '../lib/google.mjs'
import { driveReadTools } from '../lib/tools/drive.mjs'
import { makeToolExecutor } from '../lib/tool-executor.mjs'

/** Encola una operación que requiere aprobación humana (Nivel E) con su payload real. */
async function enqueuePendingOperation({ tenantId, taskId, agentSlug, capability_slug, account, target, payload }) {
  const { rows } = await query(
    `insert into orq.pending_operations (tenant_id, task_id, agent_slug, capability_slug, account, target, payload)
     values ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb) returning id`,
    [tenantId, taskId, agentSlug, capability_slug, account, JSON.stringify(target ?? {}), JSON.stringify(payload ?? {})],
  )
  return rows[0].id
}

const SpecialistResult = z.object({
  analysis: z.string().max(8000),
  findings: z.array(z.object({
    titulo: z.string(),
    detalle: z.string().max(2000).optional(),
    severidad: z.enum(['info', 'baja', 'media', 'alta']).default('info'),
  })).default([]),
  recommendations: z.array(z.string()).max(20).default([]),
  approval_requests: z.array(z.object({
    titulo: z.string(), motivo: z.string().optional(), capability_slug: z.string().optional(),
  })).default([]),
  evidence: z.array(z.string()).max(20).default([]),
  confidence: z.enum(['alta', 'media', 'baja']).default('media'),
})

function extractJson(text) {
  if (typeof text !== 'string') throw new Error('especialista: el engine no devolvió texto')
  const a = text.indexOf('{'); const b = text.lastIndexOf('}')
  if (a < 0 || b <= a) throw new Error('especialista: no se encontró JSON en la salida')
  return JSON.parse(text.slice(a, b + 1))
}

/**
 * Normaliza el `confidence` que devuelve el modelo a uno de los tres valores del
 * contrato (alta|media|baja) ANTES de validar con Zod. El modelo expresa la
 * confianza en lenguaje natural ("baja-media", "alta con reservas", frases largas)
 * y esas variantes hacían fallar el enum -> reintentos y hasta dead-letter (caso
 * real observado en el objetivo 431d5576). Regla: gana el PRIMER término reconocido
 * en el texto ("alta-media"->alta, "baja-media"->baja, "media-alta"->media,
 * "media con incertidumbre"->media). Ausente (null/undefined) -> undefined, para que
 * Zod aplique su default 'media' sin ruido. Desconocido (string sin ningún término
 * válido) -> warning + 'media'. No cambia el contrato: sólo sanea la entrada.
 */
export function normalizeConfidence(value, logger) {
  if (value == null) return undefined
  if (typeof value === 'string') {
    const lc = value.toLowerCase().trim()
    if (lc === 'alta' || lc === 'media' || lc === 'baja') return lc
    const m = lc.match(/alta|media|baja/)
    if (m) return m[0]
  }
  logger?.warn?.('especialista: confidence no reconocido; normalizado a media', { received: value })
  return 'media'
}

/** Parsea la salida del especialista saneando `confidence` antes de validar. */
export function parseSpecialist(raw, logger) {
  if (raw && typeof raw === 'object' && 'confidence' in raw) {
    const norm = normalizeConfidence(raw.confidence, logger)
    if (norm === undefined) delete raw.confidence // deja que Zod aplique el default
    else raw.confidence = norm
  }
  return SpecialistResult.parse(raw)
}

function specialistPrompt(task, agent, digest) {
  return (
    `Sos ${agent?.org_title || agent?.role || 'un especialista'} de Echegaray Construcciones, ` +
    `parte de una organización dirigida por el Director General IA. Trabajás SOLO en tu ` +
    `dominio; no coordinás a otros especialistas ni salís de tu especialidad. Tu conocimiento ` +
    `de dominio y la gobernanza están en tu contexto de sistema: aplicá ese criterio profesional.\n\n` +
    `ESTADO REAL (datos de la empresa; nunca inventes cifras que no estén acá):\n${digest}\n\n` +
    `TAREA QUE TE ASIGNÓ EL DIRECTOR:\n${task.goal || task.title}\n` +
    (task.success_criteria ? `\nCriterio de éxito: ${task.success_criteria}\n` : '') +
    `\nDevolvé ÚNICAMENTE un JSON con esta forma:\n` +
    `{"analysis":"tu análisis","findings":[{"titulo":"...","detalle":"...","severidad":"media"}],` +
    `"recommendations":["..."],"approval_requests":[{"titulo":"...","motivo":"...","capability_slug":"..."}],` +
    `"evidence":["qué miraste / qué te consta"],"confidence":"media"}\n` +
    `Reglas: SOLO análisis y preparación interna (Nivel A–C). Lo que tenga efecto ` +
    `económico/fiscal/laboral/legal/contractual REAL o comunicación externa (Nivel E) ` +
    `NO lo ejecutes: va en approval_requests. Distinguí hecho/dato/estimación; no muestres ` +
    `más precisión que la evidencia. Si falta un dato, decilo en findings.`
  )
}

async function reason(task, ctx, engineOverride, agent, digest, principalId) {
  if (engineOverride === 'fixture') {
    const canned = task.inputs?.canned_specialist
    if (canned) return { out: parseSpecialist(canned, ctx.logger), cost: { usd: 0 }, tokens: null, sessionId: null, engine: 'fixture' }
    return {
      out: SpecialistResult.parse({
        analysis: `Análisis determinístico (${agent?.org_title || task.agent_slug}) del objetivo: ${task.title}.`,
        findings: [{ titulo: 'Estado leído', detalle: 'Digest de dominio procesado.', severidad: 'info' }],
        recommendations: ['Confirmar con datos conciliados antes de decidir.'],
        approval_requests: [],
        evidence: ['digest situacional'],
        confidence: 'media',
      }),
      cost: { usd: 0 }, tokens: null, sessionId: null, engine: 'fixture',
    }
  }
  const { candidates } = await route({ tenantId: ctx.context.tenantId, capabilitySlug: task.capability_slug, agentSlug: task.agent_slug, preferredModel: task.inputs?.model })
  const engineName = engineOverride || candidates[0]?.engine || ctx.config.AI_ENGINE_DEFAULT
  const engine = resolveEngine(engineName)
  // Gobernanza + SKILL.md del dominio inyectadas en el system (reemplaza el Read del CLI).
  const { system } = await assembleReasoningSystem({
    rootPath: ctx.context.repository.rootPath, config: ctx.config,
    roleFraming: ROLE_FRAMING.specialist, contextRef: agent?.context_ref, logger: ctx.logger,
  })

  // Tool-use SÓLO sobre el Reasoner (anthropic-api). El especialista gana MANOS de
  // lectura sobre Drive: cada tool pasa por policy (decide) en el ejecutor. Si falta
  // la credencial de Google, la tool devuelve {error} y el modelo sigue (degrada, no rompe).
  let tools
  let toolExecutor
  let toolsHint = ''
  if (engineName === 'anthropic-api' && principalId) {
    const google = makeGoogleClient({ config: ctx.config })
    const registry = driveReadTools(google)
    toolExecutor = makeToolExecutor({
      decide, tools: registry, principalId, logger: ctx.logger,
      enqueue: (op) => enqueuePendingOperation({ ...op, tenantId: ctx.context.tenantId, taskId: task.id, agentSlug: task.agent_slug }),
    })
    tools = Object.values(registry).map((t) => t.schema)
    toolsHint = '\n\nHERRAMIENTAS: tenés `drive_read` para leer Sheets reales de la empresa (caja, P&L, presupuestos). ' +
      'Si te falta un dato concreto (ej. el saldo de caja real vive en el Sheet "Flujo de Caja - Cash Flow"), ' +
      'LEELO con la herramienta en vez de responder "desconocido". Declará la fuente y la fecha de lectura en evidence.'
  }

  const eng = await engine.run(
    {
      system,
      prompt: specialistPrompt(task, agent, digest) + toolsHint,
      worktreePath: ctx.context.repository.rootPath,
      model: candidates[0]?.model,
      maxCostUsd: candidates[0]?.maxCostUsd,
      allowedTools: 'Read,Glob,Grep',
      task,
      ...(tools ? { tools, toolExecutor, agentSlug: task.agent_slug } : {}),
    },
    ctx,
  )
  return { out: parseSpecialist(extractJson(eng.result), ctx.logger), cost: eng.cost, tokens: eng.tokens, sessionId: eng.sessionId, engine: engineName }
}

async function specialistPrincipalId(agentSlug) {
  const { rows } = await query("select id from orq.principals where slug = $1", ['agent:' + agentSlug])
  return rows[0]?.id ?? null
}

export async function specialistHandler(task, ctx) {
  if (!task.agent_slug) throw new Error('especialista: la tarea no tiene agent_slug (¿la asignó el Director?)')
  const capSlug = task.capability_slug || 'read.analyze'
  const principalId = (await specialistPrincipalId(task.agent_slug)) || ctx.context.systemPrincipalId

  // Policy gate: el especialista actúa dentro de su clearance (análisis = auto).
  const dispo = await decide(capSlug, principalId, task.blast_override)
  if (dispo === 'forbidden') throw new Error(`especialista: ${capSlug} prohibido por policy`)
  if (dispo === 'requires_approval') throw new Error(`especialista: ${capSlug} requiere aprobación humana (no autónomo)`)

  const cap = await getCapability(capSlug)
  const agent = ctx.context.agent || (await query(
    'select a.slug, a.role, a.org_title, a.context_ref from orq.agents a where a.slug=$1', [task.agent_slug],
  )).rows[0]

  const situation = await assembleSituation()
  const digest = domainDigest(situation, cap?.domain || 'core')
  const engineOverride = task.engine || task.inputs?.engine || null
  const { out, cost, tokens, sessionId, engine: engineName } = await reason(task, ctx, engineOverride, agent, digest, principalId)

  await withTx(async (client) => {
    await emitEvent(client, {
      tenantId: ctx.context.tenantId, subjectType: 'task', subjectId: task.id,
      type: 'specialist.completed', actorId: principalId, projectId: ctx.context.projectId,
      correlationId: task.correlation_id, causationId: task.id,
      payload: {
        agent: task.agent_slug, capability: capSlug,
        findings: out.findings.length, recommendations: out.recommendations.length,
        approvals: out.approval_requests.length, confidence: out.confidence,
      },
    })
    for (const ar of out.approval_requests) {
      await emitEvent(client, {
        tenantId: ctx.context.tenantId, subjectType: 'task', subjectId: task.id,
        type: 'specialist.approval_requested', actorId: principalId, projectId: ctx.context.projectId,
        correlationId: task.correlation_id, causationId: task.id, blastRadius: 'high', payload: ar,
      })
    }
  })

  ctx.logger.info('especialista: trabajo completado', { task_id: task.id, agent: task.agent_slug, findings: out.findings.length, approvals: out.approval_requests.length })
  return {
    result: {
      engine: engineName, session_id: sessionId, cost, tokens,
      agent: task.agent_slug, org_title: agent?.org_title ?? null, capability: capSlug,
      analysis: out.analysis, findings: out.findings, recommendations: out.recommendations,
      approval_requests: out.approval_requests, confidence: out.confidence,
    },
    evidence: { evidence: out.evidence, digest, situation_generated_at: situation.generated_at },
  }
}
