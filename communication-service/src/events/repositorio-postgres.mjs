// PR-3 · Repositorio Postgres — el mismo puerto que RepositorioMemoria, sobre el
// schema `comunicacion`. Consume las RPCs de la migración (emit / claim_outbox).
//
// Recibe el port { query, withTx } INYECTADO desde afuera. Nunca importa el
// db.mjs del orquestador: la ARCHITECTURE del servicio prohíbe acoplarse a los
// internals del OS. El lado del OS (wiring de PR-4) crea el repo pasándole su
// propio pool de Postgres. Así el servicio queda desacoplado y los tests corren
// sin DATABASE_URL.
//
// Este archivo NO se ejecuta en la suite de tests (que usa el repo de memoria):
// su correctness se valida contra la base recién cuando se aplique la migración
// en un entorno con `comunicacion.*`. En PR-3 queda listo pero sin aplicar.

/** @param {{query:Function, withTx:Function}} port */
export class RepositorioPostgres {
  constructor(port) {
    if (!port?.query) throw new Error('RepositorioPostgres: falta port.query')
    this.query = port.query
    this.withTx = port.withTx ?? null
  }

  async registrarEvento(ev) {
    // comunicacion.emit inserta el evento y, si es saliente, la fila de outbox,
    // todo en una transacción y con ON CONFLICT DO NOTHING (idempotente).
    await this.query('select comunicacion.emit($1::jsonb) as id', [JSON.stringify(ev)])
    // `emit` ya encola la salida; devolvemos "insertado" en base a si existía.
    const { rows } = await this.query(
      'select 1 from comunicacion.eventos where idempotency_key = $1',
      [ev.idempotency_key],
    )
    return { insertado: rows.length > 0, evento: ev }
  }

  async vistoAntes(idempotencyKey) {
    const { rows } = await this.query(
      'select 1 from comunicacion.eventos where idempotency_key = $1 limit 1',
      [idempotencyKey],
    )
    return rows.length > 0
  }

  async encolarSalida(_ev) {
    // No-op: comunicacion.emit() ya encoló la salida dentro de registrarEvento.
    // Se mantiene por contrato del puerto (el repo de memoria sí encola aparte).
    return null
  }

  async tomarPendientes(n, _ahora) {
    const { rows } = await this.query('select * from comunicacion.claim_outbox($1)', [n])
    return rows.map((r) => ({
      id: r.id,
      evento: r.payload,
      estado: r.estado,
      intentos: r.intentos,
      next_attempt_at: r.next_attempt_at ? new Date(r.next_attempt_at).getTime() : 0,
      platform_ref: r.platform_ref,
      last_error: r.last_error,
    }))
  }

  async actualizarSalida(id, next) {
    const nextAt = next.next_attempt_at ? new Date(next.next_attempt_at).toISOString() : null
    await this.query(
      `update comunicacion.outbox
         set estado = $2, intentos = $3, next_attempt_at = coalesce($4::timestamptz, next_attempt_at),
             platform_ref = coalesce($5, platform_ref), last_error = $6, actualizado_at = now()
       where id = $1`,
      [id, next.estado, next.intentos, nextAt, next.platform_ref, next.last_error],
    )
    return { id, ...next }
  }

  async aDeadLetter(item) {
    await this.query(
      `insert into comunicacion.dead_letter (outbox_id, evento_id, type, payload, intentos, last_error)
       values ($1, $2, $3, $4::jsonb, $5, $6)`,
      [item.id, item.evento.id, item.evento.type, JSON.stringify(item.evento), item.intentos ?? 0, item.last_error ?? null],
    )
    return true
  }
}

/** Wiring real: el lado del OS pasa su propio port { query, withTx } (el mismo
 *  pool del Work Fabric, o cualquier otro). El servicio NO conoce ese módulo:
 *  se lo inyectan. Esto preserva el desacople que exige la ARCHITECTURE. */
export function crearRepositorioPostgres(port) {
  return new RepositorioPostgres(port)
}
