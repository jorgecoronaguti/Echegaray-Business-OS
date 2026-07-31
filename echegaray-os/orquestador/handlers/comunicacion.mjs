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
import { resolver, renderCatalogo, areaDelCanal, VIA } from '../comunicacion/director.mjs'
import { googleDelOs } from '../lib/google-os.mjs'

export async function comunicacionResponderHandler(task, ctx) {
  const inp = task.inputs ?? {}
  ctx.logger?.info?.('comunicacion.responder: ejecutando', { task_id: task.id, comm_event_id: inp.comm_event_id })
  const port = ctx.port ?? { query, withTx }

  const actor = {
    plataforma_user_id: inp.actor?.id ?? null,
    plataforma_username: inp.actor?.display ?? null,
    channel_type: inp.channel_type ?? null,
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
  let salida = null
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
      google: ctx.google ?? googleDelOs({ config: ctx.config }),
      actor,
      correlationId: inp.correlation_id,
      // El mensaje que originó el pedido. Viaja porque es la CLAVE DE IDEMPOTENCIA del
      // efecto externo: un especialista que crea un evento de Calendar necesita poder
      // preguntar "¿este mensaje ya se ejecutó?" antes de crear el segundo. Sin esto, un
      // lease vencido y reclamado por otro worker duplica el efecto en silencio.
      commEventId: inp.comm_event_id ?? null,
      config: ctx.config ?? null,
      // `google` (arriba) es el cliente de la cuenta OPERADORA del OS: es lo correcto para
      // Personal IA, que escribe JORNALES *como el OS*. Un especialista que actúa POR una
      // persona (su Drive, su agenda, sus tareas) tiene que resolver su propia cuenta y no
      // usar esta. Se distingue acá lo que alguien INYECTÓ (tests) de lo que armó este
      // handler por defecto: sin esa distinción, el especialista no puede saber si el
      // cliente que recibió es el que le corresponde.
      googleInyectado: ctx.google ?? null,
    })
    salida = r
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

  // PRIVACIDAD, resuelta por CONTEXTO y no por reflejo.
  //
  // Un especialista declara `privado: true` cuando su respuesta lleva datos reservados
  // (personas, horas, sueldos). Eso NO significa "siempre por DM": significa "no en
  // cualquier lado". Si el mensaje nació en un canal PRIVADO que el OS tiene atado a esa
  // misma área, ese canal ES el lugar correcto — es el espacio operativo que la empresa
  // eligió para el tema, y desviar a DM ahí rompe la conversación de equipo: el resto del
  // canal ve la pregunta y no la respuesta. Sólo cuando el origen no es un canal atado al
  // área se responde por DM.
  let channelId = inp.channel_id
  let rootPostId = inp.root_post_id
  const canalPropio = Boolean(ruta.area) && ruta.area === (await areaDelCanal(port, inp.channel_id))?.area
  if (privado && canalPropio) {
    ctx.logger?.info?.('comunicacion: respuesta reservada en su canal operativo', { area: ruta.area })
  } else if (privado && typeof ctx.canalPrivadoPara === 'function') {
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
    // Un especialista puede responder con una UI interactiva en vez de sólo texto.
    ...(Array.isArray(salida?.attachments) && salida.attachments.length ? { attachments: salida.attachments } : {}),
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
