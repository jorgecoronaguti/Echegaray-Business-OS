// ARRANCAR UNA CARGA DE ASISTENCIA — el único punto de entrada.
//
// `@os asistencia` en el canal oficial abre la sesión y devuelve el mensaje interactivo.
// Todo lo que sigue (elegir obra, marcar excepciones, registrar) son clicks sobre ESE mismo
// mensaje, que se va reescribiendo. No hay conversación: hay un mensaje que cambia.
//
// QUIÉN PUBLICA LA TARJETA — las dos puertas no son iguales, y por eso existe `publicar`.
//
//   · `@os asistencia` (mención): el post lo publica el Communication Layer con el bot, DESPUÉS
//     de que esto devuelva. Acá no se pasa `publicar`, la sesión nace sin `root_post_id` y el
//     ruteador la ata al post en el primer click, que es cuando Mattermost manda `post_id`.
//   · `/asistencia` (slash command): NO puede publicar por respuesta. Un `in_channel` lo crea
//     Mattermost a nombre de quien tipeó el comando, y el bot —`system_user`, sin
//     `edit_others_posts`— no puede reescribir un post ajeno: 403 en cada refresco por API.
//     Así que el comando pasa `publicar` y la tarjeta la crea el BOT, que sí es su dueño.
//
// Cuando se publica desde acá, el id se ata a la sesión en el mismo arranque: `postDe(sesion)`
// resuelve desde el primer momento y el refresco después de un diálogo deja de depender de que
// alguien haya tocado un botón antes.

import { puedeCargar } from './asistencia-guarda.mjs'
import { crearAuditor, EVENTO, ORIGEN, payloadRechazo, sanitizarError } from '../lib/asistencia-auditoria.mjs'
import { mensajeInicial } from './asistencia-mm/mensaje.mjs'
import { ESTADO_SESION, SesionesPostgres } from './asistencia-sesion.mjs'
import { listarObrasPorFecha } from '../lib/tools/jornales-asistencia.mjs'
import { jornadaConfigurada } from '../lib/jornada-config.mjs'
import { mapearObras, resolverJornada } from '../lib/asistencia-servicio/mapeo.mjs'
import { hoyIso } from '../lib/asistencia-servicio/fechas.mjs'

/** Texto de respaldo para clientes que no dibujan attachments (notificaciones, móvil viejo). */
const RESPALDO = 'Carga de asistencia: elegí la obra en el mensaje.'

/** Si la tarjeta no se pudo publicar, la carga no empezó. Se dice, no se calla. */
const SIN_PUBLICAR = 'No pude publicar la carga en el canal. No se registró nada: probá de nuevo en un minuto.'

/**
 * @param {object} o
 * @param {{query:Function, withTx:Function}} o.port
 * @param {object} o.google
 * @param {object} o.actor      identidad ya resuelta de Mattermost
 * @param {string} [o.correlationId]
 * @param {string} [o.url]      URL del callback de acciones
 * @param {string} [o.requestId]
 * @param {string} [o.origen]   por qué puerta entró (comando o mención)
 * @param {Function} [o.publicar]  `async ({message, props}) => post` — SÓLO el slash command lo
 *                                 pasa: publica la tarjeta con el bot y devuelve el post creado.
 *                                 Sin él, la publica quien llama (ver el encabezado).
 * @returns {Promise<{texto:string, attachments?:Array, postId?:string, estado:string}>}
 */
export async function iniciarAsistencia({
  port, google, actor, correlationId = null, url = null, sesiones = null, hoy = hoyIso,
  requestId = null, origen = ORIGEN.MENCION, auditar = null, publicar = null, log = null,
} = {}) {
  // LA PUERTA PRIMERO. Antes de leer la planilla y antes de abrir nada.
  const permitido = await puedeCargar({
    port,
    actor,
    channelId: actor?.channel_id ?? null,
    plataforma: 'mattermost',
  })
  if (!permitido.ok) {
    // El rechazo queda registrado con el MISMO mecanismo que la carga exitosa. Un intento
    // negado que no deja rastro es un agujero de seguridad: nadie puede revisar después
    // quién quiso cargar desde dónde. La auditoría nunca puede voltear el rechazo.
    const registrar = auditar ?? (port ? crearAuditor(port, { correlationId }) : null)
    await Promise.resolve(registrar?.(EVENTO.DENIED, payloadRechazo({
      origen, motivo: permitido.motivo, detalle: permitido.detalle,
      actor, channelId: actor?.channel_id ?? null, teamId: actor?.team_id ?? null,
      requestId, correlationId,
    }))).catch(() => {}) // auditar no puede voltear el veredicto ni romper la respuesta
    return { texto: permitido.texto, estado: 'denegado' }
  }

  const fecha = hoy()
  let obras = []
  let jornada = null
  try {
    const r = await listarObrasPorFecha(google, { fecha })
    if (!r.ok) return { texto: avisoDe(r.motivo, fecha), estado: 'sin_planilla' }
    // TRADUCIR, no pasar crudo: el núcleo devuelve `etiqueta`/`personas` y la UI necesita
    // `nombre`/`cantidad`. Pasarlas sin traducir dejaba el desplegable con seis opciones
    // SIN TEXTO — Mattermost lo avisa por log y el jefe ve una lista en blanco.
    obras = mapearObras(r.obras ?? [])
    const config = await jornadaConfigurada(port, { fecha }).catch(() => null)
    jornada = resolverJornada({ config, planilla: r.jornada })
  } catch {
    return { texto: 'No pude leer la planilla de jornales ahora mismo. Probá de nuevo en un minuto.', estado: 'error' }
  }

  if (!obras.length) {
    return { texto: `No hay obras cargadas para el ${fecha.split('-').reverse().join('/')}.`, estado: 'sin_obras' }
  }

  const repo = sesiones ?? new SesionesPostgres(port)
  const sesion = await repo.abrir({
    plataformaUserId: actor.plataforma_user_id,
    plataformaUsername: actor.plataforma_username ?? null,
    channelId: actor.channel_id ?? null,
    rootPostId: null, // se ata abajo si publicamos nosotros; si no, en el primer click
    fechaOperativa: fecha,
    correlationId,
  })

  const m = mensajeInicial({ fecha, obras, jornada, url })
  const texto = m.message || RESPALDO
  const attachments = m.props?.attachments ?? []

  // La mención: publica quien llama (el Communication Layer, con el bot). Nada que atar acá.
  if (typeof publicar !== 'function') return { texto, attachments, estado: 'iniciado' }

  // El slash command: la tarjeta la crea el BOT para que sea suya y se pueda reescribir.
  let post = null
  try {
    post = await publicar({ message: texto, props: { attachments } })
  } catch (e) {
    log?.error?.('asistencia: no se pudo publicar la tarjeta', { error: sanitizarError(e) })
  }
  if (!post?.id) {
    // Sin tarjeta no hay formulario: la sesión abierta sería un fantasma que además bloquea
    // el índice de "una sola sesión abierta por persona" hasta que venza. Se cierra ya.
    await Promise.resolve(repo.cerrar(sesion.id, ESTADO_SESION.CANCELADA)).catch(() => {})
    return { texto: SIN_PUBLICAR, estado: 'sin_publicar' }
  }

  // Atar es una mejora, no un requisito: si falla, el ruteador sigue atando en el primer
  // click como siempre. No se pierde la carga por esto, así que no voltea el arranque.
  await Promise.resolve(repo.atarPost(sesion.id, post.id))
    .catch((e) => log?.warn?.('asistencia: no pude atar la sesión al post', { error: sanitizarError(e) }))

  return { texto, attachments, postId: post.id, estado: 'publicado' }
}

function avisoDe(motivo, fecha) {
  const f = fecha.split('-').reverse().join('/')
  return motivo === 'columna_inexistente'
    ? `JORNALES todavía no tiene la columna del ${f}.`
    : `No pude preparar la carga del ${f}.`
}
