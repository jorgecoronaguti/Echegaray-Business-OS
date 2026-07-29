// PR-4.1 · Endpoint HTTP entrante para eventos de Mattermost — TRANSPORTE DELGADO.
//
// Framework-agnóstico: recibe una "petición" normalizada { method, headers,
// rawBody, ip } y devuelve { status, body }. NO tiene lógica de negocio, NO llama
// al Work Fabric, NO omite inbox/bridge/retries/DLQ: sólo valida el transporte y
// delega TODO al Communication Service (`con.recibir`), que verifica la seguridad
// (HMAC/timestamp/anti-replay/allowlist — M7) y persiste en el inbox.
//
// Responsabilidades permitidas (y sólo estas):
//   - método POST · Content-Type válido · límite de tamaño del body
//   - preservar el RAW BODY exacto (para el HMAC)
//   - extraer headers (firma, timestamp) e IP real (X-Forwarded-For, detrás de Caddy)
//   - parsear el payload de Mattermost (outgoing webhook: x-www-form-urlencoded)
//   - invocar seguridad-entrante + Communication Service vía con.recibir
//   - devolver códigos HTTP estructurados, sin exponer errores internos
//   - nunca loguear secretos, tokens ni firmas completas

const LIMITE_BYTES_DEFAULT = 64 * 1024 // 64 KB: un webhook de chat es chico

/**
 * @param {object} con  conector (o cualquier objeto con `recibir(payload,{seguridad,plataforma})`)
 * @param {object} [opts]
 * @param {object} [opts.autenticador]     autenticador del endpoint (HMAC-o-token). Si se pasa, la AUTH
 *                                         vive acá y `con.recibir` se llama sin verificador (comm-service sin auth).
 *                                         Si no se pasa, se delega la seguridad a `con.recibir` (modo legado HMAC).
 * @param {number} [opts.maxBytes]        límite de tamaño del body
 * @param {string} [opts.headerFirma]     header de la firma HMAC (default 'x-mm-signature')
 * @param {string} [opts.headerTimestamp] header del timestamp (default 'x-mm-timestamp')
 * @param {string} [opts.plataforma]      default 'mattermost'
 */
export function crearManejadorWebhook(con, opts = {}) {
  const maxBytes = opts.maxBytes ?? LIMITE_BYTES_DEFAULT
  const headerFirma = (opts.headerFirma ?? 'x-mm-signature').toLowerCase()
  const headerTs = (opts.headerTimestamp ?? 'x-mm-timestamp').toLowerCase()
  const plataforma = opts.plataforma ?? 'mattermost'
  const autenticador = opts.autenticador ?? null

  return async function manejar(peticion) {
    try {
      if (peticion.method !== 'POST') return http(405, { error: 'method_not_allowed' })

      const ct = String(cabecera(peticion, 'content-type') ?? '')
      if (!/application\/x-www-form-urlencoded|application\/json/i.test(ct)) {
        return http(415, { error: 'unsupported_media_type' })
      }

      const raw = peticion.rawBody ?? ''
      if (Buffer.byteLength(raw, 'utf8') > maxBytes) return http(413, { error: 'payload_too_large' })

      const mm = parsearPayload(raw, ct)
      if (!mm) return http(400, { error: 'bad_request' })

      const payload = aPayloadCanonicoAdapter(mm)
      const seguridad = {
        rawBody: raw,
        firma: cabecera(peticion, headerFirma),
        // timestamp del header (ingreso firmado) o, si no, el del propio webhook.
        timestamp: cabecera(peticion, headerTs) ?? mm.timestamp,
        ip: peticion.ip ?? null,
        token: mm.token ?? null,
      }

      // Auth ENCAPSULADA en el endpoint (HMAC-o-token). Si no hay autenticador, se
      // delega a con.recibir (modo legado). En ambos casos la diferencia no se
      // propaga: recibir persiste igual.
      if (autenticador) {
        const auth = autenticador.verificar(seguridad)
        if (!auth.ok) return http(401, { error: 'unauthorized', motivo: auth.motivo })
      }

      const r = await con.recibir(payload, { seguridad: autenticador ? undefined : seguridad, plataforma })
      if (r && r.rechazado) return http(401, { error: 'unauthorized', motivo: r.motivo })
      if (!r) return http(200, { estado: 'ignorado' }) // eco del bot / nada que procesar
      return http(202, { estado: 'aceptado' }) // encolado; el worker lo procesa
    } catch {
      // Nunca exponer el error interno.
      return http(500, { error: 'internal_error' })
    }
  }
}

function http(status, body) {
  return { status, body }
}

function cabecera(peticion, nombre) {
  const h = peticion.headers ?? {}
  const k = nombre.toLowerCase()
  // headers puede venir como objeto (node http los baja a minúscula) o Map
  if (typeof h.get === 'function') return h.get(k) ?? h.get(nombre)
  return h[k] ?? h[nombre]
}

/** Parsea el body crudo según el content-type. Devuelve el objeto de campos de MM. */
function parsearPayload(raw, ct) {
  try {
    if (/application\/json/i.test(ct)) return JSON.parse(raw)
    // x-www-form-urlencoded (outgoing webhook / slash command de Mattermost)
    const p = new URLSearchParams(raw)
    const o = {}
    for (const [k, v] of p) o[k] = v
    return o
  } catch {
    return null
  }
}

/** Traduce los campos del outgoing webhook de Mattermost al payload que espera el
 *  MattermostAdapter (user_id, channel_id, post_id, text, token…). Sin lógica de
 *  negocio: sólo mapeo de nombres. */
function aPayloadCanonicoAdapter(mm) {
  return {
    token: mm.token ?? null,
    team_id: mm.team_id ?? null,
    channel_id: mm.channel_id ?? null,
    channel_name: mm.channel_name ?? null,
    user_id: mm.user_id ?? null,
    user_name: mm.user_name ?? null,
    post_id: mm.post_id ?? null,
    text: mm.text ?? '',
    // slash command (por si se usa ese mecanismo en vez del outgoing webhook)
    command: mm.command ?? null,
    trigger_id: mm.trigger_id ?? null,
    response_url: mm.response_url ?? null,
  }
}

export const _internos = { parsearPayload, aPayloadCanonicoAdapter }
