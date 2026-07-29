// PR-3 · Cola con lease durable — implementación en memoria.
//
// Base común de las dos colas del servicio (salida/entrada). Modela el MISMO
// contrato que `ColaPostgres`, para que el puerto valga idéntico en memoria y en
// base (consistencia exigida por la auditoría). Todas las operaciones son
// síncronas internamente (no hay `await` entre leer y escribir), así el claim y
// el encolar son atómicos dentro del event loop de Node — dos "workers" que
// reclaman en secuencia obtienen conjuntos disjuntos.
//
// Estados y transiciones los decide `outbox.mjs` (política pura); esta cola sólo
// persiste lo decidido y gestiona el lease (claimed_by / lease_expires_at).

import { ESTADO } from '../core/outbox.mjs'

export class ColaMemoria {
  constructor(nombre) {
    this.nombre = nombre // 'salida' | 'entrada' (para el DLQ)
    this.items = new Map() // id → item
    this.porClave = new Map() // idempotency_key → id (idempotencia de encolado)
    this.deadLetter = []
    this._seq = 0
  }

  /** Encola un evento. Idempotente: la misma idempotency_key no crea dos filas. */
  encolar(ev) {
    if (this.porClave.has(ev.idempotency_key)) return this.items.get(this.porClave.get(ev.idempotency_key))
    const id = `${this.nombre}_${++this._seq}`
    const item = {
      id, evento: ev, idempotency_key: ev.idempotency_key,
      estado: ESTADO.PENDIENTE, intentos: 0, next_attempt_at: 0,
      claimed_by: null, claimed_at: null, lease_expires_at: null, last_error: null,
    }
    this.items.set(id, item)
    this.porClave.set(ev.idempotency_key, id)
    return item
  }

  /** Reclama atómicamente hasta `lote` ítems listos, flipeándolos a en_proceso
   *  con lease. Devuelve SÓLO los reclamados por este worker. */
  reclamar(workerId, lote, leaseMs, ahora = Date.now()) {
    const reclamados = []
    for (const item of this.items.values()) {
      if (reclamados.length >= lote) break
      if (item.estado !== ESTADO.PENDIENTE) continue
      if ((item.next_attempt_at ?? 0) > ahora) continue
      item.estado = ESTADO.EN_PROCESO
      item.claimed_by = workerId
      item.claimed_at = ahora
      item.lease_expires_at = ahora + leaseMs
      reclamados.push(item)
    }
    return reclamados.map(clonar)
  }

  /** Aplica la decisión de `decidirProximo` y libera el lease. */
  resolver(id, next) {
    const item = this.items.get(id)
    if (!item) return null
    item.estado = next.estado
    item.intentos = next.intentos
    item.next_attempt_at = next.next_attempt_at ?? item.next_attempt_at
    item.last_error = next.last_error
    item.platform_ref = next.platform_ref ?? item.platform_ref
    item.claimed_by = null
    item.claimed_at = null
    item.lease_expires_at = null
    return clonar(item)
  }

  aDeadLetter(item) {
    this.deadLetter.push({ cola: this.nombre, ...clonar(item), muerto_at: Date.now() })
    return true
  }

  /** Recupera leases vencidos: en_proceso cuyo lease ya expiró vuelve a pendiente
   *  (reclamable de nuevo). Devuelve cuántos recuperó. */
  recuperarLeases(ahora = Date.now()) {
    let n = 0
    for (const item of this.items.values()) {
      if (item.estado === ESTADO.EN_PROCESO && (item.lease_expires_at ?? 0) <= ahora) {
        item.estado = ESTADO.PENDIENTE
        item.claimed_by = null
        item.claimed_at = null
        item.lease_expires_at = null
        n++
      }
    }
    return n
  }

  /** Replay manual: un ítem muerto vuelve a pendiente para reprocesarse. Busca
   *  por id de cola o por evento_id. La idempotencia del evento evita doble efecto. */
  reencolar(ref, ahora = Date.now()) {
    for (const item of this.items.values()) {
      if ((item.id === ref || item.evento?.id === ref) && item.estado === ESTADO.DEAD) {
        item.estado = ESTADO.PENDIENTE
        item.intentos = 0
        item.next_attempt_at = ahora
        item.last_error = null
        return true
      }
    }
    return false
  }

  /** Snapshot para tests/inspección (no es parte del contrato del puerto). */
  listar() {
    return [...this.items.values()].map((i) => ({ id: i.id, estado: i.estado, intentos: i.intentos }))
  }
}

function clonar(item) {
  return { ...item }
}
