// RENDICIONES — el ticket del efectivo a rendir, mandado al canal de rendiciones de Mattermost.
//
// ═══ EL PEDIDO, TEXTUAL (22/09/2026) ═══
//
// El dueño, sobre cómo se carga una rendición desde el chat: «se tiene q hacer a traves de un canal
// nuevo en el chat de matter». No por mensaje directo al bot: un canal propio, atado al área
// `rendicion` en `comunicacion.canales_area` (el vínculo es un dato, no código).
//
// ═══ QUÉ HACE ═══
//
// Una foto en el canal de rendiciones es un gasto pagado con plata que la empresa YA le entregó a
// quien la manda. Entra por EL MISMO circuito que el canal de comprobantes (lectura, ARCA, duplicados,
// escritura con freno de mano), con dos datos que el papel no puede decir y que acá se saben:
//
//   · Tipo pago «A rendir» — el billete salió del cajón con la entrega; si dijera «Efectivo», CAJA lo
//     restaría dos veces.
//   · la obra — la que Administración declaró al entregar la plata.
//
// Lo escrito queda vinculado a la entrega (`vincular_rendiciones_pendientes`) y el saldo de la persona
// baja. No pregunta nada que pueda resolver solo: el dueño pidió el 13/08 que el bot no pregunte.
//
// ═══ LO QUE NO PUBLICA ═══
//
// El saldo de cada persona. El canal lo ven todos los que rinden, y cuánto tiene cada uno en la mano
// es de esa persona y de Administración: se ve en la app, no en el grupo.
//
// ═══ LAS DOS PUERTAS, FALLA CERRADO ═══
//
//   1. CANAL: el oficial del área `rendicion`.
//   2. QUIÉN: la persona del padrón detrás del usuario de Mattermost tiene una entrega ABIERTA. No
//      alcanza con estar en el canal: rendir descuenta de SU saldo, así que tiene que tener uno.
import { procesarComprobantes } from '../comprobantes/circuito.mjs'
import { canalOficialDeArea } from '../../lib/canal-de-area.mjs'

export const AREA_RENDICION = 'rendicion'
const RE_CODIGO = /\bER-?\s?(\d{1,6})\b/i

export const TEXTO = Object.freeze({
  CANAL: 'Las rendiciones se mandan al canal de rendiciones. Mandá la foto del ticket ahí.',
  NO_VERIFICABLE: 'No pude confirmar desde dónde escribís ni quién sos, así que no cargué nada. Probá de nuevo en un minuto.',
  SIN_PERSONA: 'No encuentro tu legajo detrás de este usuario de Mattermost, y cada rendición descuenta del saldo de una persona. Avisale a Administración.',
  SIN_ENTREGA: 'No tenés efectivo a rendir abierto, así que no cargué el ticket. Si pagaste con plata de la empresa, avisale a Administración para que registre la entrega.',
  AYUDA: [
    'Soy **Rendiciones**. Para rendir un gasto pagado con efectivo que te entregó la empresa:',
    '',
    '1. Sacá la foto del ticket o la factura y mandala a este canal. No hace falta mencionarme.',
    '2. La cargo sola en **Compras** como «A rendir», a la obra de tu entrega, y te contesto qué quedó.',
    '3. Si tenés más de una entrega abierta, escribí su número (por ejemplo **ER-0147**) junto con la foto.',
    '',
    'Cuánto te queda por rendir lo ves en la app, en **Mi efectivo**: no lo publico en el canal.',
  ].join('\n'),
})

/** Minúsculas y sin acentos, para comparar nombres de obra contra lo escrito. */
const plano = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/**
 * NÚCLEO PURO: ¿a qué entrega va esta foto?
 *
 * Una sola abierta → ésa. Varias → la que el texto nombra (por código ER-nnnn o por obra). Si el texto
 * no decide, NO se adivina: se pregunta cuál, sin montos. Imputar a la entrega equivocada es mover el
 * gasto de obra y el saldo de la persona al mismo tiempo.
 *
 * @param {Array<{id:string, codigo:string, obra?:string|null, estructura?:boolean}>} abiertas
 * @param {string} texto lo que la persona escribió con la foto
 * @returns {{entrega:object|null, motivo:'unica'|'codigo'|'obra'|'ninguna'|'ambigua'}}
 */
export function elegirEntrega(abiertas = [], texto = '') {
  if (!abiertas.length) return { entrega: null, motivo: 'ninguna' }
  if (abiertas.length === 1) return { entrega: abiertas[0], motivo: 'unica' }
  const m = String(texto ?? '').match(RE_CODIGO)
  if (m) {
    const n = Number(m[1])
    const e = abiertas.find((a) => Number(String(a.codigo).replace(/\D/g, '')) === n)
    if (e) return { entrega: e, motivo: 'codigo' }
  }
  const t = plano(texto)
  const porObra = abiertas.filter((a) => a.obra && t.includes(plano(a.obra)))
  if (porObra.length === 1) return { entrega: porObra[0], motivo: 'obra' }
  return { entrega: null, motivo: 'ambigua' }
}

/** Qué entrega elegir, dicho sin plata: el canal lo ve todo el grupo. */
export function textoAmbigua(abiertas = []) {
  return ['Tenés más de una entrega abierta y no sé a cuál va este ticket. Mandalo de nuevo con el número:',
    '', ...abiertas.map((a) => `- **${a.codigo}** · ${a.estructura ? 'Estructura' : (a.obra ?? 'sin obra')}`)].join('\n')
}

/** La persona del padrón detrás del usuario de Mattermost, y sus entregas abiertas. */
export async function entregasAbiertasDe(port, mmUserId) {
  const r = await port.query(
    `select p.id as perfil_id, p.persona_id
       from comunicacion.identidades i
       join auth.users u on lower(u.email) = lower(i.email)
       join public.perfiles p on p.id = u.id
      where i.plataforma = 'mattermost' and i.plataforma_user_id = $1 and i.activo
      limit 1`, [String(mmUserId)])
  const yo = r?.rows?.[0]
  if (!yo?.persona_id) return { perfilId: yo?.perfil_id ?? null, personaId: null, abiertas: [] }
  const e = await port.query(
    `select e.id, e.codigo, e.estructura, o.nombre as obra, o.codigo as obra_codigo
       from public.efectivo_entrega e left join public.obra_canonica o on o.id = e.obra_id
      where e.persona_id = $1 and e.anulada_en is null and e.cerrada_en is null
      order by e.fecha, e.numero`, [yo.persona_id])
  return { perfilId: yo.perfil_id, personaId: yo.persona_id, abiertas: e?.rows ?? [] }
}

export const especialista = {
  slug: 'rendiciones',
  agentSlug: 'compras',
  area: AREA_RENDICION,
  titulo: 'Rendiciones · efectivo a rendir',
  descripcion:
    'Rendí un gasto pagado con efectivo que te entregó la empresa: mandá la foto del ticket al canal de '
    + 'rendiciones. Lo cargo en Compras como «A rendir», a la obra de tu entrega, y baja lo que te queda por rendir.',
  ejemplos: ['(mandá la foto del ticket al canal de rendiciones)', 'cómo rindo un gasto'],
  operativo: true,
  preferidoDeArea: true,

  async reconoce(texto, ctx = {}) {
    if (ctx.area !== AREA_RENDICION) return null
    if ((ctx.fileIds?.length ?? 0) > 0) return { destino: 'rendir', confianza: 1 }
    // En su propio canal, un texto sin foto se contesta con cómo se usa: el área tiene que tener dueño.
    return { destino: 'ayuda', confianza: 0.5 }
  },

  async atender({ texto, intencion, port, actor, google, fileIds = [], postId, mattermost, log }) {
    const ruta = intencion ?? await this.reconoce(texto, { fileIds, area: AREA_RENDICION })
    if (!fileIds.length || ruta?.destino !== 'rendir') return { texto: TEXTO.AYUDA, estado: 'ayuda', privado: false }

    // 1. CANAL
    const canal = await canalOficialDeArea({ port, channelId: actor?.channel_id, area: AREA_RENDICION })
    if (!canal.ok) return { texto: canal.motivo === 'no_verificable' ? TEXTO.NO_VERIFICABLE : TEXTO.CANAL, estado: `rechazado_canal`, privado: false }

    // 2. QUIÉN, y a qué entrega
    let yo
    try { yo = await entregasAbiertasDe(port, actor?.plataforma_user_id) } catch { return { texto: TEXTO.NO_VERIFICABLE, estado: 'rechazado_no_verificable', privado: false } }
    if (!yo.personaId) return { texto: TEXTO.SIN_PERSONA, estado: 'rechazado_sin_persona', privado: false }
    const { entrega, motivo } = elegirEntrega(yo.abiertas, texto)
    if (motivo === 'ninguna') return { texto: TEXTO.SIN_ENTREGA, estado: 'rechazado_sin_entrega', privado: false }
    if (!entrega) return { texto: textoAmbigua(yo.abiertas), estado: 'pregunta_entrega', privado: false }

    const post = actor?.root_post_id ?? postId ?? null
    // El ticket queda registrado ANTES de cargar: si la escritura queda en espera, la reconciliación
    // lo vincula cuando se complete.
    await port.query(
      `insert into public.efectivo_comprobante (entrega_id, mm_post_id, canal, enviado_por)
       values ($1, $2, 'mattermost', $3) on conflict (mm_post_id) do nothing`,
      [entrega.id, String(post), yo.perfilId])

    const r = await procesarComprobantes({
      port, google, log, mattermost,
      // La guarda de compras preguntaría por el canal de COMPRAS y denegaría éste. Las dos puertas de la
      // rendición ya se pasaron arriba, contra este canal y esta persona.
      guarda: async () => ({ ok: true, canal: { id: actor?.channel_id, nombre: canal.nombre, area: AREA_RENDICION }, via: 'entrega' }),
    }, {
      fileIds,
      texto: entrega.estructura ? null : [entrega.obra_codigo, entrega.obra].filter(Boolean).join(' '),
      forzar: { formaPago: 'A rendir' },
      actor,
      channelId: actor?.channel_id,
      rootPostId: post,
      postId: post,
      ahora: new Date(),
    })
    try { await port.query('select public.vincular_rendiciones_pendientes()') } catch (e) {
      log?.warn?.('rendiciones: no pude vincular ahora; lo hace la próxima vuelta', { error: String(e?.message ?? e) })
    }
    const encabezado = `Rendición de **${entrega.codigo}** · ${entrega.estructura ? 'Estructura' : entrega.obra}`
    return { texto: [encabezado, '', r.texto].join('\n'), estado: r.estado, fajoId: r.fajoId, parte: r.parte, privado: false }
  },

  skillDe(intencion) {
    return `compras.rendiciones.${intencion?.destino === 'rendir' ? 'rendir' : 'ayuda'}`
  },
}
