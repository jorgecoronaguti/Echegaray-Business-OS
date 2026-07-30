// ESTADO DEL FORMULARIO DE ASISTENCIA — server-side, con dueño, con vencimiento y con
// acciones firmadas.
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
// Reglas que hace cumplir este módulo:
//   · una sola sesión abierta por persona;
//   · sólo el que la abrió puede operarla o confirmarla;
//   · vence (TTL configurable) y una sesión vencida no se puede confirmar;
//   · las acciones van FIRMADAS (HMAC): un callback alterado no se ejecuta;
//   · la confirmación es de un solo uso: el replay no vuelve a mutar.

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

/** Secreto de firma de acciones. Fail-closed: sin secreto no se firma ni se acepta nada,
 *  salvo modo dev EXPLÍCITO (mismo criterio que el borde entrante del PR-3). */
function secretoDelEntorno() {
  const s = process.env.ORQ_ASISTENCIA_SECRET || process.env.MM_INCOMING_SECRET || null
  if (s) return s
  if (process.env.COMM_DEV === '1') return 'dev-solo-local'
  return null
}

/**
 * Firma una acción de la interfaz. El token ata la acción a la sesión Y a su dueño: un
 * token de otra sesión, de otra acción o de otro usuario no valida. Lo usa el front-end
 * de botones (cuando se habilite el endpoint entrante); el flujo de texto no lo necesita,
 * pero la garantía tiene que existir antes de que haya callbacks.
 */
export function firmarAccion({ sesionId, accion, dato = '', plataformaUserId }, sec = secretoDelEntorno()) {
  if (!sec) return null
  return createHmac('sha256', sec)
    .update(`${sesionId}.${accion}.${dato}.${plataformaUserId}`)
    .digest('hex').slice(0, 32)
}

/** Verifica un token de acción en tiempo constante. */
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
    const ya = this.filas.find((f) => f.idempotency_key === idempotencyKey && f.estado === ESTADO_SESION.CONFIRMADA && idempotencyKey)
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
  /** @param {{query:Function, withTx:Function}} port */
  constructor(port) {
    if (!port?.query) throw new Error('SesionesPostgres: falta el port')
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

  async confirmar(id, { idempotencyKey } = {}) {
    return this.port.withTx(async (client) => {
      const ya = await client.query(
        `select id from comunicacion.asistencia_sesiones
          where idempotency_key = $1 and estado = $2 limit 1`,
        [idempotencyKey ?? null, ESTADO_SESION.CONFIRMADA])
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
