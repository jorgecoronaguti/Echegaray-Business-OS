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
//   1. CANAL: el oficial del área `rendicion` (el canal Efectivo). Un canal cualquiera no entra.
//   2. QUIÉN: la escritura corre COMO EL PERFIL de quien escribe (`comoUsuario`), así que la base aplica
//      `es_administracion()`. Si quien lo pide no puede entregar, lo rechaza Postgres, no este archivo. Y la
//      entrega queda firmada con su nombre en `entregada_por`, no con el del robot.
import { canalOficialDeArea } from '../../lib/canal-de-area.mjs'
import { comoUsuario } from '../../lib/como-usuario.mjs'
import {
  elegirObra, elegirPersona, interpretarEntrega, leerMonto, leerParaQue, pareceEntrega,
  pareceEntregaSinVerbo, pesos, textoDePregunta,
} from '../../lib/efectivo-entrega-texto.mjs'
import { leerVale } from '../../lib/efectivo-vale-vision.mjs'
import { bajarAdjunto } from '../comprobantes/flujo.mjs'
import { subirAStorage } from '../../lib/storage-supabase.mjs'

export const AREAS_QUE_ENTREGAN = Object.freeze(['rendicion'])

// ═══ LA PREGUNTA QUE QUEDÓ ABIERTA (dueño, 23/09/2026: «no contempla todos los casos») ═══
//
// El bot pregunta «¿a qué obra?» y la persona contesta «galpón 8». Ese segundo mensaje, solo, no es una
// entrega para nadie: caía a la libreta. Acá se guarda, por persona y canal, el texto al que le faltó
// algo, y el mensaje siguiente se lee PEGADO al anterior. Vive en memoria del worker a propósito: son
// diez minutos, y si el proceso se reinicia el bot vuelve a preguntar, que es lo peor que puede pasar.
const PENDIENTE_MIN = 10
const pendientes = new Map()
const claveDe = (actor) => actor?.plataforma_user_id && actor?.channel_id ? `${actor.channel_id}:${actor.plataforma_user_id}` : null
export function pendienteDe(actor, ahora = Date.now()) {
  const k = claveDe(actor)
  const p = k ? pendientes.get(k) : null
  if (!p) return null
  if (ahora - p.en > PENDIENTE_MIN * 60_000) { pendientes.delete(k); return null }
  return p.texto
}
export function recordarPendiente(actor, texto, ahora = Date.now()) {
  const k = claveDe(actor)
  if (!k) return
  if (texto == null) pendientes.delete(k); else pendientes.set(k, { texto, en: ahora })
}

/**
 * LA FOTO DEL VALE (dueño, 22/09/2026: «tb registro mediante multimedia»). Se dispara con lo que ESCRIBE
 * quien manda la foto, no con lo que el modelo crea que ve: en ese canal el 99 % de las fotos son facturas,
 * y mirar cada una con el prompt del vale sería pagar una lectura de más por cada comprobante. Si el texto
 * dice vale/entrega, se mira; y si el papel resulta ser una factura, sigue de largo al circuito de siempre.
 */
export const RE_VALE = /\bvale\b|\bentreg[a-záéíóúñ]*\b|\ble di\b|\bcomprobante de entrega\b/i

export const TEXTO = Object.freeze({
  CANAL: 'El efectivo se entrega desde el canal Efectivo. Escribilo ahí.',
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
    `select id, codigo, nombre, cliente_texto from public.obra_canonica
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

/**
 * LA ENTREGA RECUERDA SU HILO (dueño, 24/09/2026: «todo esto pase en el canal efectivo, en el hilo de cada
 * escritura»). La raíz del hilo del mensaje que la registró queda en `origen_post_id`, y ahí el drenador
 * (`scripts/efectivo-avisos.mjs`) contesta la ida, la firma y la anulación. Se escribe con el puerto del OS,
 * no como el usuario: es un dato del chat, no de la entrega. Si falla, la entrega queda igual: el drenador
 * la rellena desde la respuesta «Registrado» del outbox.
 */
export async function recordarHilo(port, codigo, actor) {
  const hilo = actor?.root_post_id ?? null
  if (!hilo || !codigo) return false
  try {
    await port.query('update public.efectivo_entrega set origen_post_id = $2 where codigo = $1 and origen_post_id is null', [codigo, String(hilo)])
    return true
  } catch { return false }
}

/** Lo que el bot contesta cuando la entrega quedó registrada. Sin saldos y sin el monto de otras entregas. */
export function textoRegistrada({ codigo, monto, persona, destino }) {
  return [
    `Registrado: **${codigo}** · ${pesos(monto)} · ${persona}`,
    `Destino: ${destino}`,
    '',
    'Le avisé para que firme la conformidad desde su teléfono. Los tickets que mande se rinden contra esta entrega.',
    'Lo que pase con esta entrega (el pedido de firma, la firma, una anulación) te lo cuento en este hilo.',
  ].join('\n')
}

/**
 * LA FOTO DEL VALE, DE PUNTA A PUNTA: se lee, se registra la entrega y la MISMA foto queda guardada como la
 * conformidad en papel de esa entrega (`firmar_conformidad_entrega`). El papel firmado es la prueba de que
 * la persona recibió la plata; dejarlo sólo en Mattermost sería dejar la prueba afuera del OS.
 *
 * Devuelve `null` cuando la foto NO es un vale: ahí el comprobante sigue su camino de siempre.
 */
export async function atenderVale(d) {
  const { texto = '', port, actor, mattermost, fileIds = [], log } = d
  if (!fileIds.length || !RE_VALE.test(String(texto))) return null

  // `bajar` es inyectable para que los tests no dependan del cliente de Mattermost.
  const bajado = await (d.bajar ?? bajarAdjunto)(mattermost, fileIds[0]).catch(() => null)
  if (!bajado?.ok) return null
  const leido = await (d.leer ?? leerVale)({ data: bajado.data, mediaType: bajado.mediaType })
  if (!leido.ok) return { texto: `No pude leer el vale: ${leido.error}`, estado: 'error_lectura', privado: false }
  if (!leido.vale.esVale) return null

  const yo = await perfilDeMattermost(port, actor?.plataforma_user_id)
  if (!yo?.perfil_id) return { texto: TEXTO.SIN_PERSONA, estado: 'rechazado_sin_perfil', privado: false }
  const padron = await padronDeEntregas(port)

  // El papel y lo escrito se leen JUNTOS: el vale dice el monto y el nombre, y el mensaje puede decir la obra.
  const v = leido.vale
  const dondeBuscar = `${v.persona ?? ''} ${v.paraQue ?? ''} ${texto}`
  const monto = v.monto ?? leerMonto(texto)
  if (monto == null) return { texto: 'Leí el vale pero no el importe. Escribilo con el signo, por ejemplo $25.000.', estado: 'pregunta_monto', privado: false }
  const quien = elegirPersona(dondeBuscar, padron.personas)
  if (quien.candidatos) return { texto: textoDePregunta({ falta: 'persona_ambigua', candidatos: quien.candidatos }), estado: 'pregunta_persona_ambigua', privado: false }
  if (!quien.persona) return { texto: `Leí «${v.persona ?? 'sin nombre'}» en el vale y no lo encuentro en el padrón. Escribí el apellido como figura en el legajo.`, estado: 'pregunta_persona', privado: false }
  const donde = elegirObra(dondeBuscar, padron.obras)
  if (donde.candidatos) return { texto: textoDePregunta({ falta: 'obra_ambigua', candidatos: donde.candidatos }), estado: 'pregunta_obra_ambigua', privado: false }
  const paraQue = v.paraQue ?? leerParaQue(texto)

  const guardar = d.guardarVale ?? registrarEntregaConVale
  try {
    const { codigo, papel } = await guardar({
      perfilId: yo.perfil_id,
      persona: quien.persona.id,
      obra: donde.obra?.id ?? null,
      estructura: !donde.obra,
      monto,
      paraQue,
      fecha: v.fecha,
      archivo: { data: bajado.data, mediaType: bajado.mediaType, nombre: bajado.nombre },
    })
    await recordarHilo(port, codigo, actor)
    return {
      texto: [
        textoRegistrada({
          codigo, monto, persona: quien.persona.nombre,
          destino: donde.obra ? donde.obra.nombre : paraQue ? `Estructura · ${paraQue}` : 'Estructura (a rendir con los tickets)',
        }),
        papel ? 'Guardé la foto del vale como la conformidad en papel.' : 'No pude guardar la foto: la entrega quedó registrada igual, sin el papel.',
      ].join('\n'),
      estado: 'entregada_con_vale',
      privado: false,
    }
  } catch (e) {
    const m = String(e?.message ?? e)
    if (/es de Dirección|logueado|permiso/i.test(m)) return { texto: TEXTO.SIN_PERMISO, estado: 'rechazado_permiso', privado: false }
    log?.error?.('entregas: el vale no se pudo registrar', { error: m.slice(0, 200) })
    return { texto: `No pude registrarla: ${m.slice(0, 160)}`, estado: 'error', privado: false }
  }
}

export const especialista = {
  slug: 'entregas-efectivo',
  agentSlug: 'compras',
  area: 'rendicion',
  titulo: 'Efectivo a rendir · entregas',
  descripcion:
    'Registrá la entrega de efectivo escribiéndola: «entregué $250.000 a Rubén Sosa para el galpón 8». '
    + 'Queda firmada a tu nombre, la persona la firma desde el teléfono y sus tickets se rinden contra ella.',
  ejemplos: ['entregué $250.000 a Rubén Sosa para el galpón 8', 'le di $30.000 a Agüero para gasoil'],
  operativo: true,
  // ATIENDE POR RECLAMO, NO POR CANAL: el dueño del área `rendicion` es el especialista de rendiciones, y un
  // área tiene que resolver a exactamente uno. Acá sólo llega lo que `reconoce` reclama: un texto que dice
  // que se entregó plata.
  preferidoDeArea: false,

  async reconoce(texto, ctx = {}) {
    if (!AREAS_QUE_ENTREGAN.includes(ctx.area)) return null
    // Con adjuntos manda la foto: eso es un comprobante o una rendición, no una entrega escrita.
    if ((ctx.fileIds?.length ?? 0) > 0) return null
    // LA RESPUESTA A MI PREGUNTA. Si a esta persona, en este canal, le acabo de preguntar algo («¿cuánto?»,
    // «¿a qué obra?»), su próximo mensaje es la respuesta y no una entrega nueva: «galpón 8» solo no lo
    // reconoce nadie, y sin esto caía a la libreta. Se reclama con 0,9: le gana a la libreta y a la
    // sospecha sin verbo, y pierde sólo contra un texto que otro reconozca con certeza total.
    if (pendienteDe(ctx.actor)) return { destino: 'entregar', confianza: 0.9, completa: true }
    if (pareceEntrega(texto)) return { destino: 'entregar', confianza: 1 }
    // SIN VERBO —«100 a jorge para combustible»— es una sospecha, no una certeza: la misma forma puede ser
    // un pago a un proveedor. 0,5 le gana a la red de abajo de la libreta (0,2) y pierde contra cualquiera
    // que reconozca el mensaje de verdad. Quién decide al final es el padrón, en `interpretarEntrega`.
    if (pareceEntregaSinVerbo(texto)) return { destino: 'entregar', confianza: 0.5 }
    return null
  },

  async atender({ texto, intencion, port, actor, log, entregar = registrarEntrega }) {
    const ruta = intencion ?? await this.reconoce(texto, { area: 'rendicion' })
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

    // LA RESPUESTA SE PEGA A LA PREGUNTA. Si quedó algo abierto y este mensaje no es una entrega entera
    // por sí mismo, se lee «lo anterior + esto»: «$100 a jorge» + «para combustible» = la entrega completa.
    const anterior = pendienteDe(actor)
    const solo = interpretarEntrega(texto, padron)
    // Con el verbo escrito de nuevo es una entrega nueva, no la respuesta: se empieza de cero.
    const pegado = anterior && solo.estado !== 'listo' && !pareceEntrega(texto)
      ? interpretarEntrega(`${anterior} ${texto}`, padron) : null
    const leido = pegado && (pegado.estado === 'listo' || solo.estado === 'nada') ? pegado : solo
    const textoLeido = leido === pegado ? `${anterior} ${texto}` : texto
    if (leido.estado === 'nada') return { texto: TEXTO.AYUDA, estado: 'ayuda', privado: false }
    if (leido.estado === 'pregunta') {
      // Lo que falta se pregunta, y el texto queda esperando la respuesta. «varias» no se guarda: son dos.
      recordarPendiente(actor, leido.falta === 'varias' ? null : textoLeido)
      return { texto: textoDePregunta(leido), estado: `pregunta_${leido.falta}`, privado: false }
    }
    recordarPendiente(actor, null)

    try {
      const codigo = await entregar({
        perfilId: yo.perfil_id,
        persona: leido.persona.id,
        obra: leido.obra?.id ?? null,
        estructura: !leido.obra,
        monto: leido.monto,
        paraQue: leido.paraQue,
      })
      await recordarHilo(port, codigo, actor)
      return {
        texto: textoRegistrada({
          codigo, monto: leido.monto, persona: leido.persona.nombre,
          destino: leido.obra ? leido.obra.nombre : leido.paraQue ? `Estructura · ${leido.paraQue}` : 'Estructura (a rendir con los tickets)',
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

/**
 * La entrega CON su papel: se registra, se guarda la foto en el bucket y se ata como conformidad en papel.
 *
 * Si la foto no se puede guardar, la entrega NO se deshace: la plata ya salió y el registro es lo que
 * importa; lo que falta es la prueba, y eso se dice en el mensaje en vez de tirar el registro.
 */
async function registrarEntregaConVale({ perfilId, persona, obra, estructura, monto, paraQue, fecha, archivo }) {
  return await comoUsuario(perfilId, async (c) => {
    const r = await c.query('select public.entregar_efectivo($1, $2, $3, $4, $5, $6) as codigo',
      [persona, obra, estructura, monto, paraQue, fecha])
    const codigo = r.rows[0].codigo
    const id = (await c.query('select id from public.efectivo_entrega where codigo = $1', [codigo])).rows[0].id
    const ext = /png/.test(archivo?.mediaType ?? '') ? 'png' : 'jpg'
    const ruta = `${perfilId}/conformidad/${codigo}.${ext}`
    const subida = await subirAStorage({ bucket: 'comprobantes', path: ruta, data: archivo.data, mediaType: archivo.mediaType })
    if (!subida.ok) return { codigo, papel: false }
    await c.query('select public.firmar_conformidad_entrega($1, null, $2)', [id, ruta])
    return { codigo, papel: true }
  })
}

/** La escritura de verdad, COMO la persona que la ordena. Inyectable para que los tests no toquen la base. */
async function registrarEntrega({ perfilId, persona, obra, estructura, monto, paraQue }) {
  return await comoUsuario(perfilId, async (c) => {
    const r = await c.query('select public.entregar_efectivo($1, $2, $3, $4, $5) as codigo',
      [persona, obra, estructura, monto, paraQue])
    return r.rows[0].codigo
  })
}
