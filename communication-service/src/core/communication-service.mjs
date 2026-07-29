// PR-3 · Communication Service — el corazón desacoplado.
//
// Es el ÚNICO punto por el que pasa toda la comunicación entre el Business OS y
// el mundo. No conoce Mattermost (eso es un adapter), no conoce a los
// especialistas ni al Director/CFO (eso es PR-4), no conoce Postgres (eso es el
// repositorio). Sólo conoce:
//   - el contrato canónico de eventos
//   - un conjunto de ADAPTERS (puerto de plataforma)
//   - un REPOSITORIO (puerto de persistencia)
//   - un registro de HANDLERS entrantes (callbacks que el OS registra)
//
// Flujo saliente:  OS → emitir(evento) → outbox → procesarOutbox() → adapter → plataforma
// Flujo entrante:  plataforma → recibir(payload) → adapter.aCanonico → handlers del OS
//
// Garantías: idempotencia (un hecho no se procesa dos veces), at-least-once en la
// salida (outbox + reintentos), auditabilidad total (todo evento se registra),
// y desacople estricto (el OS y la plataforma nunca se ven directamente).

import { construirEvento, validarEvento, DIRECCION } from './eventos-canonicos.mjs'
import { verificarAdapter } from './puerto-adapter.mjs'
import { decidirProximo } from './outbox.mjs'
import { crearLog, crearMetricas, iniciarSpan } from './observabilidad.mjs'

export class CommunicationService {
  /**
   * @param {object} deps
   * @param {object} deps.repositorio     implementación del puerto de persistencia
   * @param {object} [deps.log]           logger estructurado (ver observabilidad)
   * @param {object} [deps.metricas]      métricas (ver observabilidad)
   * @param {() => number} [deps.ahora]   reloj inyectable
   */
  constructor({ repositorio, log, metricas, ahora } = {}) {
    if (!repositorio) throw new Error('CommunicationService: falta repositorio')
    this.repo = repositorio
    this.log = log ?? crearLog()
    this.metricas = metricas ?? crearMetricas()
    this.ahora = ahora ?? (() => Date.now())
    this.adapters = new Map() // plataforma → adapter
    this.adapterPorDefecto = null
    this.handlers = new Map() // tipo canónico → [fn]
  }

  /** Registra un adapter de plataforma. El primero registrado es el default. */
  registrarAdapter(adapter) {
    const chk = verificarAdapter(adapter)
    if (!chk.ok) throw new Error(`registrarAdapter: ${chk.error}`)
    this.adapters.set(adapter.plataforma, adapter)
    if (!this.adapterPorDefecto) this.adapterPorDefecto = adapter.plataforma
    this.log.info('adapter registrado', { plataforma: adapter.plataforma })
    return this
  }

  /** Registra un handler para un tipo canónico ENTRANTE. Acá es donde el OS
   *  (o, en PR-4, el ruteo a especialistas) engancha su reacción. El servicio
   *  no sabe qué hace el handler: sólo lo invoca con el evento canónico. */
  registrarHandlerEntrante(tipo, fn) {
    if (typeof fn !== 'function') throw new Error('handler debe ser función')
    const lista = this.handlers.get(tipo) ?? []
    lista.push(fn)
    this.handlers.set(tipo, lista)
    return this
  }

  // ── SALIENTE ──────────────────────────────────────────────────────────────
  /** El OS emite un evento canónico. Lo audita y —si es saliente— lo encola en
   *  el outbox para entrega garantizada. Idempotente por idempotency_key. */
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
      await this.repo.encolarSalida(ev)
      this.log.info('evento encolado a salida', { id: ev.id, type: ev.type, correlation_id: ev.correlation_id })
    }
    return ev
  }

  /** Procesa el outbox: toma pendientes listos, los publica vía adapter, y
   *  aplica la política de reintentos/DLQ. Llamar en loop desde un worker.
   *  Devuelve un resumen del lote. */
  async procesarOutbox({ lote = 20 } = {}) {
    const ahora = this.ahora()
    const pendientes = await this.repo.tomarPendientes(lote, ahora)
    const resumen = { intentados: 0, publicados: 0, reintentar: 0, dead: 0 }
    for (const item of pendientes) {
      resumen.intentados++
      const resultado = await this._publicarItem(item)
      const next = decidirProximo(item, resultado, this.ahora())
      await this.repo.actualizarSalida(item.id, next)
      if (next.a_dlq) {
        await this.repo.aDeadLetter({ ...item, last_error: next.last_error })
        resumen.dead++
        this.log.error('evento a dead-letter', { id: item.evento.id, type: item.evento.type, error: next.last_error })
      } else if (next.estado === 'publicado') {
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
  /** Recibe un payload crudo de una plataforma, lo convierte a canónico, lo
   *  audita (idempotente) y lo despacha a los handlers registrados. Devuelve el
   *  evento canónico, o null si el adapter decidió ignorarlo o ya se procesó. */
  async recibir(payloadCrudo, { plataforma } = {}) {
    const nombre = plataforma ?? this.adapterPorDefecto
    const adapter = this.adapters.get(nombre)
    if (!adapter) throw new Error(`recibir: sin adapter para ${nombre}`)

    const ev = adapter.aCanonico(payloadCrudo)
    if (!ev) {
      this.metricas.inc('entrada.ignorada', { plataforma: nombre })
      return null // eco propio, token inválido, o nada que traducir
    }
    const chk = validarEvento(ev)
    if (!chk.ok) {
      this.log.error('entrada inválida descartada', { error: chk.error, plataforma: nombre })
      this.metricas.inc('entrada.invalida', { plataforma: nombre })
      return null
    }
    if (await this.repo.vistoAntes(ev.idempotency_key)) {
      this.metricas.inc('entrada.duplicada', { type: ev.type })
      return null
    }
    await this.repo.registrarEvento(ev)
    this.metricas.inc('entrada.recibida', { type: ev.type })
    await this._despachar(ev)
    return ev
  }

  async _despachar(ev) {
    const handlers = this.handlers.get(ev.type) ?? []
    if (!handlers.length) {
      this.log.info('sin handler para evento entrante (esperado en PR-3)', { type: ev.type, id: ev.id })
      return
    }
    for (const fn of handlers) {
      try {
        await fn(ev, { emitir: (spec) => this.emitir({ ...spec, causation_id: ev.id, correlation_id: ev.correlation_id }) })
      } catch (e) {
        // Un handler que falla NO tumba el ingreso ni a los demás handlers.
        this.log.error('handler entrante falló', { type: ev.type, id: ev.id, error: String(e?.message ?? e) })
        this.metricas.inc('handler.error', { type: ev.type })
      }
    }
  }
}
