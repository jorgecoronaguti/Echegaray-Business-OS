// PR-3 · Repositorio en memoria — implementación del puerto de persistencia.
//
// El Communication Service depende de un PUERTO de repositorio, no de Postgres.
// Esta implementación en memoria cumple ese puerto para tests y demo sin base de
// datos. El repositorio Postgres (repositorio-postgres.mjs) cumple EXACTAMENTE el
// mismo puerto contra el schema `comunicacion`. Cambiar de uno a otro no toca ni
// el servicio ni el contrato de eventos (consistencia exigida por la auditoría).
//
// Puerto (idéntico en memoria y Postgres):
//   - registrarEvento(ev)   → { insertado }   (audita; dedup ATÓMICO por idempotency_key — M2)
//   - salida  : cola con lease (outbox)        → encolar/reclamar/resolver/aDeadLetter/recuperarLeases/reencolar
//   - entrada : cola con lease (inbox)         → idem (M3)
//   - registrarRechazo(info) → auditoría de rechazos entrantes (M7)

import { ColaMemoria } from './cola-memoria.mjs'

export class RepositorioMemoria {
  constructor() {
    this.eventos = [] // log append-only de todos los eventos (in/out)
    this.porClave = new Map() // idempotency_key → evento (dedup atómico)
    this.salida = new ColaMemoria('salida')
    this.entrada = new ColaMemoria('entrada')
    this.rechazos = [] // auditoría de rechazos entrantes (M7)
  }

  /** Audita un evento de forma ATÓMICA. Devuelve insertado:false si la
   *  idempotency_key ya existía. No hay `await` entre el check y el set, así que
   *  es atómico dentro del event loop (equivale al ON CONFLICT del Postgres). */
  async registrarEvento(ev) {
    if (this.porClave.has(ev.idempotency_key)) {
      return { insertado: false, evento: this.porClave.get(ev.idempotency_key) }
    }
    this.eventos.push(ev)
    this.porClave.set(ev.idempotency_key, ev)
    return { insertado: true, evento: ev }
  }

  /** Auditoría de un rechazo de seguridad entrante (M7). Nunca guarda la firma
   *  completa ni el secreto: sólo un prefijo corto de la firma. */
  async registrarRechazo({ plataforma = null, motivo, ip = null, firma = null, detalle = null }) {
    this.rechazos.push({
      plataforma, motivo, ip,
      firma_prefijo: firma ? String(firma).slice(0, 8) : null,
      detalle, at: Date.now(),
    })
    return true
  }

  /** Snapshot para tests/demo (no es parte del puerto). */
  snapshot() {
    return {
      eventos: this.eventos.length,
      salida: this.salida.listar(),
      entrada: this.entrada.listar(),
      deadSalida: this.salida.deadLetter.length,
      deadEntrada: this.entrada.deadLetter.length,
      rechazos: this.rechazos.length,
    }
  }
}
