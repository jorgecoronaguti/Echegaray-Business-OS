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

/**
 * Techo de tiempo de CADA llamada a Mattermost, en ms.
 *
 * `abrirDialogo` y `actualizarPost` se llaman DENTRO del manejador HTTP de asistencia: sin
 * techo, un Mattermost que no responde deja colgado el pedido del jefe de obra para siempre.
 * El default es holgado a propósito — este cliente también lo usan el worker de comunicación
 * y el bot, y ahí una llamada lenta es normal: el timeout está para cortar lo colgado, no
 * para apurar lo lento.
 */
const TIMEOUT_MS = Number(process.env.MM_FETCH_TIMEOUT_MS || 30000)

/** Cliente real contra la API v4 de Mattermost. */
export class MattermostCliente {
  /** @param {{ baseUrl:string, token:string, fetch?:Function, timeoutMs?:number }} cfg */
  constructor(cfg) {
    if (!cfg?.baseUrl) throw new Error('MattermostCliente: falta baseUrl')
    if (!cfg?.token) throw new Error('MattermostCliente: falta token')
    this.baseUrl = cfg.baseUrl.replace(/\/+$/, '')
    this.token = cfg.token
    this._fetch = cfg.fetch ?? globalThis.fetch
    this.timeoutMs = Number.isFinite(Number(cfg.timeoutMs)) ? Number(cfg.timeoutMs) : TIMEOUT_MS
  }

  async _req(metodo, ruta, cuerpo) {
    const ac = new AbortController()
    const t = setTimeout(() => ac.abort(), this.timeoutMs)
    try {
      const res = await this._fetch(`${this.baseUrl}/api/v4${ruta}`, {
        method: metodo,
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
        body: cuerpo == null ? undefined : JSON.stringify(cuerpo),
        signal: ac.signal,
      })
      // La lectura del cuerpo va DENTRO del mismo techo: un servidor que manda los headers y
      // después no manda el cuerpo cuelga igual de fuerte que uno que no contesta nunca.
      const texto = await res.text()
      const json = texto ? safeJson(texto) : null
      if (!res.ok) {
        const err = new Error(`mattermost ${metodo} ${ruta} → ${res.status}: ${json?.message ?? texto}`)
        err.status = res.status
        err.reintentable = esReintentable(res.status)
        throw err
      }
      return json
    } catch (e) {
      // Un `AbortError` pelado no le dice nada a nadie: se traduce a "Mattermost no respondió",
      // reintentable como cualquier fallo transitorio de red.
      if (e?.name === 'AbortError') {
        const err = new Error(`mattermost ${metodo} ${ruta} → Mattermost no respondió en ${this.timeoutMs}ms`)
        err.status = 504
        err.reintentable = true
        throw err
      }
      throw e
    } finally {
      // Éxito, error HTTP o excepción: el timer siempre se limpia. Uno vivo por llamada
      // mantendría despierto al proceso del worker sin que nada lo esté esperando.
      clearTimeout(t)
    }
  }

  /** Crea un post (mensaje) en un canal, opcionalmente en un hilo (root_id). */
  crearPost({ channel_id, message, root_id, file_ids, props }) {
    return this._req('POST', '/posts', { channel_id, message, root_id, file_ids, props })
  }

  /** Agrega una reacción (emoji) a un post en nombre de un usuario. */
  agregarReaccion({ user_id, post_id, emoji_name }) {
    return this._req('POST', '/reactions', { user_id, post_id, emoji_name })
  }

  /** Metadata de un adjunto: `name`, `mime_type` y `size`. Se pide ANTES de bajarlo, para no
   *  traerse 40 MB de un formato que después no se puede mirar. */
  archivoInfo(fileId) {
    return this._req('GET', `/files/${encodeURIComponent(fileId)}/info`)
  }

  /**
   * SUBE un archivo binario a un canal y devuelve su `file_id`, listo para `crearPost`.
   *
   * Mattermost separa subir de postear: primero se sube al canal, después el post referencia el id.
   * Sin este paso, `crearPost({file_ids})` sólo puede reenviar adjuntos que ya vivían en Mattermost
   * — no hay forma de mandar un PDF que salió de Drive, del disco o de un generador.
   *
   * NO pasa por `_req`, por lo mismo que `archivo()`: el cuerpo es `multipart/form-data` binario y
   * serializarlo como JSON lo corrompe.
   *
   * @param {{channel_id:string, nombre:string, datos:Buffer|Uint8Array, mime?:string}} p
   * @returns {Promise<{id:string, name:string, size:number}>}
   */
  async subirArchivo({ channel_id, nombre, datos, mime = 'application/octet-stream' }) {
    if (!channel_id) throw new Error('subirArchivo: falta channel_id')
    if (!nombre) throw new Error('subirArchivo: falta el nombre del archivo')
    if (!datos?.length) throw new Error(`subirArchivo: "${nombre}" viene vacío — no subo un archivo de 0 bytes`)
    const form = new FormData()
    form.append('channel_id', channel_id)
    form.append('files', new Blob([datos], { type: mime }), nombre)

    const ac = new AbortController()
    const t = setTimeout(() => ac.abort(), this.timeoutMs)
    try {
      const res = await this._fetch(`${this.baseUrl}/api/v4/files`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.token}` }, // el boundary lo pone fetch: no fijarlo a mano
        body: form,
        signal: ac.signal,
      })
      if (!res.ok) {
        const err = new Error(`mattermost POST /files (${nombre}) → ${res.status}`)
        err.status = res.status
        err.reintentable = esReintentable(res.status)
        throw err
      }
      const j = await res.json()
      const info = j?.file_infos?.[0]
      // Un 200 sin file_info es un éxito aparente que después rompe el post con un id vacío.
      if (!info?.id) throw new Error(`mattermost POST /files (${nombre}) → 200 sin file_info: no hay id que adjuntar`)
      return info
    } catch (e) {
      if (e?.name === 'AbortError') {
        const err = new Error(`mattermost POST /files (${nombre}) → no respondió en ${this.timeoutMs}ms`)
        err.status = 504
        err.reintentable = true
        throw err
      }
      throw e
    } finally { clearTimeout(t) }
  }

  /**
   * Baja el contenido BINARIO de un adjunto.
   *
   * NO pasa por `_req` a propósito: `_req` lee el cuerpo como texto y lo parsea como JSON, que para
   * un JPEG es una forma elegante de corromperlo. Mantiene el mismo techo de tiempo y la misma
   * clasificación de errores reintentables.
   * @returns {Promise<Buffer>}
   */
  async archivo(fileId) {
    const ac = new AbortController()
    const t = setTimeout(() => ac.abort(), this.timeoutMs)
    try {
      const res = await this._fetch(`${this.baseUrl}/api/v4/files/${encodeURIComponent(fileId)}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${this.token}` },
        signal: ac.signal,
      })
      if (!res.ok) {
        const err = new Error(`mattermost GET /files/${fileId} → ${res.status}`)
        err.status = res.status
        err.reintentable = esReintentable(res.status)
        throw err
      }
      return Buffer.from(await res.arrayBuffer())
    } catch (e) {
      if (e?.name === 'AbortError') {
        const err = new Error(`mattermost GET /files/${fileId} → Mattermost no respondió en ${this.timeoutMs}ms`)
        err.status = 504
        err.reintentable = true
        throw err
      }
      throw e
    } finally {
      clearTimeout(t)
    }
  }

  /**
   * UNA PÁGINA DEL HISTORIAL DE UN CANAL, del más nuevo al más viejo.
   *
   * Existe para el backfill de comprobantes: recuperar los adjuntos que ya se mandaron por chat
   * exige recorrer TODO el canal, y hacerlo con `fetch` suelto desde un script sería una segunda
   * forma de hablarle a Mattermost —otro manejo del token, otro timeout, otro tratamiento del
   * error— al lado de ésta. El cliente es uno.
   *
   * Devuelve `{order, posts}` tal cual lo da la API: `order` es el orden real y `posts` un objeto
   * indexado por id. Recorrer `Object.values(posts)` perdería el orden.
   */
  postsDelCanal({ channel_id, page = 0, per_page = 200 }) {
    return this._req('GET', `/channels/${encodeURIComponent(channel_id)}/posts?page=${page}&per_page=${per_page}`)
  }

  /** Resuelve un canal por equipo+nombre (para no hardcodear channel_ids). */
  canalPorNombre({ team_id, nombre }) {
    return this._req('GET', `/teams/${team_id}/channels/name/${encodeURIComponent(nombre)}`)
  }

  /**
   * ¿Este usuario es miembro de este canal?
   *
   * Es la pregunta que convierte "estar en el canal" en una habilitación. El bot NO es admin y
   * aun así puede contestarla para los canales de los que él mismo es miembro: verificado en
   * vivo el 03/08 contra el Mattermost de producción — 200 para los cinco miembros del canal de
   * Asistencia, 404 para quien no está.
   *
   * DEVUELVE UN BOOLEANO SÓLO CUANDO LA RESPUESTA ES CONCLUYENTE. El 404 de Mattermost significa
   * "no es miembro" y es una respuesta; un 500, un timeout o un token vencido NO lo son, y esos
   * TIRAN a propósito: quien llama tiene que poder distinguir "no está" de "no pude averiguarlo"
   * para poder fallar cerrado. Devolver `false` ante un error de red convertiría una caída del
   * servidor en una denegación silenciosa — o, con la lógica invertida, en un permiso regalado.
   */
  async miembroDeCanal({ channel_id, user_id }) {
    try {
      await this._req('GET', `/channels/${encodeURIComponent(channel_id)}/members/${encodeURIComponent(user_id)}`)
      return true
    } catch (e) {
      if (e?.status === 404) return false
      throw e
    }
  }

  /**
   * Quién es este user_id: `username`, `email`, nombre y si es bot o está dado de baja.
   *
   * Es la fuente de la identidad del OS, y en particular DEL CORREO: Mattermost es donde la
   * persona se autentica, así que su email es el único que no es una adivinanza. Inferirlo del
   * username termina, un día, creando el evento en la cuenta de otro.
   *
   * `null` significa exactamente una cosa: Mattermost contestó que no existe (404). Un 500, un
   * timeout o un token vencido TIRAN, igual que en `miembroDeCanal`, para que quien llama pueda
   * distinguir «no está» de «no pude averiguarlo» y no reconciliar a ciegas.
   */
  async usuario(userId) {
    try {
      return await this._req('GET', `/users/${encodeURIComponent(userId)}`)
    } catch (e) {
      if (e?.status === 404) return null
      throw e
    }
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

  /**
   * TODOS los canales donde el bot es miembro, de todos sus equipos.
   *
   * Existe para poder VERIFICAR configuración contra la realidad: la lista de canales de ingesta se
   * tipea en un `.env` y un nombre que no corresponde a ningún canal no da error en ningún lado —
   * simplemente se traga los mensajes. Preguntarle a la única fuente que sabe cuáles existen cuesta
   * dos llamadas al arrancar.
   *
   * Devuelve `{id, name, display_name, type}`. `name` es el SLUG (lo que viaja en el frame WS),
   * `display_name` es lo que se ve en la pantalla: son distintos y confundirlos ya costó días.
   */
  async canalesDelBot({ botUserId } = {}) {
    const equipos = await this._req('GET', '/users/me/teams')
    const quien = botUserId ? encodeURIComponent(botUserId) : 'me'
    const out = []
    for (const t of equipos ?? []) {
      const cs = await this._req('GET', `/users/${quien}/teams/${t.id}/channels`)
      for (const c of cs ?? []) out.push({ id: c.id, name: c.name, display_name: c.display_name, type: c.type })
    }
    return out
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
    this.archivos = new Map() // id → {name, mime_type, size, data}
    // MEMBRESÍAS: canal → Set(user_id). VACÍO POR DEFECTO, y esa es la parte importante — el
    // doble arranca negando, igual que el servidor real ante alguien que no está en el canal.
    // Un doble que dijera que sí "para no molestar" haría pasar por bueno justo el permiso que
    // este mapa existe para probar.
    this.miembros = new Map()
    // USUARIOS: id → {id, username, email, first_name, ...}. También VACÍO por defecto: un doble
    // que inventara un usuario para cualquier id dejaría pasar en verde exactamente el defecto que
    // la reconciliación existe para impedir (dar por buena una identidad que nadie verificó).
    this.usuarios = new Map()
    this._fallo = null // { veces, status } → falla las próximas N llamadas
    this._seq = 0
  }

  /** Alta de usuario para los tests: `fake.agregarUsuario({ id, username, email })`. */
  agregarUsuario(u) {
    this.usuarios.set(String(u.id), { delete_at: 0, is_bot: false, ...u, id: String(u.id) })
    return this
  }

  /** Alta de membresía para los tests: `fake.agregarAlCanal('canal', 'usuario')`. */
  agregarAlCanal(channelId, userId) {
    if (!this.miembros.has(channelId)) this.miembros.set(channelId, new Set())
    this.miembros.get(channelId).add(userId)
    return this
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

  /** Sube y registra en `this.archivos`, con las mismas guardas que el real. */
  async subirArchivo({ channel_id, nombre, datos, mime = 'application/octet-stream' }) {
    this._maybeFail('subirArchivo')
    if (!channel_id) throw new Error('subirArchivo: falta channel_id')
    if (!nombre) throw new Error('subirArchivo: falta el nombre del archivo')
    if (!datos?.length) throw new Error(`subirArchivo: "${nombre}" viene vacío — no subo un archivo de 0 bytes`)
    const info = { id: `file_${++this._seq}`, name: nombre, mime_type: mime, size: datos.length }
    this.archivos.set(info.id, { ...info, data: Buffer.from(datos) })
    return info
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

  /** Adjuntos de mentira: `fake.archivos.set(id, {name, mime_type, size, data})`. */
  async archivoInfo(fileId) {
    this._maybeFail('archivoInfo')
    const f = this.archivos.get(fileId)
    if (!f) { const e = new Error(`fake mattermost: no existe el archivo ${fileId}`); e.status = 404; throw e }
    return { id: fileId, name: f.name ?? fileId, mime_type: f.mime_type ?? 'application/octet-stream', size: f.size ?? (f.data?.length ?? 0) }
  }

  async archivo(fileId) {
    this._maybeFail('archivo')
    const f = this.archivos.get(fileId)
    if (!f) { const e = new Error(`fake mattermost: no existe el archivo ${fileId}`); e.status = 404; throw e }
    return Buffer.isBuffer(f.data) ? f.data : Buffer.from(String(f.data ?? ''))
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

  /** Misma semántica que el real: booleano si la respuesta es concluyente, y TIRA si no. */
  async miembroDeCanal({ channel_id, user_id }) {
    this._maybeFail('miembroDeCanal')
    return this.miembros.get(channel_id)?.has(user_id) === true
  }

  /** Misma semántica que el real: `null` sólo cuando el usuario NO existe; el fallo simulado tira. */
  async usuario(userId) {
    this._maybeFail('usuario')
    return this.usuarios.get(String(userId)) ?? null
  }

  async canalDirecto({ usuarioA, usuarioB }) {
    this._maybeFail('canalDirecto')
    // Mismo criterio que Mattermost: el id del DM es estable para el par de usuarios.
    const par = [usuarioA, usuarioB].sort().join('__')
    return { id: `dm_${par}`, type: 'D', name: par }
  }
}
