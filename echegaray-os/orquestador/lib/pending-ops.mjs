// Cola de operaciones que requieren aprobación humana (Nivel E). Fuente única de
// verdad: orq.pending_operations (PRP-014). Este lib concentra el enqueue (antes
// duplicado en handlers/specialist.mjs), el listado y la decisión humana — para que
// el motor interactivo y los handlers usen exactamente el mismo camino (DRY).
//
// Flujo del lazo: el tool-executor encola (enqueuePendingOperation) → un humano lista
// (listPendingOperations) y decide (decidePendingOperation): aprobar marca 'approved'
// Y ENCOLA una tarea 'operation_execute' en el worker (el que realmente escribe en
// Drive, idempotente). Rechazar marca 'rejected' sin efecto.
import { query } from './db.mjs'
import { enqueueTask } from './ledger.mjs'

/** Encola una operación pendiente con su payload/borrador concreto. Devuelve su id. */
export async function enqueuePendingOperation({ tenantId, taskId = null, agentSlug, capability_slug, account, target, payload }) {
  const { rows } = await query(
    `insert into orq.pending_operations (tenant_id, task_id, agent_slug, capability_slug, account, target, payload)
     values ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb) returning id`,
    [tenantId, taskId, agentSlug, capability_slug, account, JSON.stringify(target ?? {}), JSON.stringify(payload ?? {})],
  )
  return rows[0].id
}

/** Lista operaciones por estado (default: las que esperan aprobación), más nuevas primero. */
export async function listPendingOperations({ status = 'awaiting_approval', limit = 50 } = {}) {
  const { rows } = await query(
    `select id, agent_slug, capability_slug, account, target, payload, status, result, error, created_at, decided_at
       from orq.pending_operations
      where ($1::text is null or status = $1)
      order by created_at desc
      limit $2`,
    [status, limit],
  )
  return rows
}

/** Estado de UNA operación por id — para que la extensión reporte el desenlace
 *  ('executed'/'failed') después de aprobar, en vez de fallar en silencio. */
export async function getPendingOperationById(id) {
  const { rows } = await query(
    `select id, status, result, error, payload->>'tool' as tool from orq.pending_operations where id = $1`,
    [id],
  )
  return rows[0] || null
}

/**
 * Decisión humana sobre una operación pendiente. `approve` la marca 'approved' y
 * ENCOLA la tarea de ejecución (idempotente por dedupe_key `opexec:<id>`, así aprobar
 * dos veces no duplica el efecto). `reject` la marca 'rejected'. Solo actúa sobre
 * operaciones que todavía están 'awaiting_approval'.
 */
export async function decidePendingOperation({ id, action, note = null, decidedBy = null }) {
  const to = action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : null
  if (!to) throw new Error(`acción desconocida: ${action} (usar approve|reject)`)

  const { rows } = await query(
    `update orq.pending_operations
        set status = $2, decided_note = $3, decided_by = $4, decided_at = now(), updated_at = now()
      where id = $1 and status = 'awaiting_approval'
      returning id, tenant_id, capability_slug, account, target, payload, status`,
    [id, to, note, decidedBy],
  )
  if (!rows[0]) throw new Error('la operación no existe o ya no está pendiente')
  const op = rows[0]

  if (to === 'approved') {
    const execTaskId = await enqueueTask({
      type: 'operation_execute',
      title: `Ejecutar operación aprobada (${op.capability_slug})`,
      dedupe_key: `opexec:${op.id}`,
      inputs: { pending_operation_id: op.id },
    })
    return { operation: op, exec_task_id: execTaskId }
  }
  return { operation: op }
}
