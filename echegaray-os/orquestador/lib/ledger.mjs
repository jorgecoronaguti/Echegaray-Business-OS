// Port del Work Ledger: envoltura fina sobre las funciones SQL (que contienen la
// lógica transaccional + outbox). El worker habla con este port, no con SQL crudo.
import { query, withTx } from './db.mjs'

/** Encola una tarea (idempotente por dedupe_key). Devuelve su id. */
export async function enqueueTask(task) {
  const { rows } = await query('select orq.enqueue_task($1::jsonb) as id', [JSON.stringify(task)])
  return rows[0].id
}

/** Reclama UNA tarea elegible de una LANE (FOR UPDATE SKIP LOCKED). null si no hay.
 *  `queue` default 'default' = worker general (comportamiento previo, retrocompatible);
 *  'comunicacion' = worker de comunicación (PR-4.1, aislamiento por lane). */
export async function claimTask(workerId, leaseSeconds, queue = 'default') {
  const { rows } = await query('select * from orq.claim_task($1, $2, $3)', [workerId, leaseSeconds, queue])
  return rows[0] ?? null
}

/** Extiende el lease. Devuelve false si el worker ya no es dueño (perdió la tarea). */
export async function heartbeat(taskId, workerId, leaseSeconds) {
  const { rows } = await query('select orq.heartbeat_task($1, $2, $3) as ok', [taskId, workerId, leaseSeconds])
  return rows[0].ok === true
}

/** Transición de estado validada + evento (mismo txn en la función SQL). */
export async function transition(taskId, workerId, toState, patch = {}) {
  const { rows } = await query('select state from orq.transition_task($1, $2, $3, $4::jsonb)', [
    taskId,
    workerId,
    toState,
    JSON.stringify(patch),
  ])
  return rows[0].state
}

/** Parkea una tarea IA (razonador sin crédito): la devuelve a 'retrying' con run_after futuro SIN
 *  consumir intento. Se reanuda sola cuando vuelve el crédito, en vez de ir a dead_letter. */
export async function parkTask(taskId, workerId, reason = 'razonador sin crédito', delaySeconds = 600) {
  const { rows } = await query('select orq.park_task($1, $2, $3, $4) as state', [
    taskId, workerId, String(reason).slice(0, 500), delaySeconds,
  ])
  return rows[0].state
}

/** Marca fallo: reintenta con backoff o va a dead_letter. */
export async function failTask(taskId, workerId, error, backoffMs) {
  const { rows } = await query('select state from orq.fail_task($1, $2, $3, $4)', [
    taskId,
    workerId,
    String(error).slice(0, 4000),
    backoffMs,
  ])
  return rows[0].state
}

/** ¿El intento ANTERIOR de esta tarea se cortó por lease vencido? Un intento en 'timeout' no dice
 *  que el trabajo falló: dice que NO SABEMOS si llegó a completarse (el worker dejó de latir a mitad).
 *  Para un tipo con efecto externo eso NO habilita un reintento a ciegas — ver ciclo-tarea.mjs. */
export async function intentoPrevioInterrumpido(taskId, attempt) {
  const { rows } = await query(
    `select state from orq.task_attempts
      where task_id = $1 and attempt_no < $2 order by attempt_no desc limit 1`,
    [taskId, attempt],
  )
  return rows[0]?.state === 'timeout'
}

/** Tareas que TERMINARON EN FALLO con su motivo — el registro consultable de lo que murió.
 *  `cancelled` sin error es una cancelación de política (replanificación) y no cuenta como fallo. */
export async function tareasEnFallo({ horas = 24, limite = 50 } = {}) {
  const { rows } = await query(
    `select id, type, title, state, attempt, max_attempts, error, correlation_id, updated_at,
            inputs->>'channel_id' as channel_id
       from orq.tasks
      where state in ('dead_letter','cancelled') and error is not null
        and updated_at > now() - make_interval(hours => $1)
      order by updated_at desc limit $2`,
    [horas, limite],
  )
  return rows
}

/** Recupera trabajo abandonado (leases vencidos). Devuelve las tareas recuperadas. */
export async function reapExpiredLeases() {
  const { rows } = await query('select id, state from orq.reap_expired_leases()')
  return rows
}

/** Snapshot de salud de la cola. */
export async function queueSnapshot() {
  const { rows } = await query(
    `select state, count(*)::int as n from orq.tasks group by state order by state`,
  )
  return rows
}

export { withTx }
