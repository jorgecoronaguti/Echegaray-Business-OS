// PR-4 · Ingesta del lado del Business OS — el `emitEvent` que el puente del
// Communication Service tiene inyectado (M10). Es el ÚNICO punto donde un evento
// de comunicación entra al Work Fabric, y lo hace por el MECANISMO OFICIAL
// (orq.emit_event + orq.enqueue_task), nunca por escritura directa a tablas
// internas del Work Fabric.
//
// Deduplicación end-to-end por `comm_event_id`: la tarea del Work Fabric usa
// `dedupe_key = comm:<comm_event_id>`, que orq.enqueue_task ya trata como
// idempotente. Antes de escribir nada se verifica esa clave, así el evento del
// OS (orq.events) tampoco se duplica en un replay/reintento.
//
// Contrato de flujo:
//   comm event entrante → PuenteOrqEvents.publicarHaciaOS → aEventoOrq → ESTE emitEvent
//     → (dedup) → orq.emit_event('comunicacion.<tipo>') + orq.enqueue_task('comunicacion.responder')
// La tarea la procesa un handler REAL del Work Fabric (handlers/comunicacion.mjs).

/**
 * Crea el `emitEvent` inyectable para PuenteOrqEvents.
 * @param {{query:Function, withTx:Function}} port  pool del OS (mismo del Work Fabric)
 * @returns {(params:object) => Promise<{ok:boolean, task_id?:string, duplicado?:boolean}>}
 */
export function crearEmitEventOS(port) {
  let ids = null
  const resolverIds = async () => {
    if (ids) return ids
    const { rows } = await port.query(
      `select
         (select id from orq.tenants  where slug='echegaray')      as tenant_id,
         (select id from orq.projects where slug='echegaray-os')   as project_id`)
    ids = rows[0]
    if (!ids?.tenant_id) throw new Error('ingesta-os: falta el tenant echegaray en orq')
    return ids
  }

  return async function emitEvent(params) {
    const p = params.payload ?? {}
    const commId = p.comm_event_id
    if (!commId) throw new Error('ingesta-os: falta comm_event_id')
    const dedupeKey = `comm:${commId}`
    const { tenant_id, project_id } = await resolverIds()

    return port.withTx(async (client) => {
      // Dedup end-to-end: si ya existe la tarea de esta comunicación, no re-ingerimos.
      const ya = await client.query('select id from orq.tasks where dedupe_key = $1', [dedupeKey])
      if (ya.rows.length) return { ok: true, duplicado: true, task_id: ya.rows[0].id }

      // 1) Registrar el HECHO de comunicación en orq.events (auditable, oficial).
      await client.query(
        'select orq.emit_event($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)',
        [tenant_id, params.subject_type, null, params.type, null, project_id,
          params.correlation_id, params.causation_id, 'low', JSON.stringify(p)],
      )

      // 2) Crear la TAREA del Work Fabric (idempotente por dedupe_key = comm_event_id).
      // Un slash command llega partido: `comando` es el trigger ("asistencia") y
      // `argumentos` el resto ("29/07"). Si se toma sólo `comando`, el skill recibe el
      // nombre del comando sin sus argumentos y pierde la fecha. Se reúne el texto
      // completo. Por WebSocket no hay `comando`: el texto ya viene entero.
      const partes = [p.data?.comando, p.data?.argumentos].filter((x) => x != null && String(x).trim() !== '')
      const comando = partes.length ? partes.join(' ') : (p.data?.texto ?? '')
      const tarea = {
        type: 'comunicacion.responder',
        dedupe_key: dedupeKey,
        title: 'Responder en el chat',
        goal: `responder al chat: "${String(comando).slice(0, 80)}"`,
        causation_id: params.causation_id, // el evento de comunicación
        inputs: {
          comm_event_id: commId,
          correlation_id: params.correlation_id,
          channel_id: p.canal ?? p.data?.channel_id ?? null,
          root_post_id: p.data?.post_id ?? null, // hilo: se responde en el mismo post
          comando,
          actor: p.actor ?? null,
        },
      }
      const t = await client.query('select orq.enqueue_task($1::jsonb) as id', [JSON.stringify(tarea)])
      return { ok: true, task_id: t.rows[0].id }
    })
  }
}
