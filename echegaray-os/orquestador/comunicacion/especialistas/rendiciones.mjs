// RENDICIONES — el ticket del efectivo a rendir, mandado al canal de comprobantes de Mattermost.
//
// ═══ EL PEDIDO, TEXTUAL (22/09/2026) ═══
//
// El dueño, sobre cómo se carga una rendición desde el chat: «se tiene q hacer a traves de un canal
// nuevo en el chat de matter». No por mensaje directo al bot: un canal propio, atado al área
// `rendicion` en `comunicacion.canales_area` (el vínculo es un dato, no código).
//
// ═══ QUÉ HACE ═══
//
// Una foto de quien tiene una entrega abierta es un gasto pagado con plata que la empresa YA le entregó a
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
// ═══ EL CANAL «EFECTIVO» (dueño, 22/09/2026, decisión final) ═══
//
// Tres vueltas: canal nuevo → el de comprobantes → canal propio otra vez, cuando el dueño vio que mezclarlos
// obligaba al bot a adivinar (*«ese es de carga de archivos multimedia para gastos»*). Ahora no hay nada que
// adivinar: TODO lo que entra al canal Efectivo es efectivo a rendir —una foto es un ticket, salvo que sea la
// foto de un vale de entrega—, y Comprobantes-gastos es sólo gastos de compras.
//
// ═══ LAS DOS PUERTAS, FALLA CERRADO ═══
//
//   1. CANAL: un canal OFICIAL de `rendicion` o de `compras` (el binding, no una lista en el código).
//   2. QUIÉN: la persona del padrón detrás del usuario de Mattermost tiene una entrega ABIERTA. No
//      alcanza con estar en el canal: rendir descuenta de SU saldo, así que tiene que tener uno.
import { procesarComprobantes } from '../comprobantes/circuito.mjs'
import { canalOficialDeArea } from '../../lib/canal-de-area.mjs'
import { atenderVale } from './entregas-efectivo.mjs'

export const AREA_RENDICION = 'rendicion'
/** Las áreas cuyo canal oficial acepta una rendición: sólo la del canal Efectivo. */
export const AREAS_QUE_RINDEN = Object.freeze([AREA_RENDICION])
/** Lo que escribe quien pagó de su bolsillo o con la caja de la oficina teniendo una entrega abierta. */
export const RE_NO_ES_DE_LA_ENTREGA = /\bno es (de la|de mi|a rendir)\b|caja de la oficina|de la caja chica/i
const RE_CODIGO = /\bER-?\s?(\d{1,6})\b/i

export const TEXTO = Object.freeze({
  CANAL: 'Las rendiciones se mandan al canal Efectivo. Mandá la foto del ticket ahí.',
  NO_VERIFICABLE: 'No pude confirmar desde dónde escribís ni quién sos, así que no cargué nada. Probá de nuevo en un minuto.',
  SIN_PERSONA: 'No encuentro tu legajo detrás de este usuario de Mattermost, y cada rendición descuenta del saldo de una persona. Avisale a Administración.',
  ES_PRUEBA: 'Esta persona es de PRUEBA: no cargo su ticket en Compras. Si esto no es una prueba, avisale a Administración.',
  SIN_ENTREGA: 'No tenés efectivo a rendir abierto, así que no cargué el ticket. Si pagaste con plata de la empresa, avisale a Administración para que registre la entrega.',
  AYUDA: [
    'Soy **Rendiciones**. Para rendir un gasto pagado con efectivo que te entregó la empresa:',
    '',
    '1. Sacá la foto del ticket o la factura y mandala a este canal. No hace falta mencionarme.',
    '   Si el gasto lo pagaste con la caja de la oficina, mandalo a Comprobantes-gastos, no acá.',
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
    `select p.id as perfil_id, p.persona_id, coalesce(per.es_prueba, false) as es_prueba
       from comunicacion.identidades i
       join auth.users u on lower(u.email) = lower(i.email)
       join public.perfiles p on p.id = u.id
      left join public.personas per on per.id = p.persona_id
      where i.plataforma = 'mattermost' and i.plataforma_user_id = $1 and i.activo
      limit 1`, [String(mmUserId)])
  const yo = r?.rows?.[0]
  if (!yo?.persona_id) return { perfilId: yo?.perfil_id ?? null, personaId: null, esPrueba: false, abiertas: [] }
  const e = await port.query(
    `select e.id, e.codigo, e.estructura, e.es_prueba, o.nombre as obra, o.codigo as obra_codigo
       from public.efectivo_entrega e left join public.obra_canonica o on o.id = e.obra_id
      where e.persona_id = $1 and e.anulada_en is null and e.cerrada_en is null
      order by e.fecha, e.numero`, [yo.persona_id])
  return { perfilId: yo.perfil_id, personaId: yo.persona_id, esPrueba: yo.es_prueba === true, abiertas: e?.rows ?? [] }
}

export const especialista = {
  slug: 'rendiciones',
  agentSlug: 'compras',
  area: AREA_RENDICION,
  titulo: 'Rendiciones · efectivo a rendir',
  descripcion:
    'Rendí un gasto pagado con efectivo que te entregó la empresa: mandá la foto del ticket al canal de '
    + 'efectivo. Lo cargo en Compras como «A rendir», a la obra de tu entrega, y baja lo que te queda por rendir.',
  ejemplos: ['(mandá la foto del ticket al canal Efectivo)', 'cómo rindo un gasto'],
  operativo: true,
  preferidoDeArea: true,

  async reconoce(texto, ctx = {}) {
    if (!AREAS_QUE_RINDEN.includes(ctx.area)) return null
    if ((ctx.fileIds?.length ?? 0) > 0) return { destino: 'rendir', confianza: 1 }
    // En su propio canal, un texto sin foto se contesta con cómo se usa: el área tiene que tener dueño.
    return { destino: 'ayuda', confianza: 0.5 }
  },

  // `procesar` es inyectable para que los tests prueben QUÉ se le manda al circuito (el forzado de
  // «A rendir» y del pago); en producción es siempre el circuito real.
  async atender({ texto, intencion, port, actor, google, fileIds = [], postId, mattermost, log, procesar = procesarComprobantes, vale = atenderVale }) {
    const ruta = intencion ?? await this.reconoce(texto, { fileIds, area: AREA_RENDICION })
    if (!fileIds.length || ruta?.destino !== 'rendir') return { texto: TEXTO.AYUDA, estado: 'ayuda', privado: false }

    // LA FOTO DE UN VALE NO ES UN TICKET: es plata SALIENDO del cajón. Se mira sólo si el mensaje dice
    // «vale» o «entregué», y si el papel resulta ser otra cosa, sigue como ticket. Ver `entregas-efectivo`.
    const esVale = await vale({ texto, port, actor, mattermost, fileIds, log }).catch(() => null)
    if (esVale) return esVale

    // 1. CANAL: el oficial de rendiciones o el de comprobantes. Un canal cualquiera sigue sin entrar.
    let canal = { ok: false, motivo: 'no_es_el_oficial' }
    for (const area of AREAS_QUE_RINDEN) {
      const r = await canalOficialDeArea({ port, channelId: actor?.channel_id, area })
      if (r.ok) { canal = r; break }
      if (r.motivo === 'no_verificable') canal = r
    }
    if (!canal.ok) return { texto: canal.motivo === 'no_verificable' ? TEXTO.NO_VERIFICABLE : TEXTO.CANAL, estado: `rechazado_canal`, privado: false }

    // 2. QUIÉN, y a qué entrega
    let yo
    try { yo = await entregasAbiertasDe(port, actor?.plataforma_user_id) } catch { return { texto: TEXTO.NO_VERIFICABLE, estado: 'rechazado_no_verificable', privado: false } }
    if (!yo.personaId) return { texto: TEXTO.SIN_PERSONA, estado: 'rechazado_sin_persona', privado: false }
    // PERSONA DE PRUEBA, NADA EN COMPRAS (auditoría 22/09/2026): la caja ya excluye sus entregas (migración
    // 1900), pero su ticket sí entraría a Compras y al libro, con espejo y sin la entrega que lo respalda.
    if (yo.esPrueba) return { texto: TEXTO.ES_PRUEBA, estado: 'rechazado_persona_prueba', privado: false }
    const { entrega, motivo } = elegirEntrega(yo.abiertas, texto)
    if (motivo === 'ninguna') return { texto: TEXTO.SIN_ENTREGA, estado: 'rechazado_sin_entrega', privado: false }
    if (!entrega) return { texto: textoAmbigua(yo.abiertas), estado: 'pregunta_entrega', privado: false }
    // UNA ENTREGA DECLARADA PRUEBA NO ESCRIBE COMPRAS (dueño, 23/09/2026). Es la misma razón por la que
    // no escribe una persona de prueba: la fila iría a la pestaña real, con su espejo y su descuento de
    // caja, y después no hay puerta para sacarla. Se contesta —callar es peor— y no se carga nada.
    if (entrega.es_prueba) {
      return {
        texto: [`**${entrega.codigo}** está declarada prueba: no cargo nada en Compras.`, '',
          'Podés seguir probando el circuito —la foto, la lectura, la firma— y borrar la entrega entera '
          + 'desde su ficha cuando termines. Para que un ticket entre de verdad, hacelo sobre una '
          + 'entrega sin la marca de prueba.'].join('\n'),
        estado: 'rechazado_entrega_prueba',
        privado: false,
      }
    }

    // EL POST, NO EL HILO (auditoría 22/09/2026): con el hilo como clave, un segundo ticket mandado en el
    // mismo hilo chocaba contra el primero y quedaba vinculado a su entrega sin registrarse.
    const post = postId ?? actor?.root_post_id ?? null
    // El ticket queda registrado ANTES de cargar: si la escritura queda en espera, la reconciliación
    // lo vincula cuando se complete.
    await port.query(
      `insert into public.efectivo_comprobante (entrega_id, mm_post_id, canal, enviado_por)
       values ($1, $2, 'mattermost', $3) on conflict (mm_post_id) do nothing`,
      [entrega.id, String(post), yo.perfilId])

    const r = await procesar({
      port, google, log, mattermost,
      // La guarda de compras preguntaría por el canal de COMPRAS y denegaría éste. Las dos puertas de la
      // rendición ya se pasaron arriba, contra este canal y esta persona.
      guarda: async () => ({ ok: true, canal: { id: actor?.channel_id, nombre: canal.nombre, area: AREA_RENDICION }, via: 'entrega' }),
    }, {
      fileIds,
      texto: entrega.estructura ? null : [entrega.obra_codigo, entrega.obra].filter(Boolean).join(' '),
      forzar: { formaPago: 'A rendir', pagado: true },
      actor,
      channelId: actor?.channel_id,
      rootPostId: actor?.root_post_id ?? post,
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
