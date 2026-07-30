// ENLACE FIRMADO DE UN SOLO USO — la llave que abre la pantalla de asistencia.
//
// Problema que resuelve: el jefe de obra escribe `/asistencia` en Mattermost y tiene que
// llegar a una pantalla web que va a escribir en JORNALES. Esa pantalla no puede pedir un
// login propio (sería un segundo usuario y una segunda contraseña para gente que ya está
// autenticada en Mattermost desde el celular), y tampoco puede quedar abierta a cualquiera
// que adivine la URL.
//
// La solución es un token corto, firmado con HMAC-SHA256 e inutilizable después del primer
// uso. Decisiones de seguridad, y por qué:
//
//   1. EL TOKEN NO LLEVA PERMISOS. Sólo transporta la identidad de Mattermost de quien pidió
//      el enlace. Quién puede cargar asistencia lo decide `asistencia-permisos.mjs` contra la
//      base, cada vez. Un token robado no otorga nada que su dueño no tuviera.
//   2. FIRMA, NO CIFRADO. El contenido es legible a propósito: no hay nada secreto adentro
//      (un user id de Mattermost no lo es). Lo que se garantiza es que NADIE PUEDE FABRICARLO
//      ni cambiarle un byte sin el secreto del servidor.
//   3. COMPARACIÓN EN TIEMPO CONSTANTE (`timingSafeEqual`). Un `===` sobre la firma filtra,
//      byte a byte, cuánto acertó el atacante.
//   4. TTL CORTO (10 minutos por defecto, tope duro de 1 hora). El token viaja en la URL, así
//      que termina en el historial del navegador y puede terminar en un log. Que sea efímero
//      y de un solo uso es lo que hace tolerable ese riesgo. Ver el Caddyfile: la ruta pública
//      filtra el parámetro `t` del log de acceso por la misma razón.
//   5. UN SOLO USO CONTRA POSTGRES, NO CONTRA MEMORIA. Acá corren varios procesos (worker,
//      consumidor WS, este servidor) y systemd los reinicia: un Set en memoria diría "nuevo"
//      después de cada reinicio y ante cada proceso distinto. El consumo es un INSERT con
//      `on conflict do nothing`: la primera vez inserta, la segunda no, y eso es atómico
//      incluso con dos pestañas abriendo el enlace al mismo tiempo.
//   6. FAIL-CLOSED. Si no se puede verificar el consumo (base caída), NO se deja pasar. Un
//      enlace de un solo uso que se vuelve reusable cuando la base se cae no es de un solo uso.
//   7. NINGÚN ERROR NOMBRA EL SECRETO. Los mensajes son fijos y en castellano; el secreto
//      nunca se interpola, ni siquiera truncado.
//
// Este módulo NO abre conexiones ni conoce el driver: el consumo se inyecta como función
// (`consumir`). `consumidorPostgres(port)` es la implementación real; los tests pasan una
// función en memoria y por eso corren sin red y sin base.

import crypto from 'node:crypto'

/** Por qué un enlace no sirve. Congelado: lo consume la pantalla y el comando. */
export const MOTIVO = Object.freeze({
  EXPIRADO: 'expirado',
  USADO: 'usado',
  INVALIDO: 'invalido',
})

/** Un enlace que no anda tiene que decir QUÉ pasó y QUÉ hacer. Nunca una pantalla en blanco. */
export const MENSAJE = Object.freeze({
  [MOTIVO.EXPIRADO]: 'El enlace venció. Volvé a escribir /asistencia en el chat y te mando uno nuevo.',
  [MOTIVO.USADO]: 'Este enlace ya se usó. Volvé a escribir /asistencia en el chat para abrir la carga otra vez.',
  [MOTIVO.INVALIDO]: 'El enlace no es válido. Volvé a escribir /asistencia en el chat para abrir la carga.',
})

export const TTL_SEGUNDOS_DEFAULT = 600 // 10 minutos: alcanza para abrir la pantalla, no para olvidarse
export const TTL_SEGUNDOS_MAXIMO = 3600 // tope duro: nadie configura un enlace "de todo el día"
export const LARGO_MINIMO_SECRETO = 32 // 32 bytes de entropía; se genera con `openssl rand -base64 32`
const VERSION = 1
const LARGO_MAXIMO_TOKEN = 4096 // corta el DoS de firmar un body gigante antes de tocar HMAC

/**
 * Emite un enlace firmado para una identidad de Mattermost.
 *
 * @param {object} o
 * @param {string} o.secreto        secreto HMAC del servidor (env, nunca el repo)
 * @param {string} o.userId         user id REAL de Mattermost de quien pidió el enlace
 * @param {string|null} [o.username] username, sólo para mostrar y auditar
 * @param {number} [o.ttlSegundos]
 * @param {Function} [o.ahora]      inyectable para los tests (default Date.now)
 * @param {string|null} [o.jti]     inyectable para los tests; en producción es aleatorio
 * @returns {{token:string, expira:string, expiraEpoch:number, jti:string}}
 */
export function emitirEnlace({ secreto, userId, username = null, ttlSegundos = TTL_SEGUNDOS_DEFAULT, ahora = Date.now, jti = null } = {}) {
  exigirSecreto(secreto)
  if (typeof userId !== 'string' || !userId.trim()) {
    throw new Error('emitirEnlace: falta la identidad de quien pide el enlace')
  }
  const ttl = Math.floor(Number(ttlSegundos))
  if (!Number.isFinite(ttl) || ttl <= 0 || ttl > TTL_SEGUNDOS_MAXIMO) {
    throw new Error(`emitirEnlace: el TTL tiene que estar entre 1 y ${TTL_SEGUNDOS_MAXIMO} segundos`)
  }
  const expiraEpoch = Math.floor(ahora() / 1000) + ttl
  const cuerpo = {
    v: VERSION,
    j: jti ?? crypto.randomBytes(16).toString('base64url'), // identificador del enlace: es lo que se consume
    u: userId.trim(),
    n: username ? String(username).slice(0, 120) : null,
    e: expiraEpoch,
  }
  const datos = Buffer.from(JSON.stringify(cuerpo), 'utf8').toString('base64url')
  return {
    token: `${datos}.${firmar(secreto, datos)}`,
    jti: cuerpo.j,
    expira: new Date(expiraEpoch * 1000).toISOString(),
    expiraEpoch,
  }
}

/**
 * Verifica un enlace y, si `consumir` viene, lo quema (un solo uso).
 *
 * El orden importa: primero la firma (si está adulterado no se mira nada más), después el
 * vencimiento (no gastamos el registro de consumo en un token ya muerto), y recién entonces
 * el consumo.
 *
 * @param {object} o
 * @param {string} o.secreto
 * @param {string} o.token
 * @param {Function|null} [o.consumir] async ({jti,userId,username,expiraEpoch}) => boolean
 *                                     `true` = primer uso. Sin ella NO se consume (útil para
 *                                     previsualizar; el camino real siempre la pasa).
 * @param {Function} [o.ahora]
 * @returns {Promise<{ok:true,userId:string,username:string|null,jti:string,expira:string}
 *                  |{ok:false,motivo:string,mensaje:string}>}
 */
export async function verificarEnlace({ secreto, token, consumir = null, ahora = Date.now } = {}) {
  // Secreto ausente o pobre: fail-closed y sin detalle hacia afuera. Es un error de
  // configuración del servidor, no del usuario, y no se le cuenta al usuario.
  if (!secretoUsable(secreto)) return rechazo(MOTIVO.INVALIDO)
  if (typeof token !== 'string' || !token || token.length > LARGO_MAXIMO_TOKEN) return rechazo(MOTIVO.INVALIDO)

  const partes = token.split('.')
  if (partes.length !== 2) return rechazo(MOTIVO.INVALIDO)
  const [datos, firma] = partes
  if (!firmaValida(secreto, datos, firma)) return rechazo(MOTIVO.INVALIDO)

  const cuerpo = leerCuerpo(datos)
  if (!cuerpo) return rechazo(MOTIVO.INVALIDO)
  if (Math.floor(ahora() / 1000) >= cuerpo.e) return rechazo(MOTIVO.EXPIRADO)

  if (typeof consumir === 'function') {
    let primerUso
    try {
      primerUso = await consumir({ jti: cuerpo.j, userId: cuerpo.u, username: cuerpo.n ?? null, expiraEpoch: cuerpo.e })
    } catch {
      // Fail-closed: si no puedo garantizar el único uso, no habilito.
      return rechazo(MOTIVO.INVALIDO, 'No pude validar el enlace en este momento. Probá de nuevo en un minuto.')
    }
    if (!primerUso) return rechazo(MOTIVO.USADO)
  }

  return {
    ok: true,
    userId: cuerpo.u,
    username: cuerpo.n ?? null,
    jti: cuerpo.j,
    expira: new Date(cuerpo.e * 1000).toISOString(),
  }
}

/**
 * Consumo real contra Postgres. El INSERT es la operación atómica: la fila ES la prueba de
 * que el enlace se usó. No se guarda ninguna fila al EMITIR a propósito — un enlace que
 * nadie abre no deja basura, y la tabla queda del tamaño de los usos reales.
 *
 * @param {{query:Function}} port
 */
export function consumidorPostgres(port, { plataforma = 'mattermost' } = {}) {
  return async function consumir({ jti, userId, username, expiraEpoch }) {
    const { rows } = await port.query(
      `insert into comunicacion.asistencia_enlaces
         (jti, plataforma, plataforma_user_id, plataforma_username, expira_at)
       values ($1, $2, $3, $4, to_timestamp($5))
       on conflict (jti) do nothing
       returning jti`,
      [jti, plataforma, userId, username ?? null, expiraEpoch],
    )
    return rows.length === 1
  }
}

/** Arma la URL pública que se le manda al jefe. La base es configuración, no código. */
export function armarUrl({ urlBase, token, ruta = '/asistencia' }) {
  if (typeof urlBase !== 'string' || !/^https?:\/\//i.test(urlBase)) {
    throw new Error('armarUrl: falta la URL pública de la pantalla de asistencia')
  }
  const base = urlBase.replace(/\/+$/, '')
  const path = ruta.startsWith('/') ? ruta : `/${ruta}`
  return `${base}${path}?t=${encodeURIComponent(token)}`
}

/** Texto para el usuario a partir de un rechazo. Nunca devuelve vacío. */
export function mensajeDe(resultado) {
  if (!resultado || resultado.ok) return ''
  return resultado.mensaje || MENSAJE[resultado.motivo] || MENSAJE[MOTIVO.INVALIDO]
}

// ── internos ────────────────────────────────────────────────────────────────────

function firmar(secreto, datos) {
  return crypto.createHmac('sha256', secreto).update(datos).digest('base64url')
}

/** Comparación en tiempo constante. Longitudes distintas ⇒ false sin comparar contenido. */
function firmaValida(secreto, datos, firma) {
  const esperada = Buffer.from(firmar(secreto, datos), 'utf8')
  const recibida = Buffer.from(String(firma ?? ''), 'utf8')
  if (esperada.length !== recibida.length) return false
  return crypto.timingSafeEqual(esperada, recibida)
}

function leerCuerpo(datos) {
  let c
  try {
    c = JSON.parse(Buffer.from(datos, 'base64url').toString('utf8'))
  } catch {
    return null
  }
  if (!c || typeof c !== 'object') return null
  if (c.v !== VERSION) return null
  if (typeof c.j !== 'string' || !c.j) return null
  if (typeof c.u !== 'string' || !c.u) return null
  if (!Number.isFinite(c.e)) return null
  return c
}

function secretoUsable(secreto) {
  return typeof secreto === 'string' && secreto.length >= LARGO_MINIMO_SECRETO
}

function exigirSecreto(secreto) {
  // El mensaje habla del LARGO, nunca del valor: un error no puede ser un canal de fuga.
  if (!secretoUsable(secreto)) {
    throw new Error(`falta el secreto del enlace de asistencia o es demasiado corto (mínimo ${LARGO_MINIMO_SECRETO} caracteres)`)
  }
}

function rechazo(motivo, mensaje = null) {
  return { ok: false, motivo, mensaje: mensaje ?? MENSAJE[motivo] }
}
