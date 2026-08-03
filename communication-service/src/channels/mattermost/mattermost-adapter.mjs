// PR-3 · Mattermost Adapter — el primer (y hoy único) adapter de plataforma.
//
// Traduce en dos direcciones y NADA más (sin lógica de negocio):
//   - saliente: evento canónico → llamada al MattermostCliente
//   - entrante: payload de Mattermost (outgoing webhook / slash command) → evento canónico
//
// Todo lo que sabe de "cómo se ve un mensaje en Mattermost" vive acá. El
// Communication Service y el resto del OS jamás ven un channel_id ni un post_id:
// hablan sólo el idioma canónico.

import { PuertoAdapter } from '../../core/puerto-adapter.mjs'
import { construirEvento, TIPOS, claveIdempotencia } from '../../core/eventos-canonicos.mjs'

export class MattermostAdapter extends PuertoAdapter {
  /**
   * @param {object} cfg
   * @param {import('./mattermost-cliente.mjs').MattermostCliente} cfg.cliente
   * @param {string} [cfg.botUserId]      user_id del bot @os (para reacciones y para ignorar su eco)
   * @param {string} [cfg.tokenEntrante]  token compartido del outgoing webhook (verificación de origen)
   */
  constructor(cfg) {
    super()
    if (!cfg?.cliente) throw new Error('MattermostAdapter: falta cliente')
    this.cliente = cfg.cliente
    this.botUserId = cfg.botUserId ?? null
    this.tokenEntrante = cfg.tokenEntrante ?? null
  }

  get plataforma() {
    return 'mattermost'
  }

  get tiposSalientesSoportados() {
    return [TIPOS.MENSAJE_PUBLICAR, TIPOS.MENSAJE_RESPONDER, TIPOS.REACCION_AGREGAR, TIPOS.ARCHIVO_PUBLICAR]
  }

  // ── SALIENTE: canónico → Mattermost ──────────────────────────────────────
  async publicar(evento) {
    try {
      switch (evento.type) {
        case TIPOS.MENSAJE_PUBLICAR:
          return await this._publicarMensaje(evento)
        case TIPOS.MENSAJE_RESPONDER:
          return await this._publicarMensaje(evento, evento.data.root_id)
        case TIPOS.ARCHIVO_PUBLICAR:
          return await this._publicarMensaje(evento, evento.data.root_id)
        case TIPOS.REACCION_AGREGAR:
          return await this._publicarReaccion(evento)
        default:
          return { ok: false, error: `tipo saliente no soportado: ${evento.type}`, reintentable: false }
      }
    } catch (e) {
      return { ok: false, error: String(e?.message ?? e), reintentable: e?.reintentable === true }
    }
  }

  async _publicarMensaje(evento, root_id) {
    const d = evento.data
    const channel_id = d.channel_id ?? d.canal
    if (!channel_id) return { ok: false, error: 'falta channel_id/canal', reintentable: false }
    // El OS puede pedir que el mensaje lleve un deep link al OS: va en el texto.
    const message = d.deep_link ? `${d.texto}\n\n🔗 ${d.deep_link}` : d.texto
    const post = await this.cliente.crearPost({
      channel_id,
      message,
      root_id: root_id ?? undefined,
      file_ids: d.file_ids ?? undefined,
      // trazabilidad: dejamos el correlation_id en props para poder auditar el hilo end-to-end.
      // `attachments` viaja acá cuando el mensaje es INTERACTIVO (botones y desplegables):
      // es la vía nativa de Mattermost para una UI dentro del chat, y el OS la usa para que
      // el jefe de obra no tenga que salir a ningún lado a cargar la asistencia.
      props: {
        os_correlation_id: evento.correlation_id,
        os_event_id: evento.id,
        ...(Array.isArray(d.attachments) && d.attachments.length ? { attachments: d.attachments } : {}),
      },
    })
    return { ok: true, platform_ref: post.id }
  }

  async _publicarReaccion(evento) {
    const d = evento.data
    if (!d.post_id || !d.emoji) return { ok: false, error: 'reacción requiere post_id y emoji', reintentable: false }
    await this.cliente.agregarReaccion({
      user_id: d.user_id ?? this.botUserId,
      post_id: d.post_id,
      emoji_name: d.emoji,
    })
    return { ok: true, platform_ref: `${d.post_id}:${d.emoji}` }
  }

  // ── ENTRANTE: Mattermost → canónico ──────────────────────────────────────
  /**
   * Convierte un payload de Mattermost a evento canónico. Soporta el formato de
   * los "outgoing webhooks" y "slash commands" de MM (application/x-www-form-
   * urlencoded ya parseado a objeto). Devuelve null cuando NO corresponde
   * traducir (eco del propio bot, o token de origen inválido).
   */
  aCanonico(payload) {
    if (!payload || typeof payload !== 'object') return null
    // Verificación de origen: si configuramos un token compartido, exigirlo.
    if (this.tokenEntrante && payload.token !== this.tokenEntrante) return null
    // Ignorar el eco de mensajes del propio bot (evita loops).
    if (this.botUserId && payload.user_id === this.botUserId) return null

    const actor = {
      tipo: 'persona',
      id: payload.user_id ?? null,
      display: payload.user_name ?? null,
    }
    const base = {
      channel_id: payload.channel_id ?? null,
      channel_name: payload.channel_name ?? null,
      team_id: payload.team_id ?? null,
      post_id: payload.post_id ?? null,
      texto: payload.text ?? '',
      // Tipo de canal y ADJUNTOS del post. Los ids de archivo, no los bytes: el evento canónico es
      // un hecho, no un depósito de binario. Quien necesite el contenido lo baja después, y sólo
      // después de pasar su propia puerta.
      ...(payload.channel_type != null ? { channel_type: payload.channel_type } : {}),
      ...(Array.isArray(payload.file_ids) && payload.file_ids.length ? { file_ids: payload.file_ids } : {}),
    }

    // Slash command: MM manda `command` (ej. "/os"). Es un COMANDO_INVOCADO.
    if (payload.command) {
      const idem = claveIdempotencia({ t: 'cmd', trigger: payload.trigger_id ?? '', cmd: payload.command, text: payload.text ?? '', user: payload.user_id ?? '' })
      return construirEvento({
        type: TIPOS.COMANDO_INVOCADO,
        idempotency_key: idem,
        actor,
        data: { ...base, comando: String(payload.command).replace(/^\//, ''), argumentos: payload.text ?? '', response_url: payload.response_url ?? null, trigger_id: payload.trigger_id ?? null },
      })
    }

    // Mensaje común desde un outgoing webhook: post_id es la clave natural.
    const idem = claveIdempotencia({ t: 'msg', post: payload.post_id ?? '', channel: payload.channel_id ?? '', text: payload.text ?? '' })
    return construirEvento({
      type: TIPOS.MENSAJE_RECIBIDO,
      idempotency_key: idem,
      actor,
      data: base,
    })
  }
}
