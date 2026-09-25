// LAS INICIALES EN EL CANAL — lo que el especialista de comprobantes hace antes y después de cargar, y la
// respuesta ESCRITA a «¿Es de Emiliano Maldonado?». El núcleo (qué decidir, qué decir) vive en
// `iniciales.mjs`; acá sólo se cablea con Mattermost y con la base.
//
// SIN INICIALES NO CAMBIA NADA: `inicialesParaLaCarga` lee una vez las personas con iniciales (sin la
// migración, devuelve null y el circuito corre sin gancho) y `cerrarCarga` no mira el fajo si ningún ticket
// del post trajo iniciales.

import {
  aplicarRespuesta, cerrarIniciales, crearPorIniciales, interpretarRespuesta, leerPersonasConIniciales,
  preguntasAbiertas, publicarPreguntas, textoRepregunta,
} from './iniciales.mjs'
import { leerRemitente } from './imputacion-a-entrega.mjs'
import { parteVacia } from '../../lib/comprobantes/parte.mjs'

/** Largo máximo de una respuesta escrita: «si es de emi» lo es; un párrafo es otra conversación. */
const MAX_RESPUESTA = 80

/**
 * El gancho para el circuito, con las personas ya leídas. `null` = no hay nada que mirar (sin migración o
 * sin nadie con iniciales): el circuito corre exactamente como antes.
 */
export async function inicialesParaLaCarga(port, log) {
  if (typeof port?.query !== 'function') return null
  let personas
  try { personas = await leerPersonasConIniciales(port) } catch (e) {
    log?.warn?.('comprobantes: no pude leer las iniciales de las personas; cargo sin mirarlas', { detalle: String(e?.message ?? e).slice(0, 160) })
    return null
  }
  if (!personas.length) return null
  const base = crearPorIniciales(personas)
  const gancho = (item) => {
    const it = base(item)
    if (it?.efectivo) gancho.marcados += 1
    return it
  }
  gancho.marcados = 0
  return gancho
}

/**
 * DESPUÉS DE CARGAR: si algún ticket del post trajo iniciales, registra, vincula, suma los renglones al
 * mensaje de la tanda y publica las preguntas. Devuelve el resultado de la carga con eso agregado.
 */
export async function cerrarCarga({ port, mattermost, log, url, r, post, actor, porIniciales }) {
  if (!porIniciales?.marcados) return r
  try {
    const remitente = await leerRemitente(port, actor?.plataforma_user_id).catch(() => null)
    const rootPostId = actor?.root_post_id ?? post
    const { lineas, preguntas } = await cerrarIniciales(port, {
      fajoId: r?.fajoId ?? null, post, channelId: actor?.channel_id, rootPostId, enviadoPor: remitente?.perfilId ?? null, log,
    })
    if (preguntas.length && typeof mattermost?.crearPost === 'function') {
      await publicarPreguntas({ port, mattermost, log }, preguntas, { channelId: actor?.channel_id, rootPostId, url })
    }
    if (!lineas.length) return r
    const parte = { ...parteVacia(), ...(r?.parte ?? {}) }
    parte.imputaciones = [...(parte.imputaciones ?? []), ...lineas]
    return { ...r, texto: [r?.texto, '', ...lineas].filter((x) => x != null).join('\n'), parte }
  } catch (e) {
    log?.warn?.('comprobantes: la carga salió, pero no pude cerrar las iniciales', { detalle: String(e?.message ?? e).slice(0, 160) })
    const parte = { ...parteVacia(), ...(r?.parte ?? {}) }
    parte.avisos = [...(parte.avisos ?? []), 'No pude revisar las iniciales de quien pagó: si algún ticket era a rendir, imputalo desde la ficha de la entrega.']
    return { ...r, parte }
  }
}

/**
 * ¿Este texto contesta una pregunta de iniciales abierta en ESTE hilo? Falla hacia afuera: sin base, null.
 */
export async function reclamoDeIniciales(texto, ctx = {}) {
  const t = String(texto ?? '').trim()
  if (!t || t.length > MAX_RESPUESTA || (ctx.fileIds?.length ?? 0) > 0) return null
  if (typeof ctx.port?.query !== 'function' || !ctx.actor?.root_post_id) return null
  try {
    const preguntas = await preguntasAbiertas(ctx.port, ctx.actor.root_post_id)
    return preguntas.length ? { destino: 'iniciales', confianza: 1, preguntas } : null
  } catch { return null }
}

/** La respuesta ESCRITA en el hilo. Se contesta siempre: repreguntar es mejor que callar. */
export async function atenderRespuestaIniciales({ port, actor, texto, preguntas, mattermost, log }) {
  if (preguntas.length > 1) {
    return { texto: `Hay ${preguntas.length} preguntas abiertas en este hilo: contestá con los botones de cada una. No imputé nada.`, estado: 'iniciales_varias', privado: false }
  }
  const pregunta = preguntas[0]
  const [personas, remitente] = await Promise.all([
    leerPersonasConIniciales(port),
    leerRemitente(port, actor?.plataforma_user_id).catch(() => null),
  ])
  const respuesta = interpretarRespuesta(texto, { propuestos: pregunta.candidatos ?? [], personas })
  if (respuesta.tipo === 'ambigua') return { texto: textoRepregunta(personas), estado: 'iniciales_repregunta', privado: false }
  const r = await aplicarRespuesta(port, { id: pregunta.id, respuesta, remitente, personas })
  if (r.ok && pregunta.pregunta_post_id && typeof mattermost?.actualizarPost === 'function') {
    await mattermost.actualizarPost({ id: pregunta.pregunta_post_id, message: `✔ ${r.texto}`, props: { attachments: [] } })
      .catch((e) => log?.warn?.('comprobantes: no pude apagar los botones de la pregunta', { detalle: String(e?.message ?? e).slice(0, 120) }))
  }
  return { texto: r.texto, estado: r.ok ? 'iniciales_contestada' : 'iniciales_rechazada', privado: false }
}

/** El botón [Sí] / [No] / [persona] (lo atiende `accion.mjs`, en el servicio de acciones). */
export async function atenderBotonIniciales({ port }, { userId, id, personaId }) {
  const [personas, remitente] = await Promise.all([leerPersonasConIniciales(port), leerRemitente(port, userId).catch(() => null)])
  const respuesta = personaId ? { tipo: 'si', persona: { persona_id: personaId } } : { tipo: 'no' }
  return await aplicarRespuesta(port, { id, respuesta, remitente, personas })
}
