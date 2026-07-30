// EL CABLEADO de la carga de asistencia dentro de Mattermost.
//
// Junta cuatro piezas que a propósito no se conocen entre sí:
//   · la GUARDA (`asistencia-guarda.mjs`) — de qué canal se puede cargar y quién puede
//   · el RUTEADOR (`asistencia-mm/acciones.mjs`) — qué hace cada click
//   · el NÚCLEO (`lib/tools/jornales-asistencia.mjs`) — la única vía a JORNALES
//   · el cliente de Mattermost — abrir el diálogo y refrescar el post
//
// Nada de esto decide celdas, horas ni motivos: eso vive en el núcleo y en el catálogo.
//
// POR QUÉ ESTE ARCHIVO EXISTE Y NO ESTÁ ADENTRO DEL RUTEADOR: el ruteador se prueba entero
// sin red ni base porque todo le entra inyectado. Si armara sus propias dependencias, esa
// propiedad se pierde y los tests pasan a necesitar Postgres y Google.
//
// LA GUARDA CORRE PRIMERO, SIEMPRE. Antes de abrir sesión, de leer la planilla y de gastar
// una consulta de permisos: si el pedido no viene del canal oficial, no se procesa nada.

import { randomUUID } from 'node:crypto'
import { puedeCargar } from './asistencia-guarda.mjs'
import { crearRuteadorAcciones } from './asistencia-mm/acciones.mjs'
import * as nucleo from '../lib/tools/jornales-asistencia.mjs'
import * as motivos from '../lib/asistencia-motivos.mjs'
import { jornadaConfigurada } from '../lib/jornada-config.mjs'
import { tienePermiso } from '../lib/asistencia-permisos.mjs'
import { crearAuditor, EVENTO } from '../lib/asistencia-auditoria.mjs'
import { guardarNovedades } from '../lib/asistencia-novedades.mjs'
import { SesionesPostgres } from './asistencia-sesion.mjs'
import { googleDelOs } from '../lib/google-os.mjs'

/** Respuesta uniforme: Mattermost espera 200 con cuerpo, no un código de error HTTP. */
const responder = (body) => ({ status: 200, body })

/**
 * Payload de una acción interactiva o de un envío de diálogo. Mattermost manda formas
 * distintas para cada uno; se normaliza acá una sola vez.
 */
function normalizar(payload = {}) {
  const esDialogo = typeof payload.submission === 'object' && payload.submission !== null
  return {
    esDialogo,
    userId: payload.user_id ?? null,
    channelId: payload.channel_id ?? null,
    // El tipo de canal NO viene en el payload de acción: Mattermost no lo manda. La guarda
    // lo resuelve contra el binding, que es la fuente confiable de todos modos.
    channelType: payload.channel_type ?? null,
    triggerId: payload.trigger_id ?? null,
    postId: payload.post_id ?? payload.callback_id ?? null,
  }
}

/**
 * Crea el manejador HTTP de `POST /asistencia/accion`.
 *
 * @param {object} o
 * @param {{query:Function}} o.port
 * @param {object} o.mattermost  cliente con `abrirDialogo` y `actualizarPost`
 * @param {object} [o.google]
 * @param {object} [o.log]
 * @returns {(payload:object) => Promise<{status:number, body:object}>}
 */
export function crearManejadorAccion({ port, mattermost, google = null, log = null, url = null } = {}) {
  const g = google ?? googleDelOs()
  const sesiones = new SesionesPostgres(port)

  /**
   * Auditor de UN pedido, con la proyección de novedades colgada del evento `written`.
   *
   * El ruteador no tiene —ni necesita— un gancho para persistir novedades: el evento de
   * escritura ya lleva la fecha, la obra, el usuario y las novedades. Interceptarlo acá deja
   * un solo lugar donde el porqué pasa de la auditoría (el hecho) a la tabla (lo consultable),
   * y evita tocar el ruteador, que se prueba sin base justamente porque no sabe de esto.
   */
  function auditorDe(correlationId) {
    const registrar = crearAuditor(port, { correlationId })
    return async function auditar(evento, datos = {}) {
      const r = await registrar(evento, datos)
      if (evento === EVENTO.WRITTEN && Array.isArray(datos.novedades) && datos.novedades.length) {
        const proy = await guardarNovedades(port, {
          fecha: datos.fecha_operativa,
          claveObra: datos.obra_normalizada,
          novedades: datos.novedades,
          jornada: datos.novedades.find((n) => n?.jornada != null)?.jornada ?? null,
          actor: { plataforma_user_id: datos.mattermost_user_id ?? null, plataforma_username: datos.mattermost_username ?? null },
          origen: 'mattermost',
          correlationId,
        })
        // No es crítica: la celda ya está escrita y el hecho ya quedó registrado. Hacer
        // fallar acá una carga que YA está en la planilla es peor que perder el índice.
        if (proy.error) log?.warn?.('no se pudo indexar la novedad (la carga sí quedó)', { detalle: proy.error })
      }
      return r
    }
  }

  return async function manejar(payload = {}) {
    const p = normalizar(payload)
    const correlationId = payload.context?.correlation_id ?? randomUUID()

    // 1) LA PUERTA. Antes de cualquier otra cosa.
    const permitido = await puedeCargar({
      port,
      actor: {
        plataforma_user_id: p.userId,
        channel_id: p.channelId,
        channel_type: p.channelType,
      },
      channelId: p.channelId,
      plataforma: 'mattermost',
    })
    if (!permitido.ok) {
      log?.info?.('asistencia: pedido rechazado en la puerta', { motivo: permitido.motivo, detalle: permitido.detalle })
      // Un diálogo sólo admite `errors`/`error`; una acción admite `ephemeral_text`.
      return responder(p.esDialogo ? { error: permitido.texto } : { ephemeral_text: permitido.texto })
    }

    // 2) El click en sí. El ruteador se arma por pedido: es sólo cerrar sobre las
    // dependencias, y así cada carga lleva su propio correlation_id de punta a punta.
    const rutear = crearRuteadorAcciones({
      google: g, nucleo, sesiones, motivos, mattermost, port, log,
      jornadaConfig: jornadaConfigurada,
      permisos: { tienePermiso },
      auditar: auditorDe(correlationId),
      ...(url ? { url } : {}),
    })
    try {
      return await rutear({ payload })
    } catch (e) {
      log?.error?.('asistencia: fallo atendiendo una acción', { detalle: String(e?.message ?? e).slice(0, 200) })
      const texto = 'No pude completar la acción. Probá de nuevo en un minuto.'
      return responder(p.esDialogo ? { error: texto } : { ephemeral_text: texto })
    }
  }
}
