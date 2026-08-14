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
// ═══ NO PREGUNTA, PERO TAMPOCO INVENTA (13/08) ═══
//
// Nunca escribe en el Sheet desde acá: la escritura entera vive en `comprobantes/escritura.mjs`, que
// corre el MISMO cargador que Claude Code. Y desde el 13/08 no hay ningún click en el medio — el
// dueño lo pidió textual: «no quiero q pregunte nada». Un comprobante al que no le falta nada para
// escribirse se escribe, y lo que la foto no dice (la obra, la unidad, la categoría) queda VACÍO en
// la fila y se informa con su número de línea. Lo único que sigue preguntando es lo que no se puede
// resolver después: un proveedor fuera del desplegable, un duplicado probable, un dato ilegible.
//
// Por qué ese límite: un gasto mal cargado se propaga solo a Cash Flow, Proveedores, CAJA y Cheques,
// porque esos cruces son fórmulas abiertas sobre Compras — el error se multiplica por cuatro antes de
// que nadie lo note. Una celda vacía, en cambio, se completa en dos segundos.
//
// ═══ Y HABLA UNA SOLA VEZ (13/08) ═══
//
// «no quiero mensajes del bot en la carga de comprobantes… solo quiero q confirme q termino todo».
// Cada post con fotos es una tarea propia y cada tarea publicaba: doce fotos en tres posts eran tres
// mensajes largos más tres tarjetas con botones. Ahora todo el trabajo corre adentro de `conLaTanda`
// (`comprobantes/tanda.mjs`), que publica UN post al recibir el primer adjunto y lo reescribe hasta
// «✔ listo: 8 cargados, 2 ya estaban». Las tarjetas se apagaron en `botonesFajo`.

import { procesarPost, TEXTO as TEXTO_FLUJO } from '../comprobantes/flujo.mjs'
import { escribirFajo } from '../comprobantes/escritura.mjs'
import { atenderRespuesta } from '../comprobantes/respuesta.mjs'
import { interpretarRespuesta, MAX_LARGO } from '../../lib/comprobantes/respuesta-texto.mjs'
import { leerAdjunto } from '../../lib/comprobantes/vision.mjs'
import { listasDeCompras, proveedoresPorCuit } from '../../lib/comprobantes/listas.mjs'
import { indiceDeCompras } from '../../lib/comprobantes/compras-vivas.mjs'
import { perfilesDeImputacionDesdeDB } from '../../lib/imputacion-aprendida.mjs'
import { urlConSecreto } from '../secreto-compartido.mjs'
import { puedeCargarComprobantes } from '../comprobantes/guarda.mjs'
import { conLaTanda } from '../comprobantes/tanda.mjs'
import * as repo from '../comprobantes/repositorio.mjs'

/** URL de callback de los botones. Distinta de la de asistencia: son dos dominios distintos. */
export const URL_ACCION_BASE = process.env.COMPROBANTES_ACCION_URL
  || 'https://chat.ecsas.com.ar/comprobantes/accion'

/**
 * La URL con el secreto puesto. Un solo lugar la arma, así el servidor no exige algo que los
 * botones no llevan — el defecto que la asistencia ya pagó en producción.
 *
 * ═══ Y ASÍ Y TODO CAYÓ EN ÉL (04/08) ═══
 *
 * El llamador pasaba `config?.env ?? process.env`, y `config.env` NO es el entorno: es el objeto que
 * arma `loadConfig()` con una LISTA BLANCA de claves validadas por Zod, donde
 * `COMPROBANTES_ACCION_SECRETO` no figura. Resultado: el botón se publicaba SIN el `?t=`, y el
 * servidor —que sí exige el secreto— contestaba `secreto_invalido`. En Mattermost eso se ve como
 * "Sorry, we could not find the page" al tocar la obra, que no dice nada de un secreto: mandó el
 * diagnóstico al lado equivocado durante toda una tarde.
 *
 * Un entorno parcial es peor que ninguno: `undefined` cae al `process.env` por el default y funciona;
 * un objeto que existe pero no tiene la clave la resuelve en `null` y firma con nada. Por eso cada
 * clave se busca en el env recibido Y en el del proceso, en ese orden.
 */
export function urlAccion(env = process.env) {
  const de = (k) => env?.[k] || process.env[k] || null
  return urlConSecreto(de('COMPROBANTES_ACCION_URL') || URL_ACCION_BASE, de('COMPROBANTES_ACCION_SECRETO'))
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

/**
 * ¿Este texto es la respuesta a la pregunta que este bot dejó abierta?
 *
 * Cuesta UNA consulta indexada por (plataforma, user, canal, estado) y sólo cuando el mensaje no
 * trae adjuntos y es corto —un nombre de obra lo es; un párrafo es otra conversación—. Sin fajo
 * abierto no hay pregunta abierta y no se reclama nada.
 *
 * FALLA HACIA AFUERA: si la base no contesta, se devuelve null y el mensaje sigue su camino. Un
 * reclamo fabricado sobre una lectura fallida secuestraría el mensaje para no poder atenderlo.
 */
async function reclamoDeRespuesta(texto, ctx = {}) {
  const t = String(texto ?? '').trim()
  if (!t || t.length > MAX_LARGO) return null
  const port = ctx.port
  const userId = ctx.actor?.plataforma_user_id
  const channelId = ctx.actor?.channel_id
  if (typeof port?.query !== 'function' || !userId || !channelId) return null
  try {
    const fajo = await repo.fajoAbierto(port, { plataforma: ctx.actor?.plataforma ?? 'mattermost', userId, channelId })
    if (!fajo) return null
    const respuesta = interpretarRespuesta(fajo, t)
    if (!respuesta) return null
    return { destino: 'responder', confianza: 1, fajo, respuesta }
  } catch { return null }
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

  async reconoce(texto, ctx = {}) {
    // EL PEDIDO ES EL ARCHIVO. Un post con adjuntos en el canal de compras es una carga de
    // comprobantes aunque no traiga una sola palabra.
    if ((ctx.fileIds?.length ?? 0) > 0 && ctx.area === 'compras') {
      return { destino: 'cargar', confianza: 1 }
    }
    const t = plano(texto)
    if (RE_COMO.test(t) || RE_PREGUNTA.test(t)) return { destino: 'ayuda', confianza: 0.4 }

    // ═══ LA RESPUESTA A LO QUE ÉL MISMO DEJÓ ABIERTO (04/08) ═══
    //
    // El mensaje del fajo dice, textual: «Tocá la obra —o escribime otra— y lo cargo». Escribirla no
    // hacía NADA: este especialista reclamaba sólo posts con adjuntos, así que "MESSINA" en el hilo
    // no lo reclamaba nadie y el Director contestaba con el catálogo de capacidades. El bot pedía un
    // dato, la persona lo daba, y el bot cambiaba de tema.
    //
    // SE RECLAMA POCO Y A PROPÓSITO: sólo si hay un fajo ABIERTO de esa persona en ese canal Y el
    // texto se resuelve contra las opciones que ese fajo ofreció. Un texto que no matchea nada
    // devuelve null y sigue su camino intacto — un especialista que se cree dueño de todo le roba
    // mensajes a los demás.
    return await reclamoDeRespuesta(texto, ctx)
  },

  async atender({ texto, intencion, port, actor, google, fileIds = [], postId, mattermost, config, log }) {
    const ruta = intencion ?? await this.reconoce(texto, { fileIds, area: 'compras', port, actor })

    // Una respuesta escrita a la pregunta abierta. No baja archivos, no gasta un token de visión: es
    // aplicar una opción que ya se ofreció.
    if (ruta?.destino === 'responder' && ruta.fajo && ruta.respuesta) {
      // LA PUERTA OTRA VEZ. Que el fajo exista prueba que se pasó cuando se mandó la foto, no que se
      // pase AHORA: un permiso se revoca y un canal se despega del área. Este camino termina
      // escribiendo en Compras, así que se vuelve a preguntar, y falla cerrado.
      const permitido = await puedeCargarComprobantes({
        port, actor: actor ?? {}, channelId: actor?.channel_id,
        plataforma: actor?.plataforma ?? 'mattermost', mattermost,
      })
      if (!permitido.ok) return { texto: permitido.texto, estado: `rechazado_${permitido.motivo}`, privado: false }
      // El escritor NO se inyecta: `confirmarFajo` usa `escribirFajo` por default, que es el mismo
      // que dispara el botón Confirmar y el mismo que corre el cargador de Claude Code. Un camino.
      return await atenderRespuesta({
        port, mattermost, log, url: urlAccion(config?.env ?? process.env),
      }, { fajo: ruta.fajo, respuesta: ruta.respuesta })
    }

    if (!fileIds.length || ruta?.destino === 'ayuda') return ayuda()

    const url = urlAccion(config?.env ?? process.env)
    // ═══ UN SOLO MENSAJE PARA TODA LA TANDA (13/08) ═══
    //
    // Textual: «solo quiero q confirme q termino todo». Cada post con fotos es una tarea distinta y
    // cada tarea publicaba: doce fotos en tres posts eran tres mensajes. `conLaTanda` publica UNO al
    // recibir el primer adjunto y lo REESCRIBE hasta que no queda nada en curso. El trabajo de abajo
    // no cambió una línea; lo que cambió es quién habla y cuántas veces.
    //
    // Sin la migración de tandas aplicada esto no hace nada y se responde como siempre: el deploy y
    // la migración no siempre caen juntos.
    return await conLaTanda({ port, mattermost, log }, {
      plataforma: actor?.plataforma ?? 'mattermost',
      userId: actor?.plataforma_user_id,
      channelId: actor?.channel_id,
      postId: postId ?? actor?.root_post_id ?? null,
      rootPostId: actor?.root_post_id ?? postId ?? null,
      recibidos: fileIds.length,
    }, () => cargar({ texto, port, actor, google, fileIds, postId, mattermost, log, url }))
  },

  skillDe(intencion) {
    return `compras.comprobantes.${intencion?.destino === 'ayuda' ? 'ayuda' : 'cargar'}`
  },
}

/** El trabajo de verdad: bajar, leer, imputar y escribir. Devuelve `{texto, estado, fajoId, parte}`. */
async function cargar({ texto, port, actor, google, fileIds, postId, mattermost, log, url }) {
  const r = await procesarPost({
    port,
    mattermost,
    leer: (adjunto, vocabulario) => leerAdjunto(adjunto, { vocabulario }),
    // LAS LISTAS VIAJAN CON EL MAPA DE CUIT. Sin él, «DUBOS UGARTE PEDRO LUIS RAUL» se declara
    // proveedor nuevo y la carga frena, aunque DUPEC esté en el desplegable con ese mismo CUIT.
    listas: async () => {
      // Y el mapa CUIT → nombres de las OTRAS dos fuentes (`public.proveedores` y el libro fiscal),
      // que es lo que resuelve al proveedor cuyo CUIT no está cargado a mano en la pestaña. Ver
      // `nombresPorCuit`: si la base no contesta, viene vacío y todo se comporta como antes.
      const [l, porCuit, nombresPorCuit] = await Promise.all([
        listasDeCompras(google),
        proveedoresPorCuit(google),
        repo.nombresPorCuit(port).catch(() => new Map()),
      ])
      return { ...l, porCuit, nombresPorCuit }
    },
    // EL PADRÓN DE ARCA es la fuente de verdad del número de comprobante: contra él se corrige el
    // dígito que la visión leyó de más. Se consulta por comprobante, con lo poco que se leyó; qué
    // claves se usan lo decide `arca.mjs`, que es también el que las va a conciliar.
    arcaDe: (c) => repo.candidatasArca(port, c ?? {}),
    // LA PESTAÑA VIVA es la única que sabe lo que entró por Claude Code o a mano. También trae el
    // vocabulario de la columna K con el que se resuelve la obra escrita a mano, y la historia de
    // imputación con la que aprende `imputacion-aprendida.mjs`.
    comprasDe: () => indiceDeCompras(google),
    // EL FEEDER DE RESERVA de esa misma lib: el espejo en Postgres. Se usa sólo si no se pudo leer
    // la pestaña. Es el que ya consume el cargador de Claude Code — la misma lib, otra lectura.
    perfilesDesdeDB: () => perfilesDeImputacionDesdeDB({ query: (...a) => port.query(...a) }),
    // EL ESCRITOR. Es el mismo `escribirFajo` que dispara el botón Confirmar —el que corre el
    // cargador de Claude Code como proceso hijo—: no hay dos caminos de escritura, hay uno solo
    // al que ahora también se llega sin apretar nada.
    // `google` viaja para que al cerrar la carga corra el AUDITOR de descalces registro↔pestaña. Es
    // el mismo cliente que ya se usó para leer las listas y la pestaña viva: el control no paga una
    // autenticación más. Sin este argumento el auditor no se dispara — y "no lo dispara nadie" es
    // exactamente el defecto que se está arreglando.
    escribir: (f) => escribirFajo({ port, log, google }, f),
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

  // ATTACHMENTS NUNCA MÁS. `botonesFajo` los apagó en la fuente (ver `lib/comprobantes/fajo.mjs`),
  // así que `r.attachments` viene vacío por construcción; se descarta acá también para que, si
  // alguien vuelve a encender el interruptor, ese cambio no se cuele por este camino sin querer. El
  // mensaje lo publica la tanda, uno solo y sin tarjeta.
  return { texto: r.texto, estado: r.estado, fajoId: r.fajoId, parte: r.parte, privado: false }
}

function ayuda() {
  return {
    texto: [
      'Soy **Compras IA**. Para cargar un gasto:',
      '',
      '1. Sacá la foto del comprobante (o mandá el PDF) **al canal de comprobantes**. No hace falta que me menciones.',
      '2. Lo leo y lo escribo solo en la pestaña **Compras** del Flujo de Fondos. No te pregunto nada.',
      '3. Te contesto en qué fila quedó, cuánto sumó la tanda y qué te quedó por completar.',
      '',
      'Podés mandar varias fotos juntas, o varios posts seguidos: entra todo.',
      'Si el comprobante no dice a qué obra va, escribila a mano en el papel antes de la foto — o dejala así: '
      + 'cargo igual con la celda vacía y te digo la fila para que la completes. **Nunca invento una obra.**',
      'Sólo te pregunto cuando no puedo resolverlo solo: un proveedor que no está en la lista, un posible '
      + 'duplicado, o un dato que no se lee en la foto.',
      '',
      `_${TEXTO_FLUJO.SIN_ADJUNTOS}_`,
    ].join('\n'),
    estado: 'ayuda',
    privado: false,
  }
}
