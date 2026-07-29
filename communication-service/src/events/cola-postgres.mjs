// PR-3 · Cola con lease durable — implementación Postgres.
//
// Mismo contrato que `ColaMemoria`, sobre una tabla (`outbox` o `inbox`) del
// schema `comunicacion`. El claim es un UPDATE atómico con FOR UPDATE SKIP LOCKED
// (M4): flipea estado→en_proceso y setea el lease en la MISMA transacción que
// selecciona, así el lock NO se libera antes de publicar y dos workers no toman
// la misma fila. Recibe el port { query } inyectado — nunca importa el orquestador.

import { ESTADO } from '../core/outbox.mjs'

export class ColaPostgres {
  /** @param {{query:Function}} port @param {string} tabla 'outbox'|'inbox' @param {string} nombre 'salida'|'entrada' */
  constructor(port, tabla, nombre) {
    this.query = port.query
    this.tabla = tabla // se interpola sólo desde valores fijos internos (no entrada de usuario)
    this.nombre = nombre
  }

  async encolar(ev) {
    const esEntrada = this.tabla === 'inbox'
    const cols = esEntrada
      ? '(evento_id, idempotency_key, type, correlation_id, causation_id, payload)'
      : '(evento_id, idempotency_key, type, plataforma, payload)'
    const vals = esEntrada
      ? [ev.id, ev.idempotency_key, ev.type, ev.correlation_id ?? null, ev.causation_id ?? null, JSON.stringify(ev)]
      : [ev.id, ev.idempotency_key, ev.type, ev.data?.platform ?? null, JSON.stringify(ev)]
    const ph = vals.map((_, i) => `$${i + 1}`).join(', ')
    // Idempotente: la misma idempotency_key no crea dos filas.
    await this.query(
      `insert into comunicacion.${this.tabla} ${cols} values (${ph}) on conflict (idempotency_key) do nothing`,
      vals,
    )
    return true
  }

  async reclamar(workerId, lote, leaseMs, _ahora) {
    const lease = `${Math.round(leaseMs / 1000)} seconds`
    const { rows } = await this.query(
      `update comunicacion.${this.tabla} t
         set estado = 'en_proceso', claimed_by = $1, claimed_at = now(),
             lease_expires_at = now() + ($2)::interval, actualizado_at = now()
       where t.id in (
         select id from comunicacion.${this.tabla}
          where estado = 'pendiente' and next_attempt_at <= now()
          order by next_attempt_at
          for update skip locked
          limit $3
       )
       returning *`,
      [workerId, lease, lote],
    )
    return rows.map((r) => hidratar(r))
  }

  async resolver(id, next) {
    const nextAt = next.next_attempt_at ? new Date(next.next_attempt_at).toISOString() : null
    await this.query(
      `update comunicacion.${this.tabla}
         set estado = $2, intentos = $3,
             next_attempt_at = coalesce($4::timestamptz, next_attempt_at),
             last_error = $5,
             ${this.tabla === 'outbox' ? 'platform_ref = coalesce($6, platform_ref),' : ''}
             claimed_by = null, claimed_at = null, lease_expires_at = null, actualizado_at = now()
       where id = $1`,
      this.tabla === 'outbox'
        ? [id, next.estado, next.intentos, nextAt, next.last_error, next.platform_ref ?? null]
        : [id, next.estado, next.intentos, nextAt, next.last_error],
    )
    return { id, ...next }
  }

  async aDeadLetter(item) {
    const ev = item.evento
    await this.query(
      `insert into comunicacion.dead_letter (cola, origen_id, evento_id, type, correlation_id, causation_id, payload, intentos, last_error)
       values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9)`,
      [this.nombre, item.id, ev.id, ev.type, ev.correlation_id ?? null, ev.causation_id ?? null, JSON.stringify(ev), item.intentos ?? 0, item.last_error ?? null],
    )
    return true
  }

  async recuperarLeases(_ahora) {
    const { rowCount } = await this.query(
      `update comunicacion.${this.tabla}
         set estado = 'pendiente', claimed_by = null, claimed_at = null, lease_expires_at = null, actualizado_at = now()
       where estado = 'en_proceso' and lease_expires_at <= now()`,
    )
    return rowCount ?? 0
  }

  async reencolar(ref) {
    // dead → pendiente. Acepta id de cola (numérico) o evento_id (uuid).
    const porEvento = typeof ref === 'string' && ref.includes('-')
    const { rowCount } = await this.query(
      `update comunicacion.${this.tabla}
         set estado = 'pendiente', intentos = 0, next_attempt_at = now(), last_error = null, actualizado_at = now()
       where estado = 'dead' and ${porEvento ? 'evento_id = $1::uuid' : 'id = $1::bigint'}`,
      [ref],
    )
    return (rowCount ?? 0) > 0
  }
}

/** Convierte una fila de la tabla en el shape de ítem que usa el servicio. */
function hidratar(r) {
  return {
    id: r.id,
    evento: r.payload, // el evento canónico completo
    idempotency_key: r.idempotency_key,
    estado: r.estado,
    intentos: r.intentos,
    next_attempt_at: r.next_attempt_at ? new Date(r.next_attempt_at).getTime() : 0,
    claimed_by: r.claimed_by,
    lease_expires_at: r.lease_expires_at ? new Date(r.lease_expires_at).getTime() : null,
    platform_ref: r.platform_ref ?? null,
    last_error: r.last_error ?? null,
  }
}

export { ESTADO }
