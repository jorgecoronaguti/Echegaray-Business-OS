// ARRANCAR UNA CARGA DE ASISTENCIA — el único punto de entrada.
//
// `@os asistencia` en el canal oficial abre la sesión y devuelve el mensaje interactivo.
// Todo lo que sigue (elegir obra, marcar excepciones, registrar) son clicks sobre ESE mismo
// mensaje, que se va reescribiendo. No hay conversación: hay un mensaje que cambia.
//
// El post todavía no existe cuando se abre la sesión —lo publica el Communication Layer
// después—, así que la sesión nace sin `root_post_id` y el ruteador la ata al post en el
// primer click, que es cuando Mattermost sí manda `post_id`. Intentar adivinarlo antes
// obligaría a publicar desde acá y a duplicar la salida que ya existe.

import { puedeCargar } from './asistencia-guarda.mjs'
import { mensajeInicial } from './asistencia-mm/mensaje.mjs'
import { SesionesPostgres } from './asistencia-sesion.mjs'
import { listarObrasPorFecha } from '../lib/tools/jornales-asistencia.mjs'
import { jornadaConfigurada } from '../lib/jornada-config.mjs'
import { resolverJornada } from '../lib/asistencia-servicio/mapeo.mjs'
import { hoyIso } from '../lib/asistencia-servicio/fechas.mjs'

/** Texto de respaldo para clientes que no dibujan attachments (notificaciones, móvil viejo). */
const RESPALDO = 'Carga de asistencia: elegí la obra en el mensaje.'

/**
 * @param {object} o
 * @param {{query:Function, withTx:Function}} o.port
 * @param {object} o.google
 * @param {object} o.actor      identidad ya resuelta de Mattermost
 * @param {string} [o.correlationId]
 * @param {string} [o.url]      URL del callback de acciones
 * @returns {Promise<{texto:string, attachments?:Array, privado?:boolean, estado:string}>}
 */
export async function iniciarAsistencia({ port, google, actor, correlationId = null, url = null, sesiones = null, hoy = hoyIso } = {}) {
  // LA PUERTA PRIMERO. Antes de leer la planilla y antes de abrir nada.
  const permitido = await puedeCargar({
    port,
    actor,
    channelId: actor?.channel_id ?? null,
    plataforma: 'mattermost',
  })
  if (!permitido.ok) return { texto: permitido.texto, estado: 'denegado' }

  const fecha = hoy()
  let obras = []
  let jornada = null
  try {
    const r = await listarObrasPorFecha(google, { fecha })
    if (!r.ok) return { texto: avisoDe(r.motivo, fecha), estado: 'sin_planilla' }
    obras = r.obras ?? []
    const config = await jornadaConfigurada(port, { fecha }).catch(() => null)
    jornada = resolverJornada({ config, planilla: r.jornada })
  } catch {
    return { texto: 'No pude leer la planilla de jornales ahora mismo. Probá de nuevo en un minuto.', estado: 'error' }
  }

  if (!obras.length) {
    return { texto: `No hay obras cargadas para el ${fecha.split('-').reverse().join('/')}.`, estado: 'sin_obras' }
  }

  const repo = sesiones ?? new SesionesPostgres(port)
  await repo.abrir({
    plataformaUserId: actor.plataforma_user_id,
    plataformaUsername: actor.plataforma_username ?? null,
    channelId: actor.channel_id ?? null,
    rootPostId: null, // lo ata el ruteador en el primer click
    fechaOperativa: fecha,
    correlationId,
  })

  const m = mensajeInicial({ fecha, obras, jornada, url })
  return { texto: m.message || RESPALDO, attachments: m.props?.attachments ?? [], estado: 'iniciado' }
}

function avisoDe(motivo, fecha) {
  const f = fecha.split('-').reverse().join('/')
  return motivo === 'columna_inexistente'
    ? `JORNALES todavía no tiene la columna del ${f}.`
    : `No pude preparar la carga del ${f}.`
}
