// SLASH COMMAND `/asistencia` + CONFIRMACIÓN EN EL CANAL.
//
// Las dos puntas que este módulo tiene contra Mattermost, y nada más:
//
//   ENTRADA  `/asistencia` → se verifica que el pedido venga realmente de Mattermost, se
//            resuelve la identidad del que escribió, se chequea el permiso y se le devuelve
//            un enlace firmado de un solo uso, EFÍMERO (`response_type: 'ephemeral'`).
//   SALIDA   terminada la carga en la pantalla, se publica UNA confirmación en el canal.
//
// Por qué efímero: el requisito de producto es que NO haya conversación en el canal. Hoy el
// flujo conversacional gasta 5 mensajes de ida y vuelta (`asistencia`, `obra 3`, `1 presente`,
// `revisar`, `confirmar`) delante de todo el equipo. Con la pantalla, el canal recibe una sola
// cosa: qué quedó registrado. El enlace además es personal — publicarlo sería repartir la
// llave, aunque dure diez minutos.
//
// Qué NO hace este módulo, a propósito:
//   · NO escribe en JORNALES. Eso es `lib/tools/jornales-asistencia.mjs` y sólo eso.
//   · NO decide quién puede cargar. Eso es `lib/asistencia-permisos.mjs`, contra la base.
//   · NO conoce ningún channel_id. El canal sale de `comunicacion.canales_area` — el mismo
//     binding que usa el Director. Hay un test que falla si aparece un literal con forma de
//     id de Mattermost en el código, y está bien que falle: un id escrito a mano es una
//     configuración escondida en git que nadie puede cambiar sin desplegar.
//   · NO toca el flujo conversacional, que se conserva como fallback.

import crypto from 'node:crypto'
import { emitirEnlace, armarUrl } from './enlace-firmado.mjs'
import { tienePermiso, DENEGADO } from '../lib/asistencia-permisos.mjs'

/** Área canónica dueña de la asistencia. Es la misma con la que se ató el canal. */
export const AREA_ASISTENCIA = 'personas'

/** Respuestas de cara al jefe de obra. Castellano rioplatense, sin jerga técnica. */
export const TEXTO = Object.freeze({
  NO_AUTORIZADO: 'No autorizado.',
  SIN_CONFIGURAR: 'La carga de asistencia todavía no está configurada. Avisale a Dirección.',
  SIN_IDENTIDAD: 'No pude reconocer quién escribió el comando. Cerrá sesión y volvé a entrar a Mattermost.',
  SIN_PERMISO: 'No tenés habilitada la carga de asistencia. Pedísela a Dirección y la activan en el momento.',
  ERROR: 'No pude abrir la carga de asistencia. Probá de nuevo en un minuto; si sigue igual, avisale a Dirección.',
})

/**
 * Manejador del slash command. Framework-agnóstico: recibe los campos ya parseados y
 * devuelve `{ status, body }`. El transporte (leer el body, límites, timeouts) es del
 * servidor.
 *
 * @param {object} deps
 * @param {string} deps.tokenComando      token que Mattermost manda con el comando (env)
 * @param {string} deps.secretoEnlace     secreto HMAC del enlace firmado (env)
 * @param {string} deps.urlBase           URL pública de la pantalla (env)
 * @param {string} [deps.rutaPantalla]
 * @param {number} [deps.ttlSegundos]
 * @param {{query:Function}} [deps.port]
 * @param {Function} [deps.verificarPermiso] inyectable (default `tienePermiso`)
 * @param {Function} [deps.emitir]           inyectable (default `emitirEnlace`)
 * @param {{warn?:Function,info?:Function}} [deps.log]
 */
export function crearComandoAsistencia(deps = {}) {
  const {
    tokenComando, secretoEnlace, urlBase, rutaPantalla = '/asistencia', ttlSegundos,
    port = null, verificarPermiso = tienePermiso, emitir = emitirEnlace, log = null,
  } = deps

  return async function manejarComando({ campos = {}, ip = null } = {}) {
    // 1) ¿Viene de Mattermost? Sin token configurado NO se atiende: un endpoint que
    //    reparte enlaces sin verificar nada es peor que un endpoint apagado.
    if (!esTexto(tokenComando)) {
      log?.warn?.('comando de asistencia sin token configurado: se rechaza', { ip })
      return { status: 503, body: { error: TEXTO.SIN_CONFIGURAR } }
    }
    if (!igualEnTiempoConstante(tokenComando, campos.token)) {
      // Sin detalle: quien no tiene el token no se entera de si existe, de si venció
      // ni de cuánto acertó.
      return { status: 401, body: { error: TEXTO.NO_AUTORIZADO } }
    }

    // 2) Identidad REAL de Mattermost. El token del enlace no lleva permisos: lleva esto.
    const userId = limpio(campos.user_id)
    if (!userId) return efimero(TEXTO.SIN_IDENTIDAD)
    const username = limpio(campos.user_name) || null

    // 3) ¿Puede cargar asistencia? Misma autoridad que el flujo conversacional: no se
    //    duplica la regla, se la consulta.
    let permiso
    try {
      permiso = await verificarPermiso(port, { plataforma: 'mattermost', plataformaUserId: userId })
    } catch {
      // Fail-closed. Si no puedo comprobar el permiso, no lo concedo.
      return efimero(TEXTO.ERROR)
    }
    if (!permiso?.ok) {
      // Al usuario se le dice qué le falta, nunca por qué internamente: el motivo
      // (`error_verificando` vs `sin_permiso`) queda en el log, no en la pantalla.
      log?.info?.('carga de asistencia denegada', { motivo: permiso?.motivo ?? 'desconocido' })
      const texto = permiso?.motivo === DENEGADO.SIN_IDENTIDAD ? TEXTO.SIN_IDENTIDAD
        : permiso?.motivo === DENEGADO.ERROR_VERIFICANDO ? TEXTO.ERROR
          : TEXTO.SIN_PERMISO
      return efimero(texto)
    }

    // 4) Enlace. Cualquier falla de configuración (secreto corto, URL sin definir) sale
    //    como un mensaje humano; el detalle va al log, nunca al canal.
    let url, expira
    try {
      const enlace = emitir({ secreto: secretoEnlace, userId, username, ...(ttlSegundos ? { ttlSegundos } : {}) })
      url = armarUrl({ urlBase, token: enlace.token, ruta: rutaPantalla })
      expira = enlace.expira
    } catch (e) {
      log?.warn?.('no se pudo emitir el enlace de asistencia', { detalle: String(e?.message ?? e).slice(0, 200) })
      return efimero(TEXTO.SIN_CONFIGURAR)
    }

    return efimero(textoInvitacion(url, expira), { url, expira })
  }
}

/** El mensaje que ve SÓLO quien escribió el comando. */
export function textoInvitacion(url, expira, ahora = Date.now()) {
  const minutos = minutosHasta(expira, ahora)
  const vence = minutos ? ` Vence en ${minutos} ${minutos === 1 ? 'minuto' : 'minutos'}.` : ''
  return [
    '**Carga de asistencia**',
    '',
    `Abrí la pantalla acá: ${url}`,
    '',
    `El enlace es tuyo y sirve una sola vez.${vence} Este mensaje lo ves sólo vos.`,
    'Cuando termines de cargar, la confirmación se publica en el canal.',
  ].join('\n')
}

// ── Confirmación en el canal ────────────────────────────────────────────────────

/**
 * Canal operativo de un área, desde el binding. NUNCA un id escrito en el código.
 * Si hay más de un canal para el área (está permitido a propósito), se puede acotar por
 * NOMBRE — un nombre es legible y configurable; un id no.
 *
 * @returns {Promise<{channelId:string, canal:string}|null>}
 */
export async function canalDeArea(port, { area = AREA_ASISTENCIA, canalNombre = null, plataforma = 'mattermost' } = {}) {
  if (!port?.query) return null
  try {
    const { rows } = await port.query(
      `select channel_id, canal_nombre from comunicacion.canales_area
        where plataforma = $1 and area_clave = $2 and activo
          and ($3::text is null or lower(canal_nombre) = lower($3))
        order by id limit 1`,
      [plataforma, area, canalNombre],
    )
    return rows.length ? { channelId: rows[0].channel_id, canal: rows[0].canal_nombre } : null
  } catch {
    return null
  }
}

/**
 * Texto de la confirmación. Sólo se muestra lo que el resultado TRAE: si el núcleo no
 * informó un número, acá no aparece un número. Nunca se completa un hueco con un valor
 * plausible — es la regla de oro del OS y en una planilla de jornales es plata.
 *
 * @param {object} r resultado de registrar (fecha, obra, resumen, celdas, actor)
 */
export function textoConfirmacion(r = {}) {
  const l = ['**Asistencia registrada**']
  const cab = [fechaLegible(r.fecha), r.obra_nombre ?? r.obra ?? null].filter(Boolean).join(' · ')
  if (cab) l.push(cab)

  const s = r.resumen ?? {}
  const partes = []
  if (Number.isFinite(s.presentes)) partes.push(`${s.presentes} presente${s.presentes === 1 ? '' : 's'}`)
  if (Number.isFinite(s.ausentes)) partes.push(`${s.ausentes} ausente${s.ausentes === 1 ? '' : 's'}`)
  if (Number.isFinite(s.parciales) && s.parciales > 0) partes.push(`${s.parciales} parcial${s.parciales === 1 ? '' : 'es'}`)
  if (Number.isFinite(s.tardes) && s.tardes > 0) partes.push(`${s.tardes} con llegada tarde`)
  if (partes.length) l.push('', partes.join(' · '))

  if (Number.isFinite(s.horas_total)) {
    const extra = Number.isFinite(s.horas_extra) && s.horas_extra > 0 ? ` (${fmt(s.horas_extra)} extra)` : ''
    l.push(`${fmt(s.horas_total)} h cargadas${extra}`)
  }

  const celdas = Array.isArray(r.celdas) ? r.celdas.length : Number.isFinite(r.escritas) ? r.escritas : null
  if (celdas != null) l.push(`${celdas} celda${celdas === 1 ? '' : 's'} escrita${celdas === 1 ? '' : 's'} en JORNALES.`)

  const quien = r.actor_nombre ?? r.actor_username ?? null
  if (quien) l.push(`Cargó ${quien}.`)
  return l.join('\n')
}

/**
 * Publica la confirmación en el canal del área. Devuelve el post o `null` si no se pudo
 * (canal sin binding, cliente ausente, Mattermost caído): NO lanza, porque la asistencia ya
 * quedó escrita en la planilla y perder el aviso no puede convertirse en perder la carga.
 *
 * @param {object} deps
 * @param {{query:Function}} deps.port
 * @param {{crearPost:Function}} deps.cliente
 * @param {string} [deps.area]
 * @param {string|null} [deps.canalNombre]
 * @param {object} [deps.log]
 * @param {object} resultado
 */
export async function publicarConfirmacion({ port, cliente, area = AREA_ASISTENCIA, canalNombre = null, log = null } = {}, resultado = {}) {
  if (!cliente?.crearPost) {
    log?.warn?.('no hay cliente de Mattermost: la confirmación no se publica')
    return null
  }
  const destino = await canalDeArea(port, { area, canalNombre })
  if (!destino?.channelId) {
    log?.warn?.('sin canal atado al área: la confirmación no se publica', { area })
    return null
  }
  try {
    return await cliente.crearPost({ channel_id: destino.channelId, message: textoConfirmacion(resultado) })
  } catch (e) {
    log?.warn?.('no se pudo publicar la confirmación', { detalle: String(e?.message ?? e).slice(0, 200) })
    return null
  }
}

// ── internos ────────────────────────────────────────────────────────────────────

function efimero(text, extra = null) {
  // `ephemeral` es el contrato de Mattermost: el mensaje lo ve SÓLO quien escribió el
  // comando y no queda en el historial del canal.
  return { status: 200, body: { response_type: 'ephemeral', text }, ...(extra ? { meta: extra } : {}) }
}

function esTexto(v) {
  return typeof v === 'string' && v.length > 0
}

function limpio(v) {
  return typeof v === 'string' ? v.trim() : ''
}

/** Comparación del token del comando en tiempo constante (mismo criterio que la firma). */
function igualEnTiempoConstante(esperado, recibido) {
  const a = Buffer.from(String(esperado ?? ''), 'utf8')
  const b = Buffer.from(String(recibido ?? ''), 'utf8')
  if (a.length === 0 || a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}

function minutosHasta(iso, ahora) {
  const t = Date.parse(iso ?? '')
  if (!Number.isFinite(t)) return null
  const m = Math.round((t - ahora) / 60000)
  return m > 0 ? m : null
}

function fechaLegible(fecha) {
  if (typeof fecha !== 'string') return null
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : fecha
}

function fmt(n) {
  return String(Math.round(Number(n) * 100) / 100).replace('.', ',')
}
