// ENTREGAR EFECTIVO DESDE EL CHAT — «entregué $250.000 a Rubén Sosa para el galpón 8».
//
// ═══ EL PEDIDO, TEXTUAL (22/09/2026) ═══
//
// *«tiene q registrar lenguaje natural "$x entregada para x persona o para x gasto", tiene q ser inteligente
// y tb registro mediante multimedia, la tecnologia tiene q estar el servicio. todo eso es por medio del chat
// en canal envio de comprobantes»*.
//
// ═══ LO QUE HACE, Y LO QUE NO ═══
//
// Registra la entrega y avisa a quien la recibió para que firme. No publica el saldo de nadie —el canal lo
// ven todos— y no adivina: si no entiende el monto, la persona o el destino, pregunta exactamente eso.
//
// ═══ LAS DOS PUERTAS ═══
//
//   1. CANAL: el oficial de `compras` (Comprobantes-gastos) o de `rendicion`. Un canal cualquiera no entra.
//   2. QUIÉN: la escritura corre COMO EL PERFIL de quien escribe (`comoUsuario`), así que la base aplica
//      `es_administracion()`. Si quien lo pide no puede entregar, lo rechaza Postgres, no este archivo. Y la
//      entrega queda firmada con su nombre en `entregada_por`, no con el del robot.
import { canalOficialDeArea } from '../../lib/canal-de-area.mjs'
import { comoUsuario } from '../../lib/como-usuario.mjs'
import {
  interpretarEntrega, pareceEntrega, pesos, textoDePregunta,
} from '../../lib/efectivo-entrega-texto.mjs'

export const AREAS_QUE_ENTREGAN = Object.freeze(['compras', 'rendicion'])

export const TEXTO = Object.freeze({
  CANAL: 'El efectivo se entrega desde el canal de comprobantes. Escribilo ahí.',
  NO_VERIFICABLE: 'No pude confirmar desde dónde escribís ni quién sos, así que no registré nada. Probá de nuevo en un minuto.',
  SIN_PERSONA: 'No encuentro tu usuario en el padrón, y una entrega queda firmada por quien la hace. Avisale a Administración.',
  SIN_PERMISO: 'Entregar efectivo es de Dirección, Administración o el jefe de obra. No registré nada.',
  AYUDA: [
    'Para registrar una entrega de efectivo, escribila en una línea:',
    '',
    '- `entregué $250.000 a Rubén Sosa para el galpón 8`',
    '- `le di $30.000 a Agüero para gasoil`',
    '',
    'La registro, le aviso a esa persona para que firme, y sus tickets se rinden contra esa entrega.',
    'Cuánto tiene cada uno se ve en la app, en Compras › Efectivo a rendir: acá no se publica.',
  ].join('\n'),
})

/** El padrón con el que se resuelven nombres y obras. Personas de prueba NO: no existen para la caja. */
export async function padronDeEntregas(port) {
  const personas = await port.query(
    `select id, nombre_completo as nombre from public.personas
      where en_la_empresa and not coalesce(es_prueba, false) order by nombre_completo`)
  const obras = await port.query(
    `select id, codigo, nombre from public.obra_canonica
      where estado = 'activa' and fusionada_en is null order by nombre`)
  return { personas: personas?.rows ?? [], obras: obras?.rows ?? [] }
}

/** El perfil detrás del usuario de Mattermost: con él escribe la base, y con él queda firmada la entrega. */
export async function perfilDeMattermost(port, mmUserId) {
  const r = await port.query(
    `select p.id as perfil_id, p.rol, p.nombre
       from comunicacion.identidades i
       join auth.users u on lower(u.email) = lower(i.email)
       join public.perfiles p on p.id = u.id
      where i.plataforma = 'mattermost' and i.plataforma_user_id = $1 and i.activo
      limit 1`, [String(mmUserId)])
  return r?.rows?.[0] ?? null
}

/** Lo que el bot contesta cuando la entrega quedó registrada. Sin saldos y sin el monto de otras entregas. */
export function textoRegistrada({ codigo, monto, persona, destino }) {
  return [
    `Registrado: **${codigo}** · ${pesos(monto)} · ${persona}`,
    `Destino: ${destino}`,
    '',
    'Le avisé para que firme la conformidad desde su teléfono. Los tickets que mande se rinden contra esta entrega.',
  ].join('\n')
}

export const especialista = {
  slug: 'entregas-efectivo',
  agentSlug: 'compras',
  area: 'compras',
  titulo: 'Efectivo a rendir · entregas',
  descripcion:
    'Registrá la entrega de efectivo escribiéndola: «entregué $250.000 a Rubén Sosa para el galpón 8». '
    + 'Queda firmada a tu nombre, la persona la firma desde el teléfono y sus tickets se rinden contra ella.',
  ejemplos: ['entregué $250.000 a Rubén Sosa para el galpón 8', 'le di $30.000 a Agüero para gasoil'],
  operativo: true,
  // ATIENDE POR RECLAMO, NO POR CANAL: el dueño del área `compras` es el especialista de comprobantes, y un
  // área tiene que resolver a exactamente uno. Acá sólo llega lo que `reconoce` reclama: un texto que dice
  // que se entregó plata.
  preferidoDeArea: false,

  async reconoce(texto, ctx = {}) {
    if (!AREAS_QUE_ENTREGAN.includes(ctx.area)) return null
    // Con adjuntos manda la foto: eso es un comprobante o una rendición, no una entrega escrita.
    if ((ctx.fileIds?.length ?? 0) > 0) return null
    return pareceEntrega(texto) ? { destino: 'entregar', confianza: 1 } : null
  },

  async atender({ texto, intencion, port, actor, log, entregar = registrarEntrega }) {
    const ruta = intencion ?? await this.reconoce(texto, { area: 'compras' })
    if (ruta?.destino !== 'entregar') return { texto: TEXTO.AYUDA, estado: 'ayuda', privado: false }

    // 1. CANAL
    let canal = { ok: false, motivo: 'no_es_el_oficial' }
    for (const area of AREAS_QUE_ENTREGAN) {
      const r = await canalOficialDeArea({ port, channelId: actor?.channel_id, area })
      if (r.ok) { canal = r; break }
      if (r.motivo === 'no_verificable') canal = r
    }
    if (!canal.ok) {
      return { texto: canal.motivo === 'no_verificable' ? TEXTO.NO_VERIFICABLE : TEXTO.CANAL, estado: 'rechazado_canal', privado: false }
    }

    // 2. QUIÉN ESCRIBE
    let yo, padron
    try {
      yo = await perfilDeMattermost(port, actor?.plataforma_user_id)
      padron = await padronDeEntregas(port)
    } catch (e) {
      log?.warn?.('entregas: no pude leer el padrón', { error: String(e?.message ?? e) })
      return { texto: TEXTO.NO_VERIFICABLE, estado: 'rechazado_no_verificable', privado: false }
    }
    if (!yo?.perfil_id) return { texto: TEXTO.SIN_PERSONA, estado: 'rechazado_sin_perfil', privado: false }

    const leido = interpretarEntrega(texto, padron)
    if (leido.estado === 'nada') return { texto: TEXTO.AYUDA, estado: 'ayuda', privado: false }
    if (leido.estado === 'pregunta') {
      return { texto: textoDePregunta(leido), estado: `pregunta_${leido.falta}`, privado: false }
    }

    try {
      const codigo = await entregar({
        perfilId: yo.perfil_id,
        persona: leido.persona.id,
        obra: leido.obra?.id ?? null,
        estructura: !leido.obra,
        monto: leido.monto,
        paraQue: leido.paraQue,
      })
      return {
        texto: textoRegistrada({
          codigo, monto: leido.monto, persona: leido.persona.nombre,
          destino: leido.obra ? leido.obra.nombre : `Estructura · ${leido.paraQue}`,
        }),
        estado: 'entregada',
        privado: false,
      }
    } catch (e) {
      const m = String(e?.message ?? e)
      // 42501 es la puerta de la base: no es un error del bot, es un permiso que falta.
      if (/es de Dirección|logueado|permiso/i.test(m)) {
        return { texto: TEXTO.SIN_PERMISO, estado: 'rechazado_permiso', privado: false }
      }
      log?.error?.('entregas: la base rechazó la entrega', { error: m.slice(0, 200) })
      return { texto: `No pude registrarla: ${m.slice(0, 160)}`, estado: 'error', privado: false }
    }
  },

  skillDe(intencion) {
    return `compras.efectivo.${intencion?.destino === 'entregar' ? 'entregar' : 'ayuda'}`
  },
}

/** La escritura de verdad, COMO la persona que la ordena. Inyectable para que los tests no toquen la base. */
async function registrarEntrega({ perfilId, persona, obra, estructura, monto, paraQue }) {
  return await comoUsuario(perfilId, async (c) => {
    const r = await c.query('select public.entregar_efectivo($1, $2, $3, $4, $5) as codigo',
      [persona, obra, estructura, monto, paraQue])
    return r.rows[0].codigo
  })
}
