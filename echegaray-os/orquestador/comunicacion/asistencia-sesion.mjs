// ESTADO DEL FORMULARIO DE ASISTENCIA — server-side, con dueño, con vencimiento y con
// confirmación de un solo uso.
//
// POR QUÉ VIVE EN LA BASE Y NO EN MEMORIA DEL PROCESO. El bot son DOS procesos: el
// consumidor WebSocket sólo ingiere el mensaje, y el worker de comunicación es el que lo
// procesa y responde. Un formulario a medio llenar en memoria del consumidor sería
// invisible para el worker y se perdería en cada reinicio. La sesión es estado efímero
// (TTL), NO una copia de la asistencia: la verdad sigue siendo el Sheet JORNALES.
//
// PUERTO + DOS IMPLEMENTACIONES, como el resto del Communication Service: `SesionesPostgres`
// para producción y `SesionesMemoria` para tests. La máquina de estados del flujo se
// prueba entera sin base, que es la única forma de que esté realmente probada.
//
// Reglas que hace cumplir este módulo, y que son las que protegen el flujo por DM:
//   · una sola sesión abierta por persona;
//   · sólo el que la abrió puede operarla o confirmarla (propiedad);
//   · vence (TTL configurable) y una sesión vencida no se puede confirmar;
//   · la confirmación es de un solo uso: el replay no vuelve a mutar.
//
// FIRMA HMAC (firmarAccion / verificarAccion): CÓDIGO RESERVADO, HOY NO APORTA SEGURIDAD.
// Se deja escrito y probado, pero no está conectado a nada y no debe leerse como si el
// flujo actual estuviera firmado. Los hechos, para que nadie tenga que deducirlos:
//
//   · El bot entra por una conexión WebSocket SALIENTE (PR-4.2). No hay endpoint HTTP
//     entrante publicado para este skill, y la interfaz es texto por DM: `asistencia-ui.mjs`
//     renderiza sólo texto, sin attachments, botones ni diálogos interactivos.
//   · Por lo tanto NO existe un payload controlado por el cliente que haya que verificar.
//     La identidad (`plataforma_user_id`) viene del actor del evento autenticado de
//     Mattermost, no de lo que la persona escribe.
//   · Y el `sesionId` NUNCA viaja al cliente: el flujo encuentra la sesión con
//     `abiertaDe({ plataformaUserId })` a partir del actor autenticado. No hay nada
//     dando la vuelta por el cliente que se pueda alterar, así que no hay nada que firmar.
//     Lo que la persona manda es un NÚMERO de fila, que el servidor traduce contra la
//     planilla recién leída.
//
// QUÉ LA ACTIVARÍA: botones o diálogos interactivos de Mattermost. Eso exige que el
// servidor de MM haga POST a una URL nuestra — endpoint HTTP entrante publicado + ruta en
// Caddy + integración configurada. Recién ahí aparece un `context` que viaja al cliente y
// vuelve, es decir manipulable, y recién ahí la firma pasa a proteger algo real. Es
// infraestructura nueva y una decisión de Nivel E: no se activa sola.
//
// Hasta entonces, lo que protege una confirmación es TTL + propiedad de la sesión +
// idempotencia de un solo uso. Nada más. Los tests de firma de este módulo prueban la
// primitiva criptográfica, no una defensa en producción.

import { createHmac, timingSafeEqual, randomUUID } from 'node:crypto'

/** Minutos de vida de un formulario. Corto a propósito: la planilla cambia. */
export const TTL_MINUTOS = Number(process.env.ORQ_ASISTENCIA_TTL_MIN ?? 20)

export const ESTADO_SESION = Object.freeze({
  ABIERTA: 'abierta',
  CONFIRMADA: 'confirmada',
  CANCELADA: 'cancelada',
  VENCIDA: 'vencida',
  CONFLICTO: 'conflicto',
  // La escritura se intentó y falló. Existe para que la clave de idempotencia NO quede
  // quemada: el índice único cuenta sólo las 'confirmada', así que un reintento del jefe
  // vuelve a poder escribir. Una carga que no entró no está registrada.
  FALLIDA: 'fallida',
})

export const RECHAZO = Object.freeze({
  NO_EXISTE: 'sesion_no_existe',
  AJENA: 'sesion_ajena',
  VENCIDA: 'sesion_vencida',
  CERRADA: 'sesion_cerrada',
  TOKEN_INVALIDO: 'token_invalido',
  SIN_SECRETO: 'sin_secreto',
})

/** Secreto de firma de acciones RESERVADAS (ver el encabezado: hoy no las usa el flujo).
 *  Fail-closed: sin secreto no se firma ni se acepta nada, salvo modo dev EXPLÍCITO
 *  (mismo criterio que el borde entrante del PR-3). Que falte NO degrada el flujo por DM,
 *  porque el flujo por DM no verifica firmas. */
function secretoDelEntorno() {
  const s = process.env.ORQ_ASISTENCIA_SECRET || process.env.MM_INCOMING_SECRET || null
  if (s) return s
  if (process.env.COMM_DEV === '1') return 'dev-solo-local'
  return null
}

/**
 * RESERVADO — no lo llama el flujo productivo (ver el encabezado del archivo). Hoy sus
 * únicos llamadores son los tests.
 *
 * Firma una acción de la interfaz: el token ata la acción a la sesión Y a su dueño, de modo
 * que un token de otra sesión, de otra acción o de otro usuario no valida. Está escrito de
 * antemano para el día que se habilite el endpoint entrante y la interfaz pase a botones —
 * ahí el `context` del callback sí es manipulable por el cliente y hay algo que firmar.
 * Mientras la interfaz sea texto por DM, nada de esto se ejecuta.
 */
export function firmarAccion({ sesionId, accion, dato = '', plataformaUserId }, sec = secretoDelEntorno()) {
  if (!sec) return null
  return createHmac('sha256', sec)
    .update(`${sesionId}.${accion}.${dato}.${plataformaUserId}`)
    .digest('hex').slice(0, 32)
}

/** RESERVADO, como firmarAccion: ningún borde del flujo actual llama a esta función.
 *  Verifica un token de acción en tiempo constante. */
export function verificarAccion({ token, sesionId, accion, dato = '', plataformaUserId }, sec = secretoDelEntorno()) {
  if (!sec) return { ok: false, motivo: RECHAZO.SIN_SECRETO }
  const esperado = firmarAccion({ sesionId, accion, dato, plataformaUserId }, sec)
  if (!token || !esperado) return { ok: false, motivo: RECHAZO.TOKEN_INVALIDO }
  const a = Buffer.from(String(token))
  const b = Buffer.from(esperado)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, motivo: RECHAZO.TOKEN_INVALIDO }
  return { ok: true }
}

/** Reglas de vigencia/propiedad, compartidas por las dos implementaciones. */
function evaluar(s, { plataforma, plataformaUserId, ahora }) {
  if (!s) return { ok: false, motivo: RECHAZO.NO_EXISTE }
  if (plataformaUserId != null && (s.plataforma !== plataforma || s.plataforma_user_id !== plataformaUserId)) {
    return { ok: false, motivo: RECHAZO.AJENA, sesion: s }
  }
  if (s.estado !== ESTADO_SESION.ABIERTA) return { ok: false, motivo: RECHAZO.CERRADA, sesion: s }
  if (new Date(s.expira_at).getTime() <= ahora) return { ok: false, motivo: RECHAZO.VENCIDA, sesion: s }
  return { ok: true, sesion: s }
}

/** Implementación en MEMORIA (tests y demo). Mismo puerto que la de Postgres. */
export class SesionesMemoria {
  constructor({ ahora = () => Date.now() } = {}) {
    this.filas = []
    this.ahora = ahora
  }

  async abrir({ plataforma = 'mattermost', plataformaUserId, plataformaUsername, channelId, rootPostId, fechaOperativa, correlationId = null, ttlMinutos = TTL_MINUTOS }) {
    for (const f of this.filas) {
      if (f.plataforma === plataforma && f.plataforma_user_id === plataformaUserId && f.estado === ESTADO_SESION.ABIERTA) {
        f.estado = ESTADO_SESION.CANCELADA
        f.cerrada_at = new Date(this.ahora()).toISOString()
      }
    }
    const s = {
      id: randomUUID(), plataforma, plataforma_user_id: plataformaUserId,
      plataforma_username: plataformaUsername ?? null, channel_id: channelId ?? null,
      root_post_id: rootPostId ?? null, estado: ESTADO_SESION.ABIERTA,
      fecha_operativa: fechaOperativa ?? null, clave_obra: null, spreadsheet_id: null, pestana: null,
      marcas: {}, plan: null, idempotency_key: null, correlation_id: correlationId,
      intentos_confirmacion: 0,
      expira_at: new Date(this.ahora() + ttlMinutos * 60000).toISOString(),
      creado_at: new Date(this.ahora()).toISOString(), cerrada_at: null,
    }
    this.filas.push(s)
    return s
  }

  _abierta(plataforma, userId) {
    return this.filas.find((f) => f.plataforma === plataforma && f.plataforma_user_id === userId && f.estado === ESTADO_SESION.ABIERTA) ?? null
  }

  async abiertaDe({ plataforma = 'mattermost', plataformaUserId }) {
    const r = evaluar(this._abierta(plataforma, plataformaUserId), { plataforma, plataformaUserId, ahora: this.ahora() })
    if (!r.ok && r.motivo === RECHAZO.VENCIDA) await this.cerrar(r.sesion.id, ESTADO_SESION.VENCIDA)
    return r
  }

  async cargar({ id, plataforma = 'mattermost', plataformaUserId }) {
    const r = evaluar(this.filas.find((f) => f.id === id) ?? null, { plataforma, plataformaUserId, ahora: this.ahora() })
    if (!r.ok && r.motivo === RECHAZO.VENCIDA) await this.cerrar(r.sesion.id, ESTADO_SESION.VENCIDA)
    return r
  }

  _set(id, patch) {
    const s = this.filas.find((f) => f.id === id)
    if (!s) return null
    Object.assign(s, patch, { actualizado_at: new Date(this.ahora()).toISOString() })
    return s
  }

  /** Ata la sesión al post de su tarjeta. Ver el porqué en SesionesPostgres.atarPost. */
  async atarPost(id, postId) {
    if (!postId) return null
    const s = this.filas.find((f) => f.id === id)
    if (!s || s.root_post_id) return null
    return this._set(id, { root_post_id: postId })
  }

  async guardarContexto(id, { fechaOperativa, claveObra, spreadsheetId, pestana }) {
    const s = this.filas.find((f) => f.id === id)
    if (!s) return null
    return this._set(id, {
      fecha_operativa: fechaOperativa ?? s.fecha_operativa,
      clave_obra: claveObra ?? s.clave_obra,
      spreadsheet_id: spreadsheetId ?? s.spreadsheet_id,
      pestana: pestana ?? s.pestana,
    })
  }

  // Cambiar las marcas INVALIDA el plan: el plan guardado es la foto de la planilla que
  // el jefe revisó, y es la base contra la que se detecta concurrencia. Si se sigue
  // marcando gente después del preview, esa foto ya no corresponde.
  async guardarMarcas(id, marcas) { return this._set(id, { marcas: marcas ?? {}, plan: null, idempotency_key: null }) }

  async guardarPlan(id, plan) { return this._set(id, { plan: plan ?? null, idempotency_key: plan?.idempotency_key ?? null }) }

  async confirmar(id, { idempotencyKey } = {}) {
    // Acotado a ESTA sesión, igual que la implementación en Postgres: "duplicado" es el segundo
    // click en Registrar, no una carga parecida de otro día. Ver el porqué en SesionesPostgres.
    const ya = this.filas.find((f) => f.id === id && f.idempotency_key === idempotencyKey && f.estado === ESTADO_SESION.CONFIRMADA && idempotencyKey)
    if (ya) return { ok: true, duplicado: true, sesion_id: ya.id }
    const s = this.filas.find((f) => f.id === id)
    if (!s || s.estado !== ESTADO_SESION.ABIERTA) return { ok: false, motivo: RECHAZO.CERRADA }
    Object.assign(s, {
      estado: ESTADO_SESION.CONFIRMADA,
      idempotency_key: idempotencyKey ?? s.idempotency_key,
      intentos_confirmacion: s.intentos_confirmacion + 1,
      cerrada_at: new Date(this.ahora()).toISOString(),
    })
    return { ok: true, duplicado: false, sesion: s }
  }

  async cerrar(id, estado) {
    const s = this._set(id, { estado, cerrada_at: new Date(this.ahora()).toISOString() })
    return s ? { id: s.id, estado: s.estado } : null
  }

  async vencer() {
    let n = 0
    for (const f of this.filas) {
      if (f.estado === ESTADO_SESION.ABIERTA && new Date(f.expira_at).getTime() <= this.ahora()) {
        f.estado = ESTADO_SESION.VENCIDA
        n++
      }
    }
    return n
  }
}

/** Implementación en POSTGRES (producción), sobre `comunicacion.asistencia_sesiones`. */
export class SesionesPostgres {
  /**
   * @param {{query:Function, withTx:Function}} port
   *
   * Exige las DOS capacidades al construirse, no al usarse: abrir y confirmar una sesión
   * viven dentro de una transacción, así que un port sin `withTx` (el Pool de `pg` pelado,
   * por ejemplo) no falla al arrancar sino en la cara del jefe de obra, y en el peor
   * momento posible — al confirmar la carga.
   */
  constructor(port) {
    if (!port?.query) throw new Error('SesionesPostgres: falta el port')
    if (typeof port.withTx !== 'function') {
      throw new Error('SesionesPostgres: el port no sabe abrir transacciones (falta withTx)')
    }
    this.port = port
  }

  async abrir({ plataforma = 'mattermost', plataformaUserId, plataformaUsername, channelId, rootPostId, fechaOperativa, correlationId = null, ttlMinutos = TTL_MINUTOS }) {
    if (!plataformaUserId) throw new Error('abrir: falta plataformaUserId')
    return this.port.withTx(async (client) => {
      await client.query(
        `update comunicacion.asistencia_sesiones
            set estado = $3, cerrada_at = now(), actualizado_at = now()
          where plataforma = $1 and plataforma_user_id = $2 and estado = $4`,
        [plataforma, plataformaUserId, ESTADO_SESION.CANCELADA, ESTADO_SESION.ABIERTA])
      const { rows } = await client.query(
        `insert into comunicacion.asistencia_sesiones
           (plataforma, plataforma_user_id, plataforma_username, channel_id, root_post_id,
            fecha_operativa, correlation_id, expira_at)
         values ($1,$2,$3,$4,$5,$6,$7, now() + make_interval(mins => $8)) returning *`,
        [plataforma, plataformaUserId, plataformaUsername ?? null, channelId ?? null,
          rootPostId ?? null, fechaOperativa ?? null, correlationId, ttlMinutos])
      return rows[0]
    })
  }

  async abiertaDe({ plataforma = 'mattermost', plataformaUserId }) {
    const { rows } = await this.port.query(
      `select * from comunicacion.asistencia_sesiones
        where plataforma = $1 and plataforma_user_id = $2 and estado = $3 limit 1`,
      [plataforma, plataformaUserId, ESTADO_SESION.ABIERTA])
    const r = evaluar(rows[0] ?? null, { plataforma, plataformaUserId, ahora: Date.now() })
    if (!r.ok && r.motivo === RECHAZO.VENCIDA) await this.cerrar(r.sesion.id, ESTADO_SESION.VENCIDA)
    return r
  }

  async cargar({ id, plataforma = 'mattermost', plataformaUserId }) {
    if (!id) return { ok: false, motivo: RECHAZO.NO_EXISTE }
    const { rows } = await this.port.query('select * from comunicacion.asistencia_sesiones where id = $1', [id])
    const r = evaluar(rows[0] ?? null, { plataforma, plataformaUserId, ahora: Date.now() })
    if (!r.ok && r.motivo === RECHAZO.VENCIDA) await this.cerrar(r.sesion.id, ESTADO_SESION.VENCIDA)
    return r
  }

  /**
   * Ata la sesión al post de su tarjeta, apenas se sabe cuál es.
   *
   * Cuando la tarjeta la publica el BOT (el slash command lo hace así desde el 03/08), el id
   * se conoce en el mismo arranque y la sesión no tiene que esperar al primer click para
   * saber a qué post volver — que es de lo que dependía el refresco después de un diálogo.
   *
   * SÓLO ATA UNA VEZ (`root_post_id is null`): una sesión ya atada pertenece a una tarjeta
   * concreta, y reapuntarla mandaría los refrescos al mensaje equivocado. Devolver `null`
   * cuando no ata es información, no un fallo: quien llama decide si le importa.
   */
  async atarPost(id, postId) {
    if (!postId) return null
    const { rows } = await this.port.query(
      `update comunicacion.asistencia_sesiones
          set root_post_id = $2, actualizado_at = now()
        where id = $1 and root_post_id is null returning *`, [id, postId])
    return rows[0] ?? null
  }

  async guardarContexto(id, { fechaOperativa, claveObra, spreadsheetId, pestana }) {
    const { rows } = await this.port.query(
      `update comunicacion.asistencia_sesiones
          set fecha_operativa = coalesce($2, fecha_operativa),
              clave_obra      = coalesce($3, clave_obra),
              spreadsheet_id  = coalesce($4, spreadsheet_id),
              pestana         = coalesce($5, pestana),
              actualizado_at  = now()
        where id = $1 returning *`,
      [id, fechaOperativa ?? null, claveObra ?? null, spreadsheetId ?? null, pestana ?? null])
    return rows[0] ?? null
  }

  /** Igual que en memoria: marcar de nuevo INVALIDA el plan revisado (ver el comentario
   *  de SesionesMemoria.guardarMarcas: el plan es la base de la detección de concurrencia). */
  async guardarMarcas(id, marcas) {
    const { rows } = await this.port.query(
      `update comunicacion.asistencia_sesiones
          set marcas = $2::jsonb, plan = null, idempotency_key = null, actualizado_at = now()
        where id = $1 returning *`, [id, JSON.stringify(marcas ?? {})])
    return rows[0] ?? null
  }

  async guardarPlan(id, plan) {
    const { rows } = await this.port.query(
      `update comunicacion.asistencia_sesiones
          set plan = $2::jsonb, idempotency_key = $3, actualizado_at = now()
        where id = $1 returning *`, [id, JSON.stringify(plan ?? null), plan?.idempotency_key ?? null])
    return rows[0] ?? null
  }

  /**
   * Confirma ESTA sesión. `duplicado:true` significa "este mismo formulario ya se confirmó"
   * (el segundo click en Registrar), no "alguna vez se cargó algo parecido".
   *
   * POR QUÉ ESTÁ ACOTADO A LA SESIÓN (31/07). La clave de idempotencia es una función pura de
   * archivo + pestaña + fecha + obra + quién + horas: para la misma obra y el mismo día da
   * SIEMPRE lo mismo. Buscándola en TODAS las sesiones confirmadas, una carga legítima quedaba
   * bloqueada para siempre: pasó en producción — a la mañana se cargó Taller, después una
   * persona borró la celda a mano, y al volver a cargar el sistema contestaba "esta carga ya se
   * registró" mientras la planilla seguía vacía. La memoria de una clave le ganaba a la planilla.
   *
   * Quién decide si hay que escribir es la PLANILLA, no una clave: el núcleo relee cada celda y
   * compara su huella, así que una carga repetida de verdad no escribe nada (queda `sin_cambio`)
   * y una carga sobre una celda que alguien vació sí escribe, que es lo correcto. El doble click
   * sobre el mismo formulario lo siguen atajando esta condición y el `where estado = 'abierta'`
   * del UPDATE: el segundo pierde la carrera.
   */
  async confirmar(id, { idempotencyKey } = {}) {
    return this.port.withTx(async (client) => {
      const ya = await client.query(
        `select id from comunicacion.asistencia_sesiones
          where id = $1 and idempotency_key = $2 and estado = $3 limit 1`,
        [id, idempotencyKey ?? null, ESTADO_SESION.CONFIRMADA])
      if (ya.rows.length) return { ok: true, duplicado: true, sesion_id: ya.rows[0].id }
      const { rows } = await client.query(
        `update comunicacion.asistencia_sesiones
            set estado = $2, idempotency_key = coalesce($3, idempotency_key),
                intentos_confirmacion = intentos_confirmacion + 1,
                cerrada_at = now(), actualizado_at = now()
          where id = $1 and estado = $4 returning *`,
        [id, ESTADO_SESION.CONFIRMADA, idempotencyKey ?? null, ESTADO_SESION.ABIERTA])
      if (!rows.length) return { ok: false, motivo: RECHAZO.CERRADA }
      return { ok: true, duplicado: false, sesion: rows[0] }
    })
  }

  async cerrar(id, estado) {
    const { rows } = await this.port.query(
      `update comunicacion.asistencia_sesiones
          set estado = $2, cerrada_at = now(), actualizado_at = now()
        where id = $1 returning id, estado`, [id, estado])
    return rows[0] ?? null
  }

  async vencer() {
    const { rows } = await this.port.query('select comunicacion.vencer_sesiones_asistencia() as n')
    return rows[0]?.n ?? 0
  }
}

// ── BARRIDO PERIÓDICO DE VENCIMIENTO ────────────────────────────────────────────
// POR QUÉ EXISTE. `abiertaDe`/`cargar` vencen la sesión de forma PEREZOSA: recién cuando
// su dueño vuelve a escribir. Una sesión abandonada (el jefe abre el formulario y se va)
// queda entonces en estado 'abierta' indefinidamente, ocupando el índice único
// `asistencia_sesiones_una_abierta_idx` — "una sola sesión abierta por persona" — hasta
// que esa misma persona reaparezca. El barrido cierra esas sesiones sin depender de que
// nadie escriba.
//
// POR QUÉ CON SU PROPIO INTERVALO Y NO EN CADA TICK. El loop del worker gira cada ~200 ms
// cuando hay trabajo; esto es un UPDATE contra la base y no corresponde hacerlo en cada
// vuelta. Un intervalo propio, holgado frente al TTL, alcanza: el costo de que una sesión
// muerta sobreviva un minuto extra es nulo.

/** Intervalo por defecto del barrido. Holgado frente al TTL (minutos): no hace falta
 *  precisión al segundo para cerrar un formulario que ya nadie va a usar. */
export const VENCER_INTERVALO_MS_DEFAULT = 60_000

/**
 * Devuelve una función para llamar en cada tick del worker: corre el barrido sólo si pasó
 * el intervalo, y NUNCA propaga el error (un fallo de este barrido no debe voltear el tick
 * que procesa inbox/outbox). Cero red extra, cero llamadas a Anthropic: es un UPDATE.
 *
 * @param {object} o
 * @param {{vencer:Function}} o.sesiones repositorio de sesiones (Postgres o Memoria)
 * @param {number} [o.intervaloMs]  ms entre barridos; valor inválido ⇒ el default
 * @param {()=>number} [o.ahora]    reloj inyectable (tests)
 * @param {object} [o.log]          logger del worker (mismo formato JSON)
 */
export function crearVencedorPeriodico({ sesiones, intervaloMs = VENCER_INTERVALO_MS_DEFAULT, ahora = () => Date.now(), log = null } = {}) {
  if (!sesiones?.vencer) throw new Error('crearVencedorPeriodico: falta el repositorio de sesiones')
  // Un env mal escrito da NaN y NaN rompe TODA comparación: sin esta guarda el barrido
  // correría en cada vuelta del loop en vez de una vez por minuto.
  const iv = Number.isFinite(intervaloMs) && intervaloMs > 0 ? intervaloMs : VENCER_INTERVALO_MS_DEFAULT
  let proximo = ahora() // el primer tick barre: al arrancar puede haber sesiones colgadas

  return async function vencerSiCorresponde() {
    const t = ahora()
    if (t < proximo) return { corrio: false, vencidas: 0 }
    proximo = t + iv // se reprograma ANTES de correr: si falla, no se reintenta en loop
    try {
      const vencidas = Number(await sesiones.vencer()) || 0
      // Sólo se loguea cuando hubo algo que cerrar: un "0 vencidas" por minuto es ruido.
      if (vencidas > 0) log?.info?.('sesiones de asistencia vencidas', { vencidas })
      return { corrio: true, vencidas }
    } catch (e) {
      log?.error?.('vencer sesiones de asistencia falló (se reintenta al próximo intervalo)', { error: String(e?.message ?? e) })
      return { corrio: true, vencidas: 0, error: true }
    }
  }
}
