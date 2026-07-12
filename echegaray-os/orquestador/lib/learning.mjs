// Aprendizaje y Post-Mortem (Fase 4). El OS aprende de su propia operación sin
// requerir el cierre de una obra: cada resultado terminal puede generar
// conocimiento. Se materializa como EVENTOS (append-only, consultables), no como
// escritura autónoma de reglas: la promoción a regla (clase D/E) exige validación
// humana proporcional al riesgo (política del CLAUDE.md raíz).
//
// Clasificación (CLAUDE.md): A observación aislada · B recurrencia · C patrón
// probable · D conocimiento validado · E regla operativa aprobada. Por diseño,
// la captura autónoma nunca supera 'A' o 'B' (recurrencia detectable en datos).
import { withTx } from './db.mjs'
import { emitEvent } from './events.mjs'

/** Clasifica la causa probable de un fallo terminal a partir del error/intentos. */
export function classifyFailure(task, errorText) {
  const e = String(errorText || task.error || '').toLowerCase()
  if (e.includes('timeout')) return { cause: 'timeout', hint: 'subir ENGINE_TIMEOUT_MS o dividir la tarea' }
  if (e.includes('review no pasó') || e.includes('rutas_protegidas')) return { cause: 'review_gate', hint: 'ajustar alcance o pedir aprobación humana' }
  if (e.includes('policy')) return { cause: 'policy_block', hint: 'capacidad no autorizada; requiere clearance/aprobación' }
  if (e.includes('branch') || e.includes('worktree') || e.includes('git')) return { cause: 'workspace', hint: 'colisión/estado de worktree' }
  if (e.includes('claude') || e.includes('engine') || e.includes('exit')) return { cause: 'engine_error', hint: 'fallo del motor; probar modelo de fallback' }
  return { cause: 'unknown', hint: 'revisar logs del intento' }
}

/**
 * Post-mortem de una tarea que terminó en dead_letter. Emite 'task.postmortem'
 * con causa + intentos + recomendación. Nivel B (analizar), sin efecto externo.
 */
export async function capturePostMortem(task, ctx, errorText) {
  const { cause, hint } = classifyFailure(task, errorText)
  await withTx(async (client) => {
    const { rows } = await client.query(
      `select attempt_no, state, error, engine, cost
         from orq.task_attempts where task_id = $1 order by attempt_no`,
      [task.id],
    )
    await emitEvent(client, {
      tenantId: ctx.context.tenantId,
      subjectType: 'task',
      subjectId: task.id,
      type: 'task.postmortem',
      actorId: ctx.context.systemPrincipalId,
      projectId: ctx.context.projectId,
      correlationId: task.correlation_id,
      causationId: task.id,
      payload: {
        cause, recommendation: hint,
        attempts: rows.length,
        capability: task.capability_slug ?? null,
        agent: task.agent_slug ?? null,
        history: rows.map((r) => ({ n: r.attempt_no, state: r.state, engine: r.engine, cost: r.cost, error: (r.error || '').slice(0, 300) })),
      },
    })
  })
  ctx.logger.info('post-mortem registrado', { task_id: task.id, cause })
  return { cause, hint }
}

/**
 * Captura un aprendizaje reusable como evento 'learning.captured'. `klass` en
 * A|B (captura autónoma); C+ requiere validación humana y no se emite acá.
 */
export async function captureLearning(ctx, { subjectId, domain, statement, evidence, klass = 'A' }) {
  if (!['A', 'B'].includes(klass)) throw new Error(`captureLearning autónomo limitado a clase A|B (pedido: ${klass})`)
  await withTx(async (client) => {
    await emitEvent(client, {
      tenantId: ctx.context.tenantId,
      subjectType: 'task',
      subjectId: subjectId ?? null,
      type: 'learning.captured',
      actorId: ctx.context.systemPrincipalId,
      projectId: ctx.context.projectId,
      payload: { class: klass, domain, statement, evidence },
    })
  })
  ctx.logger.info('aprendizaje capturado', { klass, domain })
}

/**
 * Detecta RECURRENCIA (clase B) de causas de fallo en la ventana reciente: si una
 * misma causa se repite >= umbral, lo eleva de A a B. Lee el Event Log (fuente).
 */
export async function detectRecurrence(ctx, cause, { windowHours = 24, threshold = 3 } = {}) {
  const { rows } = await withTx(async (client) =>
    client.query(
      `select count(*)::int n from orq.events
        where type = 'task.postmortem' and payload->>'cause' = $1
          and created_at > now() - make_interval(hours => $2)`,
      [cause, windowHours],
    ).then((r) => ({ rows: r.rows })),
  )
  const n = rows[0]?.n ?? 0
  return { recurrent: n >= threshold, count: n, klass: n >= threshold ? 'B' : 'A' }
}
