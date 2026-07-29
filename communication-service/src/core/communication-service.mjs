// PR-3 · Communication Service — el corazón desacoplado.
//
// Es el ÚNICO punto por el que pasa toda la comunicación entre el Business OS y
// el mundo. No conoce Mattermost (eso es un adapter), no conoce a los
// especialistas ni al Director/CFO (eso es PR-4), no conoce Postgres (eso es el
// repositorio). Sólo conoce: el contrato canónico, un conjunto de ADAPTERS, un
// REPOSITORIO (con dos colas con lease: salida/entrada) y un registro de HANDLERS.
//
// Flujo saliente:  OS → emitir(evento) → outbox → procesarOutbox() → adapter → plataforma
// Flujo entrante:  plataforma → recibir(payload) → [seguridad M7] → canónico →
//                  dedup atómico (M2) → inbox → procesarInbox() → handlers del OS
//
// Garantías: idempotencia por intención (M1) y dedup atómico (M2); at-least-once
// con lease durable en AMBAS colas (M4) y DLQ para salida y entrada (M3);
// auditabilidad total; seguridad de borde fail-closed (M7); y desacople estricto.

import { construirEvento, validarEvento, DIRECCION } from './eventos-canonicos.mjs'
import { verificarAdapter } from './puerto-adapter.mjs'
import { decidirProximo, ESTADO } from './outbox.mjs'
import { crearLog, crearMetricas, iniciarSpan } from './observabilidad.mjs'

const LEASE_MS_DEFAULT = 30_000

export class CommunicationService {
  /**
   * @param {object} deps
   * @param {object} deps.repositorio          puerto de persistencia (memoria/postgres)
   * @param {object} [deps.verificadorEntrante] verificador de seguridad de borde (M7); si se pasa, se ENFORCEA
   * @param {object} [deps.log] @param {object} [deps.metricas] @param {()=>number} [deps.ahora]
   * @param {string} [deps.workerId] @param {number} [deps.leaseMs]
   */
  constructor({ repositorio, verificadorEntrante, log, metricas, ahora, workerId, leaseMs } = {}) {
    if (!repositorio) throw new Error('CommunicationService: falta repositorio')
    this.repo = repositorio
    this.verificador = verificadorEntrante ?? null
    this.log = log ?? crearLog()
    this.metricas = metricas ?? crearMetricas()
    this.ahora = ahora ?? (() => Date.now())
    this.workerId = workerId ?? 'cs-1'
    this.leaseMs = leaseMs ?? LEASE_MS_DEFAULT
    this.adapters = new Map()
    this.adapterPorDefecto = null
    this.handlers = new Map() // tipo canónico → [fn]
  }

  registrarAdapter(adapter) {
    const chk = verificarAdapter(adapter)
    if (!chk.ok) throw new Error(`registrarAdapter: ${chk.error}`)
    this.adapters.set(adapter.plataforma, adapter)
    if (!this.adapterPorDefecto) this.adapterPorDefecto = adapter.plataforma
    this.log.info('adapter registrado', { plataforma: adapter.plataforma })
    return this
  }

  /** Registra un handler para un tipo canónico ENTRANTE. Acá engancha PR-4 (p.ej.
   *  el puente hacia orq.events). El servicio no sabe qué hace el handler. */
  registrarHandlerEntrante(tipo, fn) {
    if (typeof fn !== 'function') throw new Error('handler debe ser función')
    const lista = this.handlers.get(tipo) ?? []
    lista.push(fn)
    this.handlers.set(tipo, lista)
    return this
  }

  // ── SALIENTE ──────────────────────────────────────────────────────────────
  /** El OS emite un evento canónico. Lo audita (dedup atómico por intención) y
   *  —si es saliente— lo encola en el outbox. */
  async emitir(spec) {
    const ev = spec?.schema_version ? spec : construirEvento(spec)
    const chk = validarEvento(ev)
    if (!chk.ok) throw new Error(`emitir: evento inválido — ${chk.error}`)

    const { insertado } = await this.repo.registrarEvento(ev)
    if (!insertado) {
      this.metricas.inc('evento.duplicado', { direccion: ev.direccion })
      this.log.warn('evento duplicado ignorado', { idempotency_key: ev.idempotency_key, type: ev.type })
      return ev
    }
    this.metricas.inc('evento.emitido', { type: ev.type })
    if (ev.direccion === DIRECCION.SALIENTE) {
      await this.repo.salida.encolar(ev)
      this.log.info('evento encolado a salida', { id: ev.id, type: ev.type, correlation_id: ev.correlation_id })
    }
    return ev
  }

  /** Procesa el outbox: reclama pendientes con lease durable (M4), publica vía
   *  adapter y aplica reintentos/DLQ. Llamar en loop desde un worker. */
  async procesarOutbox({ lote = 20, leaseMs = this.leaseMs, workerId = this.workerId } = {}) {
    const items = await this.repo.salida.reclamar(workerId, lote, leaseMs, this.ahora())
    const resumen = { intentados: 0, publicados: 0, reintentar: 0, dead: 0 }
    for (const item of items) {
      resumen.intentados++
      const resultado = await this._publicarItem(item)
      const next = decidirProximo(item, resultado, this.ahora(), { estadoOk: ESTADO.PUBLICADO })
      await this.repo.salida.resolver(item.id, next)
      if (next.a_dlq) {
        await this.repo.salida.aDeadLetter({ ...item, last_error: next.last_error })
        resumen.dead++
        this.log.error('salida a dead-letter', { id: item.evento.id, type: item.evento.type, error: next.last_error })
      } else if (next.estado === ESTADO.PUBLICADO) {
        resumen.publicados++
        this.metricas.inc('salida.publicada', { type: item.evento.type })
      } else {
        resumen.reintentar++
        this.metricas.inc('salida.reintento', { type: item.evento.type })
      }
    }
    return resumen
  }

  async _publicarItem(item) {
    const ev = item.evento
    const plataforma = ev.data?.platform ?? this.adapterPorDefecto
    const adapter = this.adapters.get(plataforma)
    if (!adapter) return { ok: false, error: `sin adapter para plataforma ${plataforma}`, reintentable: false }
    if (!adapter.tiposSalientesSoportados.includes(ev.type)) {
      return { ok: false, error: `${plataforma} no soporta ${ev.type}`, reintentable: false }
    }
    const span = iniciarSpan('publicar', { metricas: this.metricas, ahora: this.ahora, etiquetas: { plataforma } })
    const r = await adapter.publicar(ev)
    span.fin()
    return r
  }

  // ── ENTRANTE ──────────────────────────────────────────────────────────────
  /** Recibe un payload crudo: verifica seguridad de borde (M7), lo convierte a
   *  canónico, lo audita con dedup ATÓMICO (M2) y lo encola en el inbox (M3).
   *  Devuelve el evento, null si se ignora/duplica, o { rechazado, motivo } si la
   *  seguridad lo rechaza. NO ejecuta los handlers: eso lo hace procesarInbox. */
  async recibir(payloadCrudo, { plataforma, seguridad } = {}) {
    const nombre = plataforma ?? this.adapterPorDefecto
    const adapter = this.adapters.get(nombre)
    if (!adapter) throw new Error(`recibir: sin adapter para ${nombre}`)

    if (this.verificador) {
      const res = this.verificador.verificar(seguridad ?? {})
      if (!res.ok) return this._rechazar(nombre, res.motivo, seguridad)
    }

    const ev = await adapter.aCanonico(payloadCrudo)
    if (!ev) {
      this.metricas.inc('entrada.ignorada', { plataforma: nombre })
      return null // eco propio o nada que traducir
    }
    const chk = validarEvento(ev)
    if (!chk.ok) {
      this.log.error('entrada inválida descartada', { error: chk.error, plataforma: nombre })
      this.metricas.inc('entrada.invalida', { plataforma: nombre })
      return null
    }
    // Dedup ATÓMICO (M2): despacho gateado por el insert, no por un check-then-act.
    const { insertado } = await this.repo.registrarEvento(ev)
    if (!insertado) {
      this.metricas.inc('entrada.duplicada', { type: ev.type })
      return null
    }
    await this.repo.entrada.encolar(ev) // durable (M3): el handler corre en procesarInbox
    this.metricas.inc('entrada.recibida', { type: ev.type })
    return ev
  }

  async _rechazar(plataforma, motivo, seguridad) {
    this.metricas.inc('entrada.rechazada', { motivo })
    this.log.warn('entrada rechazada por seguridad', { plataforma, motivo, ip: seguridad?.ip ?? null })
    try {
      await this.repo.registrarRechazo({ plataforma, motivo, ip: seguridad?.ip ?? null, firma: seguridad?.firma ?? null })
    } catch (e) {
      this.log.error('no pude auditar el rechazo', { error: String(e?.message ?? e) })
    }
    return { rechazado: true, motivo }
  }

  /** Procesa el inbox: reclama pendientes con lease (M4), corre los handlers y
   *  aplica reintentos/DLQ (M3). Un handler que falla NO pierde el evento: se
   *  reintenta y, agotado, va a la DLQ entrante para replay manual. */
  async procesarInbox({ lote = 20, leaseMs = this.leaseMs, workerId = this.workerId } = {}) {
    const items = await this.repo.entrada.reclamar(workerId, lote, leaseMs, this.ahora())
    const resumen = { intentados: 0, procesados: 0, reintentar: 0, dead: 0 }
    for (const item of items) {
      resumen.intentados++
      const resultado = await this._ejecutarHandlers(item.evento)
      const next = decidirProximo(item, resultado, this.ahora(), { estadoOk: ESTADO.PROCESADO })
      await this.repo.entrada.resolver(item.id, next)
      if (next.a_dlq) {
        await this.repo.entrada.aDeadLetter({ ...item, last_error: next.last_error })
        resumen.dead++
        this.log.error('entrada a dead-letter', { id: item.evento.id, type: item.evento.type, error: next.last_error })
      } else if (next.estado === ESTADO.PROCESADO) {
        resumen.procesados++
        this.metricas.inc('entrada.procesada', { type: item.evento.type })
      } else {
        resumen.reintentar++
        this.metricas.inc('entrada.reintento', { type: item.evento.type })
      }
    }
    return resumen
  }

  /** Corre los handlers registrados para el tipo del evento. Sin handler = nada
   *  que hacer (procesado). Si un handler lanza o devuelve ok:false, el resultado
   *  es un fallo reintentable — el evento no se pierde. */
  async _ejecutarHandlers(ev) {
    const handlers = this.handlers.get(ev.type) ?? []
    if (!handlers.length) {
      this.log.info('sin handler para evento entrante (esperado en PR-3)', { type: ev.type, id: ev.id })
      return { ok: true }
    }
    try {
      for (const fn of handlers) {
        const r = await fn(ev, { emitir: (spec) => this.emitir({ ...spec, causation_id: ev.id, correlation_id: ev.correlation_id }) })
        if (r && r.ok === false) return { ok: false, error: r.error ?? 'handler devolvió ok:false', reintentable: r.reintentable !== false }
      }
      return { ok: true }
    } catch (e) {
      return { ok: false, error: String(e?.message ?? e), reintentable: true }
    }
  }

  /** Replay manual seguro de un evento entrante muerto (M3). La idempotencia del
   *  evento + el dedup del puente evitan doble efecto. */
  async reprocesarEntrada(ref) {
    return this.repo.entrada.reencolar(ref, this.ahora())
  }

  /** Recupera leases vencidos (worker que murió). Devuelve cuántos por cola. */
  async recuperarLeases() {
    const ahora = this.ahora()
    return {
      salida: await this.repo.salida.recuperarLeases(ahora),
      entrada: await this.repo.entrada.recuperarLeases(ahora),
    }
  }
}
