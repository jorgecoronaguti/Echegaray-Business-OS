// COMPRAS IA — el que recibe la foto de una factura y la convierte en una fila de "Compras".
//
// ═══ EL PEDIDO, TEXTUAL ═══
//
// "quiero que en mattermost el canal `comprobantes-gastos` sirva para que podamos enviar los
// comprobantes de compras por medio de archivos multimedia, que el os los procese y los cargue de
// manera directa al sheet de flujo de fondos en pestaña compras, de manera perfecta".
//
// ═══ QUÉ RECLAMA, Y POR QUÉ ASÍ ═══
//
// Reclama poco y a propósito: **un post con ADJUNTOS en el canal de comprobantes**. No una palabra,
// no un verbo: el archivo. Es el único especialista cuyo pedido más común no tiene texto —el dueño
// saca la foto y la manda— y por eso su gramática mira `fileIds` antes que el mensaje.
//
// Lo que NO reclama: cualquier mensaje del canal. Escribir "che, ¿cuánto le debemos a Cemento SA?"
// en el canal de comprobantes no es cargar un comprobante, y robarle ese mensaje a los demás
// especialistas sería exactamente el defecto que este subsistema ya documentó: un especialista que
// se cree dueño de todo. Un mensaje así puede llegar igual por ÁREA —es el único especialista de
// `compras`, y un área con especialistas tiene que resolver a exactamente uno o su canal se queda
// sin dueño—, pero llegar por área no dispara ningún trabajo: se contesta qué se sabe hacer.
//
// ═══ NO CARGA A CIEGAS ═══
//
// Nunca escribe en el Sheet desde acá. Lee, muestra lo que entendió y espera un **Confirmar**. Un
// gasto mal cargado se propaga solo a Cash Flow, Proveedores, CAJA y Cheques, porque esos cruces son
// fórmulas abiertas sobre Compras: el error se multiplica por cuatro antes de que nadie lo note.

import { procesarPost, TEXTO as TEXTO_FLUJO } from '../comprobantes/flujo.mjs'
import { leerAdjunto } from '../../lib/comprobantes/vision.mjs'
import { listasDeCompras } from '../../lib/comprobantes/listas.mjs'
import { indiceDeCompras } from '../../lib/comprobantes/compras-vivas.mjs'
import { caeCanonico, soloDigitos } from '../../lib/comprobantes/lectura.mjs'
import { fechaIsoDeComprobante } from '../../lib/comprobantes/arca.mjs'
import { urlConSecreto } from '../secreto-compartido.mjs'
import * as repo from '../comprobantes/repositorio.mjs'

/** URL de callback de los botones. Distinta de la de asistencia: son dos dominios distintos. */
export const URL_ACCION_BASE = process.env.COMPROBANTES_ACCION_URL
  || 'https://chat.ecsas.com.ar/comprobantes/accion'

/** La URL con el secreto puesto. Un solo lugar la arma, así el servidor no exige algo que los
 *  botones no llevan — el defecto que la asistencia ya pagó en producción. */
export function urlAccion(env = process.env) {
  return urlConSecreto(env.COMPROBANTES_ACCION_URL || URL_ACCION_BASE, env.COMPROBANTES_ACCION_SECRETO || null)
}

/**
 * Palabras con las que alguien pregunta por esto SIN mandar un archivo.
 *
 * Se comparan contra el texto SIN ACENTOS. En JS el `\b` es ASCII: `/\bcomo\b/` NO matchea "cómo", y
 * "cómo cargo un comprobante" —la forma más natural de la pregunta— caía afuera. Es la misma trampa
 * que este repo ya pagó en el ruteo del chat; por eso se normaliza y se usan RAÍCES de verbo, no
 * infinitivos: nadie escribe "cargar", escriben "cargá", "cargo", "subo".
 */
const RE_PREGUNTA = /\b(comprobante|factura|remito|ticket)s?\b[^.]{0,40}\b(carg|sub|mand|envi|pas)/i
const RE_COMO = /\bcomo\s+(carg|sub|mand|envi|pas)[a-z]*\b[^.]{0,30}\b(comprobante|factura|gasto|ticket)/i

/** Minúsculas y sin acentos. Lo mismo que hace el intérprete del asistente. */
function plano(texto) {
  return String(texto ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

export const especialista = {
  slug: 'comprobantes',
  agentSlug: 'compras',
  area: 'compras',
  titulo: 'Compras IA · comprobantes',
  descripcion:
    'Cargá un gasto mandando la foto o el PDF del comprobante al canal de comprobantes. Lee proveedor, '
    + 'CUIT, tipo y número, fecha, neto, IVA discriminado, percepciones y total; te muestra lo que entendió '
    + 'y, con tu confirmación, lo escribe en la pestaña Compras del Flujo de Fondos. Nunca carga a ciegas '
    + 'y nunca carga dos veces el mismo comprobante.',
  ejemplos: [
    '(mandá la foto de la factura al canal de comprobantes)',
    'cómo cargo un comprobante',
  ],
  operativo: true,

  // ATIENDE POR RECLAMO, NO POR CANAL. El área `compras` no tiene otro especialista hoy, así que
  // este queda como preferido: un área con especialistas debe resolver a exactamente uno, y dejarla
  // sin dueño hace que todo lo que nadie reclame caiga al catálogo. Aceptar el canal no le cuesta
  // nada porque `atender` sin adjuntos no dispara ningún trabajo: contesta qué sabe hacer.
  preferidoDeArea: true,

  reconoce(texto, ctx = {}) {
    // EL PEDIDO ES EL ARCHIVO. Un post con adjuntos en el canal de compras es una carga de
    // comprobantes aunque no traiga una sola palabra.
    if ((ctx.fileIds?.length ?? 0) > 0 && ctx.area === 'compras') {
      return { destino: 'cargar', confianza: 1 }
    }
    const t = plano(texto)
    if (RE_COMO.test(t) || RE_PREGUNTA.test(t)) return { destino: 'ayuda', confianza: 0.4 }
    return null
  },

  async atender({ texto, intencion, port, actor, google, fileIds = [], postId, mattermost, config, log }) {
    const ruta = intencion ?? this.reconoce(texto, { fileIds, area: 'compras' })

    if (!fileIds.length || ruta?.destino === 'ayuda') return ayuda()

    const url = urlAccion(config?.env ?? process.env)
    const r = await procesarPost({
      port,
      mattermost,
      leer: (adjunto) => leerAdjunto(adjunto),
      listas: () => listasDeCompras(google),
      // EL PADRÓN DE ARCA es la fuente de verdad del número de comprobante: contra él se corrige el
      // dígito que la visión leyó de más. Se consulta por comprobante, con lo poco que se leyó.
      arcaDe: (c) => repo.candidatasArca(port, {
        cae: caeCanonico(c?.cae),
        cuit: soloDigitos(c?.cuit).length === 11 ? soloDigitos(c.cuit) : null,
        fechaIso: fechaIsoDeComprobante(c?.fecha),
      }),
      // LA PESTAÑA VIVA es la única que sabe lo que entró por Claude Code o a mano. También trae el
      // vocabulario de la columna K con el que se resuelve la obra escrita a mano.
      comprasDe: () => indiceDeCompras(google),
      url,
      log,
    }, {
      fileIds,
      // Lo que la persona escribió al mandar la foto. Es de donde sale la obra cuando el papel no
      // la dice, que es el caso normal: una factura de proveedor no sabe a qué obra se imputa.
      texto,
      actor,
      channelId: actor?.channel_id,
      rootPostId: actor?.root_post_id ?? postId ?? null,
      postId: actor?.root_post_id ?? postId ?? null,
      ahora: new Date(),
    })

    // Sin botones no hay nada que reescribir: se responde por el camino normal (el outbox).
    if (!r.attachments?.length || !r.fajoId) {
      return { texto: r.texto, estado: r.estado, privado: false }
    }

    // CON BOTONES: se publica ACÁ para quedarse con el id del post. Ese id es lo que después
    // permite reescribir el mismo mensaje —"⏳ cargando" → "✔ fila 412"— en vez de dejar una
    // cascada de mensajes que crece hacia abajo. El outbox devuelve un evento, no un post.
    const publicado = await publicar(mattermost, {
      channelId: actor?.channel_id,
      rootId: actor?.root_post_id ?? postId ?? null,
      texto: r.texto,
      attachments: r.attachments,
    })
    if (!publicado) {
      // Degradación honesta: si no se pudo publicar directo, sale por el camino normal. Los botones
      // siguen funcionando; lo único que se pierde es que el mensaje se refresque solo.
      return { texto: r.texto, attachments: r.attachments, estado: r.estado, privado: false }
    }
    await repo.guardarAvisoPost(port, { id: r.fajoId, avisoPostId: publicado.id }).catch(() => {})
    return { texto: r.texto, estado: r.estado, privado: false, silencioso: true, datos: { fajo: r.fajoId, post: publicado.id } }
  },

  skillDe(intencion) {
    return `compras.comprobantes.${intencion?.destino === 'ayuda' ? 'ayuda' : 'cargar'}`
  },
}

async function publicar(mattermost, { channelId, rootId, texto, attachments }) {
  if (typeof mattermost?.crearPost !== 'function' || !channelId) return null
  try {
    return await mattermost.crearPost({
      channel_id: channelId,
      message: texto,
      root_id: rootId ?? undefined,
      props: { attachments },
    })
  } catch { return null }
}

function ayuda() {
  return {
    texto: [
      'Soy **Compras IA**. Para cargar un gasto:',
      '',
      '1. Sacá la foto del comprobante (o mandá el PDF) **al canal de comprobantes**. No hace falta que me menciones.',
      '2. Te muestro lo que leí: proveedor, comprobante, fecha, IVA y total.',
      '3. Si está bien, apretás **Confirmar** y lo escribo en la pestaña **Compras** del Flujo de Fondos.',
      '',
      'Podés mandar varias fotos juntas: las agrupo y las confirmás de una vez.',
      'Si el comprobante no dice a qué obra va, escribila a mano en el papel antes de la foto o corregila desde **Corregir**.',
      '',
      `_${TEXTO_FLUJO.SIN_ADJUNTOS}_`,
    ].join('\n'),
    estado: 'ayuda',
    privado: false,
  }
}
