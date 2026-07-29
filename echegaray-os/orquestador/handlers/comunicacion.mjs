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

export async function comunicacionResponderHandler(task, ctx) {
  const inp = task.inputs ?? {}
  ctx.logger?.info?.('comunicacion.responder: ejecutando', { task_id: task.id, comm_event_id: inp.comm_event_id })

  // Trabajo real del OS: leer el estado del sistema desde la base del Work Fabric.
  const estado = await estadoSistema({ query })

  const respuesta = {
    comm_event_id: inp.comm_event_id,
    correlation_id: inp.correlation_id,
    causation_id: inp.comm_event_id, // la respuesta la causa el evento de comunicación
    channel_id: inp.channel_id,
    root_post_id: inp.root_post_id, // hilo: se responde en el mismo post
    texto: estado.texto,
    task_id: task.id,
  }

  // Devolver al Communication Service como evento canónico saliente. El callback
  // lo inyecta el conector/worker; si no está (config incompleta), fallar cerrado.
  if (typeof ctx.responderComunicacion !== 'function') {
    throw new Error('comunicacion.responder: falta ctx.responderComunicacion (salida no cableada)')
  }
  await ctx.responderComunicacion(respuesta)

  return {
    result: { handler: 'comunicacion.responder', comm_event_id: inp.comm_event_id, texto: estado.texto },
    evidence: { kind: 'comunicacion', at: new Date().toISOString(), correlation_id: task.correlation_id, datos: estado.datos },
  }
}
