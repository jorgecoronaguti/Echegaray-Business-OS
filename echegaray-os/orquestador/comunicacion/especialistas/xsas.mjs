// XSAS EN MATTERMOST — el mismo Core que atiende a app.ecsas, por la misma puerta.
//
// ═══ QUÉ HACE ESTE ARCHIVO Y QUÉ NO ═══
//
// Traduce un mensaje del canal al contrato de `xsas-pedido.mjs`, llama al gateway y devuelve su
// texto. Nada más. No conoce ningún dominio, no elige tools y no habla con un modelo: eso ya lo
// decide el gateway con el ruteo de 4 niveles que existía desde antes.
//
// El camino es Mattermost → Gateway → Core. NUNCA Mattermost → Claude Code: Claude Code construye
// el OS, XSAS lo opera, y mezclarlos pondría la cuota de una herramienta de desarrollo en el camino
// crítico de una respuesta del negocio.
//
// ═══ POR QUÉ SÓLO RECLAMA LO QUE PUEDE RESOLVER SIN MODELO ═══
//
// `reconoce` devuelve algo únicamente cuando el texto es una frase EXACTA que el registro de
// atajos ya sabe resolver. Es la forma de sumar esta puerta sin quitarle un solo mensaje a los
// especialistas que ya funcionan: no compite por lenguaje natural, atiende lo que hoy no atiende
// nadie y lo hace con cero tokens. Ampliar lo que reclama es una decisión, no un efecto lateral.

import { atender as atenderXsas } from '../../lib/xsas-gateway.mjs'
import { atajoPara } from '../../lib/xsas-resolutores.mjs'
import { actorDeMattermost } from '../../lib/xsas-permisos.mjs'
import { sinMencion } from '../identidad-bot.mjs'

/** Una coincidencia LITERAL no es una corazonada: por eso la confianza es alta y no la neutra.
 *  Es la que decide el empate en el Director cuando otro especialista roza una palabra. */
const CONFIANZA_LITERAL = 0.9

export const especialista = {
  slug: 'xsas',
  agentSlug: 'director-planner',
  area: 'gestion_general',
  titulo: 'XSAS',
  descripcion:
    'La inteligencia del OS por su puerta única: contesta el estado de la empresa y el costo por obra '
    + 'con las mismas capacidades que usa app.ecsas, sin pagar un modelo cuando no hace falta.',
  ejemplos: ['cómo venimos', 'dónde se va la plata'],
  operativo: true,
  // Transversal: que alguien escriba en el canal de Gestión General no convierte su mensaje en un
  // pedido a XSAS. Sólo atiende por reclamo literal.
  preferidoDeArea: false,

  reconoce(texto) {
    // La mención al bot se saca ANTES de buscar el atajo: por el canal el mensaje llega como
    // «@xsas cómo venimos», y un atajo que sólo matchea el texto pelado nunca se dispararía en
    // producción aunque el test con el texto pelado pase.
    const clave = atajoPara(sinMencion(texto))
    return clave ? { intencion: clave, confianza: CONFIANZA_LITERAL } : null
  },

  // `xsas` se INYECTA —igual que `razonarRuteo` o `google` en el resto del ctx— para poder probar
  // qué PEDIDO arma este archivo sin depender de la base ni de una tool real. En producción es
  // siempre la puerta de verdad.
  async atender({ texto, intencion, port, actor, correlationId, xsas = atenderXsas }) {
    // EL DIRECTOR ENTREGA LO QUE DEVOLVIÓ `reconoce`, NO SU CAMPO. `director.mjs` guarda el objeto
    // entero (`{ intencion, confianza }`) y lo pasa tal cual como `intencion` — igual que se lo pasa
    // a `asistente.mjs`, que por eso hace `intencion?.intencion`. Mandar el objeto al gateway lo
    // rechazaba con «intencion — Expected string, received object» y el mensaje moría en el canal.
    const capacidad = typeof intencion === 'string' ? intencion : (intencion?.intencion ?? null)
    // EL ACTOR SE RESUELVE DE LA BASE, NO DEL MENSAJE. Quien escribe dice su `user_id` de
    // Mattermost y nada más; el rol —y con él los permisos— salen de `perfiles`.
    const quien = await actorDeMattermost(port, {
      userId: actor?.plataforma_user_id, username: actor?.plataforma_username,
    })
    const r = await xsas({
      actor: quien,
      canal: 'mattermost',
      origen: actor?.channel_id ?? null,
      // El atajo ya identificó la capacidad: se pide POR SU NOMBRE en vez de mandar el texto a
      // clasificar de nuevo. Es el mismo Core, entrando por su camino más barato.
      intencion: capacidad,
      mensaje: capacidad ? null : sinMencion(texto),
      correlation_id: correlationId ?? null,
      // El canal ES contexto operativo declarado en el OS (`comunicacion.canales_area`), así que
      // quien lo firma es el OS y no el navegador de nadie.
      verificado_por: 'canal-mattermost',
    }, { query: port?.query ?? null })

    return {
      texto: render(r),
      estado: r.estado,
      privado: false,
      datos: { nivel: r.capacidades.nivel, tools: r.capacidades.tools, llm: Boolean(r.llm), correlationId: r.correlationId },
    }
  },

  skillDe(intencion) { return `xsas.${(typeof intencion === 'string' ? intencion : intencion?.intencion) ?? 'gateway'}` },
}

/** La respuesta común, en markdown. Una degradación NO se esconde: se dice debajo del contenido. */
export function render(r) {
  const partes = []
  if (r.respuesta) partes.push(r.respuesta)
  else if (r.error) partes.push(`No pude resolverlo: ${r.error.mensaje}`)
  if (r.degradacion) partes.push(`\n_▲ ${r.degradacion}_`)
  return partes.join('\n') || 'Sin respuesta.'
}
