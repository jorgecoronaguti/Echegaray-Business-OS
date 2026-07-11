// Emisión de eventos (Transactional Outbox — D1). Se invoca SIEMPRE con el
// `client` de una transacción en curso, junto al cambio de estado que lo motiva:
// estado y evento se persisten atómicamente o no se persisten.
//
// Envoltura fina sobre la función SQL orq.emit_event: la lógica de append-only,
// defaults de correlation_id y validación vive en la base (portable, un solo lugar).

/**
 * @param {import('pg').PoolClient} client  cliente dentro de una transacción abierta
 * @param {object} e
 * @param {string} e.tenantId
 * @param {string} e.subjectType   'task' | 'backlog_autonomo' | 'acciones' | ...
 * @param {string|null} e.subjectId
 * @param {string} e.type          nombre del evento, p.ej. 'task.claimed'
 * @param {string|null} [e.actorId]
 * @param {string|null} [e.projectId]
 * @param {string|null} [e.correlationId]
 * @param {string|null} [e.causationId]
 * @param {string|null} [e.blastRadius]
 * @param {object} [e.payload]
 * @returns {Promise<string>} id del evento
 */
export async function emitEvent(client, e) {
  const { rows } = await client.query(
    `select orq.emit_event($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb) as id`,
    [
      e.tenantId,
      e.subjectType,
      e.subjectId ?? null,
      e.type,
      e.actorId ?? null,
      e.projectId ?? null,
      e.correlationId ?? null,
      e.causationId ?? null,
      e.blastRadius ?? null,
      JSON.stringify(e.payload ?? {}),
    ],
  )
  return rows[0].id
}
