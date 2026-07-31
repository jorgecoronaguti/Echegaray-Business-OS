// ASISTENTE — el especialista que atiende los pedidos personales de cualquiera del equipo:
// buscar un archivo en Drive, recordar algo, agendar un evento, anotar una tarea.
//
// Es un especialista más, con el mismo contrato que Personal IA o Gestión General: se
// declara a sí mismo, trae su gramática y su ejecución. Toda la lógica vive en
// `asistente/router.mjs`; acá sólo se hace el enchufe con el Director.
//
// RECLAMA POCO Y A PROPÓSITO. `reconoce` devuelve algo únicamente cuando el intérprete
// DETERMINÍSTICO identificó una intención concreta ("recordame…", "agendá…", "buscame el
// contrato…"). Si sólo detectó que "hay que crear algo con fecha" —el caso ambiguo— NO
// reclama: el Director resuelve el empate por el área del canal, y un reclamo laxo acá le
// secuestraría el mensaje a Personal IA en el canal de Asistencia. Un asistente que se cree
// dueño de todo lo que suena a pedido es peor que uno que atiende menos.
//
// ÁREA, Y POR QUÉ NO ES DUEÑO DE NINGUNA. Este asistente es TRANSVERSAL: "recordame llamar
// al contador" no pertenece a Compras ni a Obras ni a Finanzas, y buscar un archivo tampoco.
// Declararlo dueño de un área cualquiera para satisfacer el registro tendría una consecuencia
// concreta y silenciosa: cuando alguien escriba algo que nadie reclama en el canal de esa
// área, el Director se lo daría A ÉL en vez de al especialista del tema. Sería peor que no
// tener asistente.
//
// Por eso declara `gestion_general` —el área del propio OS, que es lo que este asistente es—
// con `preferidoDeArea: false`: participa del catálogo y atiende POR RECLAMO, y ningún canal
// se le rutea por pertenencia. El dueño del área sigue siendo Gestión General.

import { INTENCION } from '../asistente/contratos.mjs'
import { interpretarDeterministico } from '../asistente/interpretar.mjs'
import { atenderPedido, respuestaPendiente } from '../asistente/router.mjs'

export const especialista = {
  slug: 'asistente',
  agentSlug: 'director-planner',
  area: 'gestion_general',
  preferidoDeArea: false, // transversal: atiende por reclamo, nunca por pertenecer al canal
  titulo: 'Asistente del OS',
  descripcion: 'Pedidos personales del día a día: buscar un archivo en Drive, recordarte (o recordarle a otro) algo, agendar un evento en Calendar, anotar una tarea. También responde qué sabe hacer el OS y las repreguntas del propio asistente.',
  ejemplos: ['recordame el lunes pagar IERIC', 'buscame el contrato de la Estrella', 'agendá reunión con Rodrigo el jueves a las 10'],
  operativo: true,

  /**
   * Sólo lo que la gramática reconoce SIN ambigüedad, MÁS las respuestas a lo que él mismo
   * dejó abierto. Ver el comentario de arriba.
   *
   * ── POR QUÉ HIZO FALTA LA SEGUNDA MITAD ────────────────────────────────────────────
   *
   * El router ya sabía leer "no era ese", "¿por qué ese?" y "el segundo" — y en producción no
   * servía de nada, porque el Director decide ANTES a quién darle el mensaje y preguntaba
   * sólo por la gramática. "no era ese" no es un pedido reconocible, así que nadie lo
   * reclamaba y la persona recibía el catálogo de lo que el OS sabe hacer. La corrección más
   * barata que existe se perdía a un paso de llegar.
   *
   * ── POR QUÉ EXIGE UN PENDIENTE ─────────────────────────────────────────────────────
   *
   * Sin contexto, "no" y "gracias" no son feedback de nada: son palabras sueltas que pueden
   * ser para cualquiera. El reclamo pide que haya una búsqueda abierta DE ESTA PERSONA, y
   * sólo se evalúa cuando la gramática no reconoció nada — así, cualquier mensaje que otro
   * especialista entienda sigue siendo suyo.
   */
  async reconoce(texto, ctx = {}) {
    const r = interpretarDeterministico(texto)
    if (r && r.intencion !== INTENCION.DESCONOCIDO) {
      return { destino: 'asistente', intencion: r.intencion, confianza: r.confianza }
    }
    const identidad = { plataforma: 'mattermost', plataformaUserId: ctx.actor?.plataforma_user_id ?? null }
    const respuesta = await respuestaPendiente(ctx.port, identidad, texto)
    if (!respuesta) return null
    // Alta: contestar una pregunta abierta propia es lo menos ambiguo que hay en el sistema.
    return { destino: 'asistente', intencion: respuesta.capacidad, confianza: 0.95, respuesta: respuesta.tipo }
  },

  /**
   * El handler de comunicación arma el actor con las claves de Mattermost; acá se traduce
   * al contexto del asistente una sola vez.
   */
  async atender({ texto, port, actor, correlationId, commEventId = null, auditar, config = null, googleInyectado = null }) {
    const r = await atenderPedido({
      texto,
      ctx: {
        port,
        config,
        // NO se toma el `google` del handler: ese es el de la cuenta operadora del OS. El
        // router resuelve la cuenta de QUIEN PIDE. Sólo se respeta un cliente inyectado a
        // propósito (tests), y como FÁBRICA, para que el camino sea el mismo.
        ...(googleInyectado ? { googleDe: async () => googleInyectado } : {}),
        actor: {
          plataformaUserId: actor?.plataforma_user_id ?? null,
          plataformaUsername: actor?.plataforma_username ?? null,
        },
        channelId: actor?.channel_id ?? null,
        rootPostId: actor?.root_post_id ?? null,
        // Sin `comm_event_id` la barrera de idempotencia del efecto externo no puede
        // aplicarse (no hay contra qué deduplicar). Hoy el handler no lo pasa: está anotado.
        commEventId,
        correlationId,
        auditar,
      },
    })
    return {
      texto: r.texto,
      estado: estadoDe(r),
      // Un recordatorio cruzado o una búsqueda en Drive no son datos reservados: la
      // respuesta vuelve por donde vino, que es donde la persona la está esperando.
      privado: false,
      datos: { capacidad: r.capacidad, via: r.via, ok: r.ok },
    }
  },

  skillDe(intencion) {
    const id = intencion?.intencion ?? 'pedido'
    return `asistente.${String(id).replace(/\./g, '_')}`
  },
}

/** Estado para la auditoría del Work Fabric: qué terminó pasando con el pedido. */
function estadoDe(r) {
  if (r.aclaracion) return 'aclaracion'
  if (r.ok) return r.repetida ? 'ya_ejecutado' : 'ejecutado'
  return `error_${r.error?.codigo ?? 'desconocido'}`
}
