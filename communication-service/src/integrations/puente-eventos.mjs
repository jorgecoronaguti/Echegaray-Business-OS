// PR-3 · Puente explícito Communication Service ↔ orq.events (M10).
//
// Define la relación entre las DOS fuentes de eventos del sistema, sin crear una
// tercera y sin acoplar schemas:
//
//   comunicacion.eventos  = verdad de la COMUNICACIÓN (qué pasó en el chat).
//                           La posee el Communication Service.
//   orq.events            = verdad del TRABAJO del OS (qué decide/ejecuta el OS).
//                           La posee el Business OS (Work Fabric / Director IA).
//
// El puente es un traductor UNIDIRECCIONAL para la entrada: toma un evento
// canónico entrante ya deduplicado (M2) y lo publica como un evento del OS. NO
// importa el orquestador: recibe una función `emitEvent` INYECTADA (la que el OS
// exponga sobre orq.emit_event). Es un puerto: en tests/demo se usa el fake.
//
// Quién publica / quién consume / dónde está la verdad:
//   - Entrada (chat → OS): el Communication Service publica al puente; el OS
//     consume el orq.event y el Director IA decide (PR-4). Verdad del hecho de
//     chat: comunicacion.eventos. Verdad del trabajo derivado: orq.events.
//   - Salida (OS → chat): el OS emite un evento canónico SALIENTE por la API del
//     servicio (`emitir`); el puente NO interviene en la salida.
//   - Doble procesamiento: se evita en dos capas — (1) el inbox deduplica el
//     evento entrante (una sola vez llega al puente); (2) el puente pasa
//     `comm_event_id` como clave, y el consumidor del OS deduplica por ella (el
//     replay reusa el mismo id ⇒ no genera trabajo duplicado).
//   - Caída de un lado: si el OS/puente falla, el inbox reintenta y, agotado,
//     manda a DLQ (M3) — el mensaje del usuario NO se pierde. Si el chat cae, la
//     salida queda en el outbox y se entrega al recuperarse (M4).

/** Tipo de subject con el que se publican los hechos de comunicación en orq.events. */
export const SUBJECT_COMUNICACION = 'comunicacion'

/**
 * Traduce un evento canónico entrante a los parámetros de un evento del OS.
 * Preserva correlation_id y causation_id, y expone `comm_event_id` como clave de
 * deduplicación extremo a extremo. Función pura (testeable sin puente).
 */
export function aEventoOrq(ev) {
  return {
    subject_type: SUBJECT_COMUNICACION,
    subject_id: null,
    type: `comunicacion.${ev.type}`, // ej. comunicacion.mensaje.recibido
    correlation_id: ev.correlation_id,
    causation_id: ev.id, // el evento de comunicación CAUSA el evento del OS
    payload: {
      comm_event_id: ev.id, // ← clave de dedup end-to-end para el consumidor del OS
      idempotency_key: ev.idempotency_key,
      canal: ev.data?.channel_id ?? null,
      actor: ev.actor ?? null,
      data: ev.data ?? {},
    },
  }
}

/**
 * Puente real hacia orq.events. NO importa el orquestador: recibe `emitEvent`
 * inyectado (el wiring del PR-4 pasa la función que llama a orq.emit_event).
 */
export class PuenteOrqEvents {
  /** @param {{ emitEvent:(params:object)=>Promise<any> }} deps */
  constructor({ emitEvent } = {}) {
    if (typeof emitEvent !== 'function') throw new Error('PuenteOrqEvents: falta emitEvent inyectado')
    this._emitEvent = emitEvent
  }

  async publicarHaciaOS(ev) {
    try {
      const ref = await this._emitEvent(aEventoOrq(ev))
      return { ok: true, ref }
    } catch (e) {
      // Falla reintentable: el inbox reintenta (no se pierde el evento).
      return { ok: false, error: String(e?.message ?? e), reintentable: true }
    }
  }
}

/**
 * Puente FALSO para demo y tests. Registra lo que se publicaría al OS y deduplica
 * por `comm_event_id` (demuestra el contrato de dedup end-to-end). Permite simular
 * caídas del OS con `fallarCon`.
 */
export class PuenteMemoria {
  constructor() {
    this.publicados = [] // eventos orq que "recibiría" el OS
    this._vistos = new Set() // comm_event_id ya publicados (dedup end-to-end)
    this._fallos = 0
  }

  /** Programa que las próximas N publicaciones fallen (OS caído). */
  fallarCon(veces = 1) {
    this._fallos = veces
  }

  async publicarHaciaOS(ev) {
    if (this._fallos > 0) {
      this._fallos--
      return { ok: false, error: 'OS no disponible (simulado)', reintentable: true }
    }
    const orqEv = aEventoOrq(ev)
    if (this._vistos.has(orqEv.payload.comm_event_id)) {
      return { ok: true, ref: 'dedup', duplicado: true } // el consumidor del OS ya lo tenía
    }
    this._vistos.add(orqEv.payload.comm_event_id)
    this.publicados.push(orqEv)
    return { ok: true, ref: `orq_${this.publicados.length}` }
  }
}
