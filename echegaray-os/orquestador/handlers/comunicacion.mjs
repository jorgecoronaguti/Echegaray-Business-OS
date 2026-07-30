// PR-4 · Handler del Work Fabric para tareas de comunicación.
//
// Es un handler REAL del Work Fabric (registrado en handlers/index.mjs), con el
// mismo contrato que los demás: async (task, ctx) => { result, evidence }. Lo
// dispara el worker cuando claima una tarea `comunicacion.responder` que creó la
// ingesta (ingesta-os.mjs) a partir de un mensaje de Mattermost.
//
// Qué hace: computa la respuesta REAL del Business OS (estado del sistema, datos
// reales de orq) y la DEVUELVE al Communication Service como evento canónico
// saliente, vía el callback inyectado `ctx.responderComunicacion` — preservando
// channel, hilo, correlation_id, causation_id y comm_event_id. No contiene lógica
// de negocio de dominio ni conoce Mattermost: sólo produce la respuesta y la
// entrega al puerto de salida.

import { query, withTx } from '../lib/db.mjs'
import { estadoSistema } from '../comunicacion/estado-sistema.mjs'
import { manejarAsistencia, consultarAsistencia } from '../comunicacion/asistencia-flujo.mjs'
import { clasificar, COMANDO } from '../comunicacion/asistencia-ui.mjs'
import { parsearConsulta } from '../lib/asistencia-consultas.mjs'
import { fechaOperativaSanJuan } from '../lib/fecha-operativa.mjs'
import { makeGoogleClient, WORKSPACE_SCOPES } from '../lib/google.mjs'
import { operadorEmail, getTokenFor } from '../lib/google-oauth.mjs'

// Reconocimiento de comando para la prueba inicial: SÓLO "@os estado del sistema".
// No es un catálogo — cualquier otra cosa responde "no soportado" de forma segura.
function normalizar(texto) {
  return String(texto ?? '')
    .replace(/@os\b/gi, '') // saca la mención al bot
    .toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '') // sin tildes
    .replace(/\s+/g, ' ').trim()
}
function esEstadoDelSistema(comando) {
  const n = normalizar(comando)
  return n === 'estado del sistema' || n === 'estado' || n === 'status'
}

/**
 * ¿El mensaje es para el skill de asistencia? Se pregunta al parser del propio skill (no
 * se duplica la gramática acá) y se exige que la intención sea de INICIO: `asistencia`.
 * Los pasos siguientes del flujo se atienden porque el jefe ya tiene sesión abierta.
 */
async function rutearAsistencia(comando, port, plataformaUserId) {
  // `isoContexto` NO es opcional: sin él, una consulta con fecha relativa ("ayer") queda sin
  // fecha y se responde con la de HOY, y una fecha sin año ("del 29/07") se resuelve al año
  // 2000 (`Number('')` es 0 → +2000) y devuelve "no existe la hoja del año 2000". El flujo de
  // REGISTRO no lo sufría porque `manejarAsistencia` vuelve a parsear con la fecha operativa;
  // la consulta usa la intención que se parsea ACÁ, así que acá tiene que entrar el contexto.
  const r = clasificar(comando, { parsearConsulta, isoContexto: fechaOperativaSanJuan() })
  if (!r.destino) return null
  // Una CONSULTA se atiende siempre: no necesita formulario abierto.
  if (r.destino === 'consulta') return r
  if (r.intencion?.tipo === 'iniciar') return r
  // Un `confirmar` / `obra 2` sueltos sólo son de este skill si ESTA persona tiene una
  // sesión abierta. Acotado al usuario a propósito: sin el filtro, el `confirmar` de
  // cualquiera se rutearía al skill porque otro tenía un formulario abierto.
  if (!plataformaUserId) return null
  try {
    const { rows } = await port.query(
      `select 1 from comunicacion.asistencia_sesiones
        where plataforma = 'mattermost' and plataforma_user_id = $1
          and estado = 'abierta' and expira_at > now() limit 1`,
      [plataformaUserId])
    return rows.length > 0 ? r : null
  } catch { return null }
}

/** Cliente de Google para el skill: actúa como la operadora del OS (misma identidad
 *  con la que el OS ya lee y escribe los Sheets de la empresa). */
function googleParaAsistencia(ctx) {
  const op = operadorEmail()
  return op
    ? makeGoogleClient({ config: ctx.config, scopes: WORKSPACE_SCOPES, getToken: getTokenFor(op) })
    : makeGoogleClient({ config: ctx.config, scopes: WORKSPACE_SCOPES })
}

export async function comunicacionResponderHandler(task, ctx) {
  const inp = task.inputs ?? {}
  ctx.logger?.info?.('comunicacion.responder: ejecutando', { task_id: task.id, comm_event_id: inp.comm_event_id })
  const port = ctx.port ?? { query, withTx }

  let texto
  let datos = {}
  let privado = false
  const ruta = await rutearAsistencia(inp.comando, port, inp.actor?.id)
  if (ruta) {
    // Operación DETERMINÍSTICA en los dos caminos: no interviene el Director IA ni un
    // especialista. Qué fila, qué columna y qué número se leen o se escriben lo decide
    // código sobre la planilla.
    const comun = {
      port,
      google: ctx.google ?? googleParaAsistencia(ctx),
      actor: {
        plataforma_user_id: inp.actor?.id ?? null,
        plataforma_username: inp.actor?.display ?? null,
        channel_id: inp.channel_id ?? null,
        root_post_id: inp.root_post_id ?? null,
      },
      texto: inp.comando,
      correlationId: inp.correlation_id,
    }
    const r = ruta.destino === 'consulta'
      ? await consultarAsistencia({ ...comun, consulta: ruta.consulta })
      : await manejarAsistencia(comun)
    texto = r.texto
    privado = r.privado === true
    datos = { skill: `personal.${ruta.destino === 'consulta' ? 'consultar' : 'registrar'}_asistencia`, estado: r.estado }
  } else if (esEstadoDelSistema(inp.comando)) {
    const estado = await estadoSistema({ query }) // trabajo real: datos reales de orq
    texto = estado.texto
    datos = estado.datos
  } else {
    texto = `Comando no soportado todavía. Probá: \`@os estado del sistema\` o \`@os ${COMANDO}\``
  }

  // PRIVACIDAD: la asistencia del personal no sale en un canal compartido. Se responde
  // por DM con el bot; si el mensaje ya venía por DM, es el MISMO canal. Si el DM no se
  // puede resolver, se falla cerrado: mejor no responder que publicar el dato.
  let channelId = inp.channel_id
  let rootPostId = inp.root_post_id
  if (privado && typeof ctx.canalPrivadoPara === 'function') {
    const dm = await ctx.canalPrivadoPara(inp.actor?.id)
    if (!dm) throw new Error('asistencia: no pude resolver el canal privado — no publico el dato en un canal compartido')
    if (dm !== channelId) rootPostId = null // hilo propio del DM
    channelId = dm
  } else if (privado) {
    throw new Error('asistencia: falta ctx.canalPrivadoPara (salida privada no cableada)')
  }

  const respuesta = {
    comm_event_id: inp.comm_event_id,
    correlation_id: inp.correlation_id,
    causation_id: inp.comm_event_id, // la respuesta la causa el evento de comunicación
    channel_id: channelId,
    root_post_id: rootPostId, // hilo: se responde en el mismo post (salvo salto a DM)
    texto,
    task_id: task.id,
  }

  // Devolver al Communication Service como evento canónico saliente. El callback
  // lo inyecta el conector/worker; si no está (config incompleta), fallar cerrado.
  if (typeof ctx.responderComunicacion !== 'function') {
    throw new Error('comunicacion.responder: falta ctx.responderComunicacion (salida no cableada)')
  }
  await ctx.responderComunicacion(respuesta)

  return {
    result: { handler: 'comunicacion.responder', comm_event_id: inp.comm_event_id, texto },
    evidence: { kind: 'comunicacion', at: new Date().toISOString(), correlation_id: task.correlation_id, datos },
  }
}
