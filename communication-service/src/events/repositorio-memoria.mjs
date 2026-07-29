// PR-3 · Repositorio en memoria — implementación del puerto de persistencia.
//
// El Communication Service depende de un PUERTO de repositorio, no de Postgres.
// Esta implementación en memoria cumple ese puerto para tests y para la demo
// end-to-end sin base de datos. El repositorio Postgres (repositorio-postgres.mjs)
// cumple el mismo puerto contra el schema `comunicacion`. Cambiar de uno a otro
// no toca ni el servicio ni el contrato de eventos.
//
// Responsabilidades del puerto:
//   - registrarEvento(ev)        → guarda el evento canónico (auditable, append-only)
//   - vistoAntes(idempotencyKey) → idempotencia: ¿ya procesamos este hecho?
//   - encolarSalida(ev)          → mete el evento saliente en el outbox
//   - tomarPendientes(n, ahora)  → saca ítems de outbox listos para intentar
//   - actualizarSalida(id, next) → persiste la decisión de outbox.js
//   - aDeadLetter(item)          → copia el ítem a la DLQ

export class RepositorioMemoria {
  constructor() {
    this.eventos = [] // log append-only de todos los eventos (in/out)
    this.porClave = new Map() // idempotency_key → evento (idempotencia)
    this.outbox = new Map() // id → item { id, evento, estado, intentos, next_attempt_at, ... }
    this.deadLetter = [] // ítems muertos, para inspección
    this._seq = 0
  }

  async registrarEvento(ev) {
    // Append-only + idempotente: el mismo hecho no se guarda dos veces.
    if (this.porClave.has(ev.idempotency_key)) {
      return { insertado: false, evento: this.porClave.get(ev.idempotency_key) }
    }
    this.eventos.push(ev)
    this.porClave.set(ev.idempotency_key, ev)
    return { insertado: true, evento: ev }
  }

  async vistoAntes(idempotencyKey) {
    return this.porClave.has(idempotencyKey)
  }

  async encolarSalida(ev) {
    const id = `ob_${++this._seq}`
    const item = { id, evento: ev, estado: 'pendiente', intentos: 0, next_attempt_at: 0, platform_ref: null, last_error: null }
    this.outbox.set(id, item)
    return item
  }

  async tomarPendientes(n, ahora = Date.now()) {
    const listos = []
    for (const item of this.outbox.values()) {
      if (item.estado === 'pendiente' && (item.next_attempt_at ?? 0) <= ahora) {
        listos.push(item)
        if (listos.length >= n) break
      }
    }
    return listos
  }

  async actualizarSalida(id, next) {
    const item = this.outbox.get(id)
    if (!item) return null
    Object.assign(item, {
      estado: next.estado,
      intentos: next.intentos,
      next_attempt_at: next.next_attempt_at,
      platform_ref: next.platform_ref ?? item.platform_ref,
      last_error: next.last_error,
    })
    return item
  }

  async aDeadLetter(item) {
    this.deadLetter.push({ ...item, muerto_at: Date.now() })
    return true
  }

  // — helpers de inspección para tests/demo (no son parte del puerto) —
  snapshot() {
    return {
      eventos: this.eventos.length,
      outbox: [...this.outbox.values()].map((i) => ({ id: i.id, estado: i.estado, intentos: i.intentos })),
      dead: this.deadLetter.length,
    }
  }
}
