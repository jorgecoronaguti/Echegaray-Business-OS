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
import { igualEnTiempoConstante } from './secreto-compartido.mjs'
import { crearRuteadorAcciones } from './asistencia-mm/acciones.mjs'
import * as nucleo from '../lib/tools/jornales-asistencia.mjs'
import * as motivos from '../lib/asistencia-motivos.mjs'
import { jornadaConfigurada } from '../lib/jornada-config.mjs'
import { tienePermiso } from '../lib/asistencia-permisos.mjs'
import { crearAuditor, EVENTO, ORIGEN, payloadRechazo } from '../lib/asistencia-auditoria.mjs'
import { guardarNovedades } from '../lib/asistencia-novedades.mjs'
import { SesionesPostgres } from './asistencia-sesion.mjs'
import { googleDelOs } from '../lib/google-os.mjs'

/** Respuesta uniforme: Mattermost espera 200 con cuerpo, no un código de error HTTP. */
const responder = (body) => ({ status: 200, body })

/** Lo que ve quien no presenta el secreto. Sin decir si existe, si venció o si es otro. */
const TEXTO_SECRETO = Object.freeze({
  SIN_CONFIGURAR: 'La carga de asistencia todavía no está configurada. Avisale a Dirección.',
  NO_AUTORIZADO: 'No pude verificar que este pedido venga de Mattermost.',
})

/**
 * ¿El pedido presenta el secreto de la integración?
 *
 * FALLA CERRADO EN LOS DOS SENTIDOS: sin secreto configurado tampoco se atiende. Un endpoint
 * que escribe jornales y no verifica nada es peor que un endpoint apagado — apagado se nota
 * enseguida; abierto, recién cuando aparece una carga que nadie hizo.
 */
function verificarSecreto(esperado, presentado) {
  if (typeof esperado !== 'string' || !esperado) {
    return { ok: false, detalle: 'secreto_sin_configurar', texto: TEXTO_SECRETO.SIN_CONFIGURAR }
  }
  if (!igualEnTiempoConstante(esperado, presentado)) {
    return { ok: false, detalle: 'secreto_invalido', texto: TEXTO_SECRETO.NO_AUTORIZADO }
  }
  return { ok: true }
}

/**
 * Payload de una acción interactiva o de un envío de diálogo. Mattermost manda formas
 * distintas para cada uno; se normaliza acá una sola vez.
 */
function normalizar(payload = {}) {
  // LA MISMA DEFINICIÓN QUE EL RUTEADOR (`asistencia-mm/acciones.mjs`). Había dos criterios
  // distintos: acá alcanzaba con que hubiera `submission`, allá con `type` o `callback_id`.
  // Un envío de formulario sin campos (todos opcionales) entraba como "acción" y el rechazo
  // salía con `ephemeral_text`, que un diálogo no muestra — y el jefe se quedaba mirando un
  // formulario abierto sin saber por qué no pasó nada.
  const esDialogo = payload.type === 'dialog_submission' || Boolean(payload.callback_id)
    || (typeof payload.submission === 'object' && payload.submission !== null)
  return {
    esDialogo,
    userId: payload.user_id ?? null,
    channelId: payload.channel_id ?? null,
    // El tipo de canal NO viene en el payload de acción: Mattermost no lo manda. La guarda
    // lo resuelve contra el binding, que es la fuente confiable de todos modos.
    channelType: payload.channel_type ?? null,
    teamId: payload.team_id ?? null,
    username: payload.user_name ?? null,
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
export function crearManejadorAccion({ port, mattermost, google = null, log = null, url = null, secreto = null } = {}) {
  // Cliente INSTITUCIONAL a propósito: la asistencia escribe JORNALES *como el OS*, y el
  // candado de ediciones reconoce al OS por la cuenta de servicio en el historial de Drive.
  const g = google ?? googleDelOs({ log })
  // SIN BASE, EL SERVICIO SIGUE DE PIE Y DENIEGA. Construir el repositorio de sesiones con
  // un port nulo tiraba en el arranque, `main()` moría y systemd reiniciaba: un rato sin
  // Postgres se volvía un crash-loop, cuando lo que corresponde es contestar «probá en un
  // minuto». No se afloja nada: la guarda deniega igual (`base_indisponible`) antes de que
  // nadie necesite una sesión, así que este `null` nunca se usa.
  const sesiones = port?.query ? new SesionesPostgres(port) : null

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
      // SI EL LEDGER DEJA DE ESCRIBIR, QUE SE SEPA. `crearAuditor` nunca tira: devuelve
      // `{ok:false}`. Ese resultado se descartaba en todos lados, así que la asistencia
      // podía seguir escribiéndose en la planilla sin dejar UN SOLO rastro y sin una línea
      // de log. Para un módulo cuya seguridad se apoya en la auditoría, eso es quedarse
      // ciego en silencio. No cambia el veredicto: sólo deja de ser invisible.
      if (r?.ok === false) log?.warn?.('asistencia: no se pudo registrar el evento de auditoría', { evento, detalle: String(r.error ?? '').slice(0, 200) })
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
    const requestId = randomUUID()
    const auditar = auditorDe(correlationId)

    // 0) ¿ESTE PEDIDO VIENE DE MATTERMOST? Antes de la puerta, porque la puerta le cree la
    //    identidad al payload — y el payload lo escribe quien llama.
    //
    //    LO QUE PASABA SIN ESTO (31/07, verificado contra producción): esta ruta la publica
    //    Caddy en Internet. Un `curl` anónimo con el `user_id` de alguien habilitado y el
    //    `channel_id` del canal de asistencia pasaba el control de canal Y el de permisos, y
    //    quedaba a un paso de escribir jornales a nombre de esa persona. Ni el canal ni el
    //    permiso pueden defender nada si la identidad la pone el atacante.
    //
    //    EL SECRETO viaja en la query de la URL de callback. Mattermost guarda esa URL y no
    //    se la manda al cliente (verificado: los posts llegan sin el bloque `integration`),
    //    así que sólo su servidor puede presentarlo. Es lo mismo que ya hace el slash
    //    command con su token, por la única puerta que no lo tenía.
    const s = verificarSecreto(secreto, payload._secreto)
    if (!s.ok) {
      log?.warn?.('asistencia: acción sin secreto válido', { motivo: s.detalle, ip: payload._ip ?? null })
      await auditar(EVENTO.DENIED, payloadRechazo({
        origen: p.esDialogo ? ORIGEN.DIALOGO : ORIGEN.ACCION,
        motivo: 'token', detalle: s.detalle, identidadVerificada: false,
        actor: { plataforma_user_id: p.userId, plataforma_username: p.username },
        channelId: p.channelId, teamId: p.teamId, requestId, correlationId,
      })).catch(() => {})
      return responder(p.esDialogo ? { error: s.texto } : { ephemeral_text: s.texto })
    }

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
      mattermost, // para poder preguntar la membresía del canal (segunda vía del permiso)
    })
    if (!permitido.ok) {
      log?.info?.('asistencia: pedido rechazado en la puerta', { motivo: permitido.motivo, detalle: permitido.detalle })
      // El log sirve para mirar en el momento; la AUDITORÍA es la que queda. Se registra
      // con el mismo ledger que la carga exitosa, sin tocar ni el mensaje ni el veredicto.
      await auditar(EVENTO.DENIED, payloadRechazo({
        origen: p.esDialogo ? ORIGEN.DIALOGO : ORIGEN.ACCION,
        motivo: permitido.motivo, detalle: permitido.detalle,
        actor: { plataforma_user_id: p.userId, plataforma_username: p.username },
        channelId: p.channelId, teamId: p.teamId, requestId, correlationId,
      })).catch(() => {}) // el rechazo se devuelve igual aunque no se pueda anotar
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
      requestId,
      // El canal que la guarda acaba de confirmar como oficial. El ruteador vuelve a preguntar el
      // permiso en cada click y necesita el mismo id contra el cual mirar la membresía; sacarlo del
      // payload sería creerle al que llama justo el dato que decide si puede escribir.
      canalOficial: permitido.canal?.id ?? null,
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
