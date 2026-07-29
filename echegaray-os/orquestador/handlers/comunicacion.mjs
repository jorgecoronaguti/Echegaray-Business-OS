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

import { query } from '../lib/db.mjs'
import { estadoSistema } from '../comunicacion/estado-sistema.mjs'

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

export async function comunicacionResponderHandler(task, ctx) {
  const inp = task.inputs ?? {}
  ctx.logger?.info?.('comunicacion.responder: ejecutando', { task_id: task.id, comm_event_id: inp.comm_event_id })

  // Contrato de la prueba inicial: sólo "estado del sistema". Otro comando → no soportado.
  let texto
  let datos = {}
  if (esEstadoDelSistema(inp.comando)) {
    const estado = await estadoSistema({ query }) // trabajo real: datos reales de orq
    texto = estado.texto
    datos = estado.datos
  } else {
    texto = 'Comando no soportado todavía. Probá: @os estado del sistema'
  }

  const respuesta = {
    comm_event_id: inp.comm_event_id,
    correlation_id: inp.correlation_id,
    causation_id: inp.comm_event_id, // la respuesta la causa el evento de comunicación
    channel_id: inp.channel_id,
    root_post_id: inp.root_post_id, // hilo: se responde en el mismo post
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
