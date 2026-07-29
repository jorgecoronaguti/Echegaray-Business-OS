// PR-3 · Repositorio Postgres — el MISMO puerto que RepositorioMemoria, sobre el
// schema `comunicacion`. Insert atómico con ON CONFLICT DO NOTHING RETURNING
// (M2), y colas salida/entrada con lease durable (M3/M4) delegadas en ColaPostgres.
//
// Recibe el port { query, withTx } INYECTADO. Nunca importa el db.mjs del
// orquestador: la ARCHITECTURE del servicio prohíbe acoplarse a los internals del
// OS. El lado del OS (wiring de PR-4) crea el repo pasándole su propio pool. Así
// el servicio queda desacoplado y los tests corren con un Postgres efímero propio.

import { ColaPostgres } from './cola-postgres.mjs'

export class RepositorioPostgres {
  /** @param {{query:Function, withTx?:Function}} port */
  constructor(port) {
    if (!port?.query) throw new Error('RepositorioPostgres: falta port.query')
    this.query = port.query
    this.withTx = port.withTx ?? null
    this.salida = new ColaPostgres(port, 'outbox', 'salida')
    this.entrada = new ColaPostgres(port, 'inbox', 'entrada')
  }

  /** Audita un evento de forma ATÓMICA. `ON CONFLICT DO NOTHING RETURNING seq`
   *  devuelve una fila SÓLO si insertó ⇒ `insertado` es real (M2, cierra B5). */
  async registrarEvento(ev) {
    const { rows } = await this.query(
      `insert into comunicacion.eventos
         (id, schema_version, type, direccion, idempotency_key, correlation_id, causation_id, actor, data, occurred_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10)
       on conflict (idempotency_key) do nothing
       returning seq`,
      [
        ev.id, ev.schema_version, ev.type, ev.direccion, ev.idempotency_key,
        ev.correlation_id ?? null, ev.causation_id ?? null,
        JSON.stringify(ev.actor ?? null), JSON.stringify(ev.data ?? {}), ev.occurred_at,
      ],
    )
    return { insertado: rows.length > 0, evento: ev }
  }

  /** Auditoría de un rechazo de seguridad entrante (M7). Sólo prefijo de firma. */
  async registrarRechazo({ plataforma = null, motivo, ip = null, firma = null, detalle = null }) {
    await this.query(
      `insert into comunicacion.rechazos_entrantes (plataforma, motivo, ip, firma_prefijo, detalle)
       values ($1,$2,$3,$4,$5)`,
      [plataforma, motivo, ip, firma ? String(firma).slice(0, 8) : null, detalle],
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
