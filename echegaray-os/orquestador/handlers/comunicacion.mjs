// Handler del Work Fabric para la interfaz conversacional del OS.
//
// Es un handler REAL del Work Fabric (registrado en handlers/index.mjs), con el mismo
// contrato que los demás: async (task, ctx) => { result, evidence }. Lo dispara el worker
// cuando claima una tarea `comunicacion.responder` que creó la ingesta a partir de un
// mensaje de Mattermost.
//
// QUÉ HACE Y QUÉ NO. No conoce NINGÚN dominio: no sabe qué es la asistencia, ni una orden
// de compra, ni un pago a proveedor. Su trabajo es exactamente tres cosas:
//   1. armar el contexto (identidad, canal, correlación);
//   2. preguntarle al DIRECTOR quién atiende;
//   3. entregarle el trabajo a ese especialista y devolver su respuesta al canal.
//
// Antes tenía cableada la asistencia: un `if`, un router propio y un import del flujo de
// jornales. Eso convertía a la primera skill en un caso privilegiado y obligaba a tocar
// esta capa para agregar la segunda. Ahora agregar Compras es dejar un archivo en
// `comunicacion/especialistas/` y una fila en `comunicacion.canales_area`.

import { query, withTx } from '../lib/db.mjs'
import { resolver, renderCatalogo, VIA } from '../comunicacion/director.mjs'
import { makeGoogleClient, WORKSPACE_SCOPES } from '../lib/google.mjs'
import { operadorEmail, getTokenFor } from '../lib/google-oauth.mjs'

/** Cliente de Google del OS: actúa como la operadora con la que ya lee y escribe los Sheets
 *  de la empresa. Se arma una vez y lo comparten todos los especialistas. */
function googleDelOs(ctx) {
  const op = operadorEmail()
  return op
    ? makeGoogleClient({ config: ctx.config, scopes: WORKSPACE_SCOPES, getToken: getTokenFor(op) })
    : makeGoogleClient({ config: ctx.config, scopes: WORKSPACE_SCOPES })
}

export async function comunicacionResponderHandler(task, ctx) {
  const inp = task.inputs ?? {}
  ctx.logger?.info?.('comunicacion.responder: ejecutando', { task_id: task.id, comm_event_id: inp.comm_event_id })
  const port = ctx.port ?? { query, withTx }

  const actor = {
    plataforma_user_id: inp.actor?.id ?? null,
    plataforma_username: inp.actor?.display ?? null,
    channel_id: inp.channel_id ?? null,
    root_post_id: inp.root_post_id ?? null,
  }

  // EL DIRECTOR DECIDE. Esta capa no elige destino ni conoce gramáticas de dominio.
  const ruta = await resolver({
    texto: inp.comando, port, channelId: inp.channel_id, razonar: ctx.razonarRuteo,
  })
  ctx.logger?.info?.('director: ruteo resuelto', {
    via: ruta.via, area: ruta.area ?? null, especialista: ruta.especialista?.slug ?? null,
  })

  let texto
  let privado = false
  let datos = { via: ruta.via, area: ruta.area ?? null }

  if (!ruta.especialista) {
    texto = renderCatalogo(ruta.catalogo ?? [], { area: ruta.area })
    datos = { ...datos, skill: null, estado: 'sin_destino' }
  } else {
    const e = ruta.especialista
    const r = await e.atender({
      texto: inp.comando,
      intencion: ruta.intencion,
      port,
      google: ctx.google ?? googleDelOs(ctx),
      actor,
      correlationId: inp.correlation_id,
    })
    texto = r.texto
    privado = r.privado === true
    datos = {
      ...datos,
      especialista: e.slug,
      agente: e.agentSlug,
      skill: typeof e.skillDe === 'function' ? e.skillDe(ruta.intencion) : e.slug,
      estado: r.estado,
    }
  }

  // PRIVACIDAD. Un especialista puede declarar que su respuesta no sale en un canal
  // compartido (datos de personas, de sueldos). Se responde por DM con el bot; si el DM no
  // se puede resolver, se falla cerrado: mejor no responder que publicar el dato.
  let channelId = inp.channel_id
  let rootPostId = inp.root_post_id
  if (privado && typeof ctx.canalPrivadoPara === 'function') {
    const dm = await ctx.canalPrivadoPara(inp.actor?.id)
    if (!dm) throw new Error('comunicacion: no pude resolver el canal privado — no publico un dato reservado en un canal compartido')
    if (dm !== channelId) rootPostId = null // hilo propio del DM
    channelId = dm
  } else if (privado) {
    throw new Error('comunicacion: falta ctx.canalPrivadoPara (salida privada no cableada)')
  }

  const respuesta = {
    comm_event_id: inp.comm_event_id,
    correlation_id: inp.correlation_id,
    causation_id: inp.comm_event_id, // la respuesta la causa el evento de comunicación
    channel_id: channelId,
    root_post_id: rootPostId,
    texto,
    task_id: task.id,
  }

  if (typeof ctx.responderComunicacion !== 'function') {
    throw new Error('comunicacion.responder: falta ctx.responderComunicacion (salida no cableada)')
  }
  await ctx.responderComunicacion(respuesta)

  return {
    result: { handler: 'comunicacion.responder', comm_event_id: inp.comm_event_id, texto, via: ruta.via },
    evidence: { kind: 'comunicacion', at: new Date().toISOString(), correlation_id: task.correlation_id, datos },
  }
}

export { VIA }
