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
import { skillsForCapability } from '../lib/skill-map.mjs'
import { makeGoogleClient } from '../lib/google.mjs'
import { driveReadTools } from '../lib/tools/drive.mjs'
import { obraTools } from '../lib/tools/obra.mjs'
import { workspaceTools } from '../lib/tools/workspace.mjs'
import { webSearchTools } from '../lib/tools/web.mjs'
import { makeToolExecutor } from '../lib/tool-executor.mjs'
import { enqueuePendingOperation } from '../lib/pending-ops.mjs'

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
    `ESTADO DEL OS — índice PARCIAL de Supabase + CATÁLOGO de fuentes reales. Los conteos son ` +
    `incompletos (la verdad está en Drive). Nunca inventes; si el dato no está o el índice es parcial, ` +
    `LEÉ la fuente real con drive_read (por su file_id del catálogo) o navegá con drive_list ANTES de responder:\n${digest}\n\n` +
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
  // Gobernanza + skills de dominio inyectadas en el system. "Según la tarea": el
  // conjunto de skills lo decide la CAPACIDAD de la tarea (skill-map), no una skill
  // fija del agente. Cubre los 14 dominios; fallback al context_ref legacy si no hay mapeo.
  const skillNames = skillsForCapability(task.capability_slug)
  const { system, skillsLoaded } = await assembleReasoningSystem({
    rootPath: ctx.context.repository.rootPath, config: ctx.config,
    roleFraming: ROLE_FRAMING.specialist,
    skillNames: skillNames.length ? skillNames : undefined,
    contextRef: skillNames.length ? undefined : agent?.context_ref,
    logger: ctx.logger,
  })
  if (ctx.logger) ctx.logger.info('especialista: conocimiento cargado', { capability: task.capability_slug, skills: skillsLoaded })

  // Tool-use SÓLO sobre el Reasoner (anthropic-api). El especialista gana MANOS de
  // lectura sobre Drive: cada tool pasa por policy (decide) en el ejecutor. Si falta
  // la credencial de Google, la tool devuelve {error} y el modelo sigue (degrada, no rompe).
  let tools
  let toolExecutor
  let toolsHint = ''
  if (engineName === 'anthropic-api' && principalId) {
    const google = makeGoogleClient({ config: ctx.config })
    // Cuadro económico por obra (números reales de rentabilidad/margen/desvío) + búsqueda
    // en internet (precios/convenios): read-only, para que el CFO/jefe de obra/presupuestador
    // razonen sobre datos reales en vez de suponer. Misma fuente que el chat (sin duplicar).
    const registry = { ...driveReadTools(google), ...obraTools(), ...webSearchTools(), ...workspaceTools({ config: ctx.config }) }
    // Búsqueda sobre el índice COMPLETO de administracion (~1.658 archivos) en
    // public.drive_index: encontrar un archivo por nombre sin navegar carpeta por
    // carpeta. Capacidad drive.read (lectura/auto). Usa la DB del worker.
    registry['drive.find'] = {
      capability: 'drive.read',
      account: 'ecsas',
      schema: {
        name: 'drive_find',
        description:
          'Busca archivos por nombre en el índice COMPLETO de la carpeta administración (~1.658 archivos: legajos, facturas, presupuestos, contratos, etc.). Devuelve nombre, ruta, tipo y file_id. Usalo para encontrar un archivo puntual sin navegar carpeta por carpeta — ej. "legajo Aballay", "factura Corralon", "presupuesto obra X". Después leé el que sirva con drive_read.',
        input_schema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'texto a buscar dentro del nombre del archivo' },
            solo_carpetas: { type: 'boolean', description: 'true para buscar solo carpetas' },
          },
          required: ['query'],
        },
      },
      async run(input) {
        const term = String(input?.query ?? '').trim()
        if (!term) return { error: 'falta query' }
        const { rows } = await query(
          `select name, path, tipo, drive_file_id from public.drive_index
             where name ilike $1 ${input?.solo_carpetas ? 'and is_folder = true' : ''}
             order by is_folder desc, name limit 40`,
          [`%${term}%`],
        )
        return { query: term, count: rows.length, items: rows.map((r) => ({ name: r.name, ruta: r.path, tipo: r.tipo, file_id: r.drive_file_id })) }
      },
    }
    toolExecutor = makeToolExecutor({
      decide, tools: registry, principalId, logger: ctx.logger,
      enqueue: (op) => enqueuePendingOperation({ ...op, tenantId: ctx.context.tenantId, taskId: task.id, agentSlug: task.agent_slug }),
    })
    tools = Object.values(registry).map((t) => t.schema)
    toolsHint = '\n\nHERRAMIENTAS (Drive real de la empresa — usalas SIEMPRE antes de responder):\n' +
      '- `drive_find`: busca un archivo por nombre en el índice completo (~1.658 archivos: legajos, facturas, presupuestos…). Devuelve su file_id.\n' +
      '- `drive_list`: lista el contenido de una carpeta (ej. "administracion", "PRESUPUESTOS", legajos). Para ver qué hay y qué falta.\n' +
      '- `drive_read`: lee un Sheet real por file_id (ej. "Flujo de Caja - Cash Flow", "avance_obra.xlsx"). Usalo en vez de responder "desconocido".\n' +
      '- `cuadro_economico_obra`: números REALES de una obra (contratado, presupuesto, costo real, margen, desvío). Usalo ANTES de opinar sobre rentabilidad/margen.\n' +
      '- `web_search`: busca en internet precios de materiales, jornales/convenios vigentes, normativa. Los precios son referencia a verificar.\n' +
      'El índice de Supabase es PARCIAL: buscá/navegá/leé la fuente real antes de opinar. Declará qué miraste (archivo y fecha) en evidence. ' +
      'Para mejoras de ORDEN documental, primero listá/buscá y después proponé — mover/renombrar/eliminar NO lo hacés vos: va como approval_requests.'
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
