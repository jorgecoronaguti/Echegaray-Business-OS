// PR-3 · Cliente HTTP delgado de Mattermost.
//
// ÚNICO módulo que conoce la forma de la API REST de Mattermost. No tiene lógica
// de negocio ni de mapeo canónico (eso es el adapter): sólo envuelve endpoints y
// clasifica errores como reintentables (5xx/red) o permanentes (4xx). Cambiar de
// versión de la API de Mattermost toca sólo este archivo.
//
// Autenticación: Bearer token de un bot/personal-access-token. NUNCA credenciales
// hardcodeadas — el token viene por configuración (ver identidad.mjs / config).
//
// Trae además `FakeMattermost`: una implementación en memoria con la MISMA
// interfaz, para tests y para la demo end-to-end SIN tocar producción ni la red.

/** Clasifica un status HTTP: ¿conviene reintentar o es un fallo permanente? */
export function esReintentable(status) {
  if (status === 429) return true // rate limit → reintentar con backoff
  if (status >= 500) return true // error del servidor → transitorio
  return false // 4xx (salvo 429) es del emisor: reintentar no ayuda
}

/** Cliente real contra la API v4 de Mattermost. */
export class MattermostCliente {
  /** @param {{ baseUrl:string, token:string, fetch?:Function }} cfg */
  constructor(cfg) {
    if (!cfg?.baseUrl) throw new Error('MattermostCliente: falta baseUrl')
    if (!cfg?.token) throw new Error('MattermostCliente: falta token')
    this.baseUrl = cfg.baseUrl.replace(/\/+$/, '')
    this.token = cfg.token
    this._fetch = cfg.fetch ?? globalThis.fetch
  }

  async _req(metodo, ruta, cuerpo) {
    const res = await this._fetch(`${this.baseUrl}/api/v4${ruta}`, {
      method: metodo,
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: cuerpo == null ? undefined : JSON.stringify(cuerpo),
    })
    const texto = await res.text()
    const json = texto ? safeJson(texto) : null
    if (!res.ok) {
      const err = new Error(`mattermost ${metodo} ${ruta} → ${res.status}: ${json?.message ?? texto}`)
      err.status = res.status
      err.reintentable = esReintentable(res.status)
      throw err
    }
    return json
  }

  /** Crea un post (mensaje) en un canal, opcionalmente en un hilo (root_id). */
  crearPost({ channel_id, message, root_id, file_ids, props }) {
    return this._req('POST', '/posts', { channel_id, message, root_id, file_ids, props })
  }

  /** Agrega una reacción (emoji) a un post en nombre de un usuario. */
  agregarReaccion({ user_id, post_id, emoji_name }) {
    return this._req('POST', '/reactions', { user_id, post_id, emoji_name })
  }

  /** Resuelve un canal por equipo+nombre (para no hardcodear channel_ids). */
  canalPorNombre({ team_id, nombre }) {
    return this._req('GET', `/teams/${team_id}/channels/name/${encodeURIComponent(nombre)}`)
  }

  /**
   * Canal DIRECTO (1 a 1) entre dos usuarios. Idempotente en Mattermost: si el DM ya
   * existe devuelve el mismo canal. Hace falta para los skills cuya respuesta NO puede
   * salir en un canal donde hay más gente — asistencia del personal, por ejemplo.
   */
  canalDirecto({ usuarioA, usuarioB }) {
    return this._req('POST', '/channels/direct', [usuarioA, usuarioB])
  }

  /**
   * Abre un diálogo modal. `trigger_id` viene del click y **vence en pocos segundos**: si se
   * hace trabajo lento antes de llamar acá, Mattermost lo rechaza por vencido.
   */
  async abrirDialogo({ trigger_id, url, dialog }) {
    return this._req('POST', '/actions/dialogs/open', { trigger_id, url, dialog })
  }

  /**
   * Reescribe un post ya publicado. Es lo que permite que la carga ocurra en UN mensaje que
   * se va actualizando, en vez de una conversación que crece hacia abajo.
   * `PUT` (no `PATCH`): reemplaza el post entero, que es lo que se quiere acá.
   */
  async actualizarPost({ id, message, props }) {
    return this._req('PUT', `/posts/${id}`, { id, message, props: props ?? {} })
  }
}

function safeJson(t) {
  try {
    return JSON.parse(t)
  } catch {
    return null
  }
}

/**
 * FakeMattermost — misma interfaz que MattermostCliente, en memoria. Registra
 * todo lo publicado en `this.posts` / `this.reacciones` para que los tests y la
 * demo verifiquen SIN red ni servidor. Permite simular fallos con `fallarCon`.
 */
export class FakeMattermost {
  constructor() {
    this.posts = []
    this.reacciones = []
    this.dialogos = []
    this._fallo = null // { veces, status } → falla las próximas N llamadas
    this._seq = 0
  }

  /** Programa que las próximas `veces` llamadas fallen con `status`. */
  fallarCon(status, veces = 1) {
    this._fallo = { status, veces }
  }

  _maybeFail(op) {
    if (this._fallo && this._fallo.veces > 0) {
      this._fallo.veces--
      const err = new Error(`fake mattermost: fallo simulado en ${op} (${this._fallo.status})`)
      err.status = this._fallo.status
      err.reintentable = esReintentable(this._fallo.status)
      throw err
    }
  }

  async crearPost({ channel_id, message, root_id, file_ids, props }) {
    this._maybeFail('crearPost')
    const post = { id: `post_${++this._seq}`, channel_id, message, root_id: root_id ?? '', file_ids: file_ids ?? [], props: props ?? {}, create_at: Date.now() }
    this.posts.push(post)
    return post
  }


  async abrirDialogo({ trigger_id, url, dialog }) {
    this._maybeFail('abrirDialogo')
    const d = { trigger_id, url, dialog, create_at: Date.now() }
    this.dialogos.push(d)
    return { ok: true, ...d }
  }

  async actualizarPost({ id, message, props }) {
    this._maybeFail('actualizarPost')
    const post = this.posts.find((p) => p.id === id)
    if (!post) { const e = new Error(`fake mattermost: no existe el post ${id}`); e.status = 404; throw e }
    post.message = message ?? post.message
    post.props = props ?? post.props
    post.update_at = Date.now()
    return post
  }

  async agregarReaccion({ user_id, post_id, emoji_name }) {
    this._maybeFail('agregarReaccion')
    const r = { user_id, post_id, emoji_name, create_at: Date.now() }
    this.reacciones.push(r)
    return r
  }

  async canalPorNombre({ team_id, nombre }) {
    this._maybeFail('canalPorNombre')
    return { id: `canal_${nombre}`, team_id, name: nombre }
  }

  async canalDirecto({ usuarioA, usuarioB }) {
    this._maybeFail('canalDirecto')
    // Mismo criterio que Mattermost: el id del DM es estable para el par de usuarios.
    const par = [usuarioA, usuarioB].sort().join('__')
    return { id: `dm_${par}`, type: 'D', name: par }
  }
}
