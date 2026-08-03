// LOS BOTONES: Confirmar · Corregir · Descartar.
//
// ═══ EL CALLBACK NO TRAE IDENTIDAD ═══
//
// Mattermost publica esta ruta en Internet (vía Caddy) y el payload de una acción interactiva **no
// lleva token**: el `user_id` que llega lo escribe quien llama. Un `curl` anónimo con el user_id de
// alguien habilitado y el channel_id del canal oficial pasaría el control de canal Y el de permisos,
// y quedaría a un paso de escribir en el Flujo de Fondos. Ni el canal ni el permiso defienden nada
// si la identidad la pone el atacante.
//
// El secreto viaja en la QUERY de la URL de integración. Mattermost guarda esa URL en su base y no
// se la manda al cliente —verificado contra el servidor real: los posts llegan sin el bloque
// `integration`—, así que sólo su servidor puede presentarlo. Se verifica ANTES que nada, y falla
// cerrado en los dos sentidos: sin secreto configurado tampoco se atiende.
//
// ═══ CONFIRMAR ES UN COMPARE-AND-SET ═══
//
// Dos clicks seguidos, o el mismo click reenviado por un reintento de Mattermost, tienen que cargar
// UNA vez. El estado pasa de `abierto` a `confirmado` en una sola sentencia SQL; el segundo click
// no encuentra nada que tomar y contesta que ya se está cargando. Leer-y-después-escribir dejaría la
// ventana abierta justo para el caso que hay que impedir.

import { igualEnTiempoConstante } from '../secreto-compartido.mjs'
import { mensajeFajo, ESTADO, estaCompleto, resolverDuplicado } from '../../lib/comprobantes/fajo.mjs'
import { puedeCargarComprobantes } from './guarda.mjs'
import { dialogoCorreccion, leerEstado, aplicarCorreccion, CALLBACK_ID } from './dialogo.mjs'
import { escribirFajo } from './escritura.mjs'
import * as repoReal from './repositorio.mjs'

const responder = (body) => ({ status: 200, body })

export const TEXTO = Object.freeze({
  SIN_CONFIGURAR: 'La carga de comprobantes todavía no está configurada. Avisale a Dirección.',
  NO_AUTORIZADO: 'No pude verificar que este pedido venga de Mattermost.',
  SIN_FAJO: 'Esa carga ya no está disponible. Volvé a mandar el comprobante.',
  YA_EN_CURSO: 'Esos comprobantes ya se están cargando. Esperá el resultado.',
  YA_CERRADO: 'Esa carga ya se cerró.',
  NADA_QUE_CORREGIR: 'No quedó nada para corregir en esa carga.',
  DUPLICADO_RESUELTO: 'Ese comprobante ya lo contestaste.',
  CARGANDO: '⏳ Cargando en Compras…',
  DESCARTADO: '🗑 Descartado. No cargué nada.',
  INTERNO: 'No pude completar la acción. Probá de nuevo en un minuto.',
})

/** ¿El pedido presenta el secreto? Falla cerrado también cuando NO hay secreto configurado. */
function verificarSecreto(esperado, presentado) {
  if (typeof esperado !== 'string' || !esperado) return { ok: false, detalle: 'secreto_sin_configurar', texto: TEXTO.SIN_CONFIGURAR }
  if (!igualEnTiempoConstante(esperado, presentado)) return { ok: false, detalle: 'secreto_invalido', texto: TEXTO.NO_AUTORIZADO }
  return { ok: true }
}

/** Acción interactiva y envío de diálogo llegan con formas distintas: se normaliza una sola vez. */
export function normalizar(payload = {}) {
  const esDialogo = payload.type === 'dialog_submission' || payload.callback_id === CALLBACK_ID
    || (typeof payload.submission === 'object' && payload.submission !== null)
  return {
    esDialogo,
    userId: payload.user_id ?? null,
    username: payload.user_name ?? null,
    channelId: payload.channel_id ?? null,
    channelType: payload.channel_type ?? null,
    triggerId: payload.trigger_id ?? null,
    postId: payload.post_id ?? null,
    accion: payload.context?.accion ?? null,
    fajoId: payload.context?.fajo_id ?? null,
    indice: Number.isInteger(payload.context?.indice) ? payload.context.indice : null,
    submission: payload.submission ?? null,
    state: payload.state ?? null,
  }
}

/**
 * Crea el manejador de `POST /comprobantes/accion`.
 *
 * @param {object} o
 * @param {{query:Function}} o.port
 * @param {object} o.mattermost   cliente con `abrirDialogo` y `actualizarPost`
 * @param {string} o.secreto      el mismo que va en la query de `url`
 * @param {string} o.url          URL de callback CON el secreto ya puesto
 * @param {Function} [o.obrasDe]  () => string[]  — desplegable estricto de obras (para el formulario)
 * @param {Function} [o.escribir] inyectable para probar sin correr el cargador
 * @param {object} [o.log]
 */
export function crearManejadorComprobantes({ port, mattermost, secreto = null, url = null, obrasDe = null, escribir = escribirFajo, repo = repoReal, log = null } = {}) {
  return async function manejar(payload = {}) {
    const p = normalizar(payload)
    const malo = (t) => responder(p.esDialogo ? { error: t } : { ephemeral_text: t })

    // 0) ¿VIENE DE MATTERMOST? Antes de mirar quién dice ser.
    const s = verificarSecreto(secreto, payload._secreto)
    if (!s.ok) {
      log?.warn?.('comprobantes: acción sin secreto válido', { motivo: s.detalle, ip: payload._ip ?? null })
      return malo(s.texto)
    }

    // 1) LA PUERTA: canal oficial + grant. La misma que la ingesta, no una versión relajada.
    const permitido = await puedeCargarComprobantes({
      port, actor: { plataforma_user_id: p.userId, channel_type: p.channelType }, channelId: p.channelId,
    })
    if (!permitido.ok) {
      log?.info?.('comprobantes: acción rechazada en la puerta', { motivo: permitido.motivo, detalle: permitido.detalle })
      return malo(permitido.texto)
    }

    try {
      if (p.esDialogo) return await guardarCorreccion({ port, mattermost, url, obrasDe, repo, log }, p)
      if (p.accion === 'confirmar') return await confirmar({ port, mattermost, url, escribir, repo, log }, p)
      if (p.accion === 'corregir') return await corregir({ port, mattermost, url, obrasDe, repo, log }, p)
      if (p.accion === 'duplicado_mismo' || p.accion === 'duplicado_otro') {
        return await contestarDuplicado({ port, mattermost, url, repo, log }, p)
      }
      if (p.accion === 'descartar') return await descartar({ port, mattermost, url, repo, log }, p)
      return malo('No entendí ese botón.')
    } catch (e) {
      log?.error?.('comprobantes: fallo atendiendo una acción', { detalle: String(e?.message ?? e).slice(0, 200) })
      return malo(TEXTO.INTERNO)
    }
  }
}

// ── Confirmar ────────────────────────────────────────────────────────────────

async function confirmar(d, p) {
  const { port, mattermost, escribir, repo, log } = d
  // COMPARE-AND-SET. Si no devuelve fila, o el fajo no existe o ya lo tomó otro click.
  const fajo = await repo.tomarParaConfirmar(port, { id: p.fajoId })
  if (!fajo) {
    const actual = await repo.fajoPorId(port, p.fajoId)
    if (!actual) return responder({ ephemeral_text: TEXTO.SIN_FAJO })
    return responder({ ephemeral_text: actual.estado === ESTADO.CONFIRMADO ? TEXTO.YA_EN_CURSO : TEXTO.YA_CERRADO })
  }

  // El post se reescribe a "cargando" ANTES de arrancar: la escritura tarda y el silencio de un bot
  // se lee como un bot colgado. Que falle este refresco no puede tumbar la carga.
  await refrescar(mattermost, fajo, { message: `${TEXTO.CARGANDO}\n\n${resumenPlano(fajo)}`, attachments: [] }, log)

  const r = await escribir({ port, repo, log }, fajo)
  await refrescar(mattermost, fajo, { message: r.texto, attachments: [] }, log)
  return responder({ ephemeral_text: r.estado === ESTADO.CARGADO ? '✔ Cargado.' : r.texto })
}

// ── Corregir ─────────────────────────────────────────────────────────────────

async function corregir(d, p) {
  const { port, mattermost, url, obrasDe, repo, log } = d
  const fajo = await repo.fajoPorId(port, p.fajoId)
  if (!fajo) return responder({ ephemeral_text: TEXTO.SIN_FAJO })
  if (fajo.estado !== ESTADO.ABIERTO) return responder({ ephemeral_text: TEXTO.YA_CERRADO })

  const indice = indiceACorregir(fajo.items ?? [])
  if (indice < 0) return responder({ ephemeral_text: TEXTO.NADA_QUE_CORREGIR })

  const obras = typeof obrasDe === 'function' ? await obrasDe().catch(() => []) : []
  const dlg = dialogoCorreccion({ fajo, indice, obras, url })
  // El `trigger_id` VENCE EN SEGUNDOS: se abre el diálogo sin hacer trabajo lento antes.
  if (!p.triggerId || typeof mattermost?.abrirDialogo !== 'function') {
    return responder({ ephemeral_text: 'No pude abrir el formulario. Probá de nuevo.' })
  }
  try {
    await mattermost.abrirDialogo({ trigger_id: p.triggerId, url: dlg.url, dialog: dlg.dialog })
  } catch (e) {
    log?.error?.('comprobantes: no pude abrir el diálogo', { detalle: String(e?.message ?? e).slice(0, 200) })
    return responder({ ephemeral_text: 'No pude abrir el formulario. Probá de nuevo.' })
  }
  return responder({})
}

/** El primero que tenga algo que corregir; si están todos completos, el primero a secas. */
export function indiceACorregir(items = []) {
  if (!items.length) return -1
  const i = items.findIndex((it) => !it.yaCargado && !estaCompleto(it))
  if (i >= 0) return i
  const j = items.findIndex((it) => !it.yaCargado)
  return j
}

async function guardarCorreccion(d, p) {
  const { port, mattermost, url, obrasDe, repo, log } = d
  const st = leerEstado(p.state)
  if (!st) return responder({ error: TEXTO.SIN_FAJO })
  const fajo = await repo.fajoPorId(port, st.fajoId)
  if (!fajo) return responder({ error: TEXTO.SIN_FAJO })
  if (fajo.estado !== ESTADO.ABIERTO) return responder({ error: TEXTO.YA_CERRADO })

  const items = [...(fajo.items ?? [])]
  const item = items[st.indice]
  if (!item) return responder({ error: TEXTO.SIN_FAJO })

  const obras = typeof obrasDe === 'function' ? await obrasDe().catch(() => []) : []
  const r = aplicarCorreccion(item, p.submission ?? {}, { obras })
  if (!r.ok) return responder({ errors: r.errors })
  items[st.indice] = r.item

  // Corregir el número o el proveedor CAMBIA la clave: hay que volver a preguntar si ese comprobante
  // ya estaba cargado. Sin esto, arreglar un número mal leído sería la forma de esquivar la
  // idempotencia sin querer.
  delete items[st.indice].yaCargado
  const { marcarYaCargados } = await import('./flujo.mjs')
  await marcarYaCargados(port, [items[st.indice]], repo)

  const guardado = await repo.guardarItems(port, { id: fajo.id, items })
  if (!guardado) return responder({ error: TEXTO.YA_CERRADO })
  await refrescar(mattermost, guardado, mensajeMattermost(guardado, url), log)
  return responder({})
}

// ── El probable duplicado ────────────────────────────────────────────────────
//
// Los dos botones son la única salida de un ítem con `posibleDuplicado`: mientras no se conteste,
// `estaCompleto` es false y "Confirmar" ni siquiera aparece. Es a propósito — el estado por defecto
// de una duda sobre un duplicado tiene que ser "no se carga".

async function contestarDuplicado(d, p) {
  const { port, mattermost, url, repo, log } = d
  const fajo = await repo.fajoPorId(port, p.fajoId)
  if (!fajo) return responder({ ephemeral_text: TEXTO.SIN_FAJO })
  if (fajo.estado !== ESTADO.ABIERTO) return responder({ ephemeral_text: TEXTO.YA_CERRADO })

  const respuesta = p.accion === 'duplicado_mismo' ? 'mismo' : 'otro'
  const items = resolverDuplicado(fajo.items ?? [], p.indice ?? -1, respuesta)
  // Sin ítems nuevos: o el índice no existe, o alguien ya lo contestó (dos clicks, o el reintento de
  // Mattermost). Se contesta que ya está resuelto en vez de reescribir el post por nada.
  if (!items) return responder({ ephemeral_text: TEXTO.DUPLICADO_RESUELTO })

  const guardado = await repo.guardarItems(port, { id: fajo.id, items })
  if (!guardado) return responder({ ephemeral_text: TEXTO.YA_CERRADO })
  await refrescar(mattermost, guardado, mensajeMattermost(guardado, url), log)
  log?.info?.('comprobantes: duplicado contestado', { fajo: fajo.id, indice: p.indice, respuesta })
  return responder({ ephemeral_text: respuesta === 'mismo' ? 'Anotado: no lo cargo.' : 'Anotado: es otro comprobante.' })
}

// ── Descartar ────────────────────────────────────────────────────────────────

async function descartar(d, p) {
  const { port, mattermost, repo, log } = d
  const fajo = await repo.fajoPorId(port, p.fajoId)
  if (!fajo) return responder({ ephemeral_text: TEXTO.SIN_FAJO })
  if (fajo.estado !== ESTADO.ABIERTO) return responder({ ephemeral_text: TEXTO.YA_CERRADO })
  const cerrado = await repo.cerrarFajo(port, { id: fajo.id, estado: ESTADO.DESCARTADO })
  await refrescar(mattermost, cerrado ?? fajo, { message: TEXTO.DESCARTADO, attachments: [] }, log)
  return responder({ ephemeral_text: TEXTO.DESCARTADO })
}

// ── Salida a Mattermost ──────────────────────────────────────────────────────

/** El mensaje del fajo tal como se publica: texto + botones dentro de `props.attachments`. */
export function mensajeMattermost(fajo, url) {
  const m = mensajeFajo(fajo, { url })
  return { message: m.texto, attachments: m.attachments }
}

/**
 * Reescribe el post del bot. NUNCA tumba la acción: si falla, se avisa por log y el post queda como
 * estaba — una carga no se pierde porque no se pudo redibujar un mensaje.
 */
async function refrescar(mattermost, fajo, { message, attachments }, log) {
  const id = fajo?.aviso_post_id
  if (!id || typeof mattermost?.actualizarPost !== 'function') return false
  try {
    await mattermost.actualizarPost({ id, message, props: { attachments: attachments ?? [] } })
    return true
  } catch (e) {
    log?.warn?.('comprobantes: no pude actualizar el post', { detalle: String(e?.message ?? e).slice(0, 200) })
    return false
  }
}

/** El resumen sin botones, para el estado intermedio "cargando". */
function resumenPlano(fajo) {
  return mensajeFajo(fajo, {}).texto
}
