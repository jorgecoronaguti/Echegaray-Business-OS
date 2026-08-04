// LOS BOTONES DEL EXTRACTO: Importar · Descartar.
//
// ═══ EL CALLBACK NO TRAE IDENTIDAD ═══
//
// Mattermost publica esta ruta en Internet (vía Caddy) y el payload de una acción interactiva **no
// lleva token**: el `user_id` que llega lo escribe quien llama. Un `curl` anónimo con el user_id de
// alguien habilitado y el channel_id del canal oficial pasaría el control de canal Y el de permisos,
// y quedaría a un paso de escribir movimientos en la base que alimenta CAJA. Ni el canal ni el
// permiso defienden nada si la identidad la pone el atacante.
//
// El secreto viaja en la QUERY de la URL de integración. Mattermost guarda esa URL en su base y no se
// la manda al cliente, así que sólo su servidor puede presentarlo. Se verifica ANTES que nada y falla
// cerrado en los dos sentidos: sin secreto configurado tampoco se atiende.
//
// ═══ IMPORTAR ES UN COMPARE-AND-SET ═══
//
// Dos clicks seguidos, o el mismo click reenviado por un reintento de Mattermost, tienen que cargar
// UNA vez. El estado pasa de `propuesto` a `importando` en una sola sentencia SQL; el segundo click no
// encuentra nada que tomar y contesta que ya se está cargando. Leer-y-después-escribir dejaría la
// ventana abierta justo para el caso que hay que impedir.
//
// LOS IDS DE LOS BOTONES SON SIMPLES (`importar`, `descartar`): un id con guión bajo ya rompió la ruta
// de acciones interactivas en este subsistema.

import { igualEnTiempoConstante } from '../secreto-compartido.mjs'
import { puedeImportarBanco } from './guarda.mjs'
import { importarExtracto } from './importacion.mjs'
import * as repoReal from './repositorio.mjs'

const responder = (body) => ({ status: 200, body })

export const TEXTO = Object.freeze({
  SIN_CONFIGURAR: 'La importación de archivos todavía no está configurada. Avisale a Dirección.',
  NO_AUTORIZADO: 'No pude verificar que este pedido venga de Mattermost.',
  SIN_ARCHIVO: 'Ese archivo ya no está disponible. Volvé a mandarlo.',
  YA_EN_CURSO: 'Ese extracto ya se está cargando. Esperá el resultado.',
  YA_CERRADO: 'Ese extracto ya se cerró.',
  DESCARTADO: '🗑 Descartado. No cargué nada.',
  CARGANDO: '⏳ Cargando los movimientos…',
  INTERNO: 'No pude completar la acción. Probá de nuevo en un minuto.',
})

/** ¿El pedido presenta el secreto? Falla cerrado también cuando NO hay secreto configurado. */
function verificarSecreto(esperado, presentado) {
  if (typeof esperado !== 'string' || !esperado) return { ok: false, detalle: 'secreto_sin_configurar', texto: TEXTO.SIN_CONFIGURAR }
  if (!igualEnTiempoConstante(esperado, presentado)) return { ok: false, detalle: 'secreto_invalido', texto: TEXTO.NO_AUTORIZADO }
  return { ok: true }
}

/** El payload de una acción interactiva, normalizado una sola vez. */
export function normalizar(payload = {}) {
  return {
    userId: payload.user_id ?? null,
    username: payload.user_name ?? null,
    channelId: payload.channel_id ?? null,
    channelType: payload.channel_type ?? null,
    postId: payload.post_id ?? null,
    accion: payload.context?.accion ?? null,
    archivoId: payload.context?.archivo ?? null,
  }
}

/**
 * Crea el manejador de `POST /archivos/accion`.
 *
 * @param {object} o
 * @param {{query:Function}} o.port
 * @param {object} o.mattermost   cliente con `actualizarPost`
 * @param {string} o.secreto      el mismo que va en la query de la URL de los botones
 * @param {Function} [o.importar] inyectable para probar sin tocar la base
 * @param {object} [o.repo]
 * @param {object} [o.log]
 */
export function crearManejadorArchivos({ port, mattermost = null, secreto = null, importar = importarExtracto, repo = repoReal, log = null } = {}) {
  return async function manejar(payload = {}) {
    const p = normalizar(payload)
    const malo = (t) => responder({ ephemeral_text: t })

    // 0) ¿VIENE DE MATTERMOST? Antes de mirar quién dice ser.
    const s = verificarSecreto(secreto, payload._secreto)
    if (!s.ok) {
      log?.warn?.('archivos: acción sin secreto válido', { motivo: s.detalle, ip: payload._ip ?? null })
      return malo(s.texto)
    }

    // 1) LA PUERTA: canal oficial del área + permiso. La misma que se evaluó al mostrar el botón, no
    //    una relajada: entre una cosa y la otra pueden haber sacado a la persona del canal.
    const permitido = await puedeImportarBanco({
      port, actor: { plataforma_user_id: p.userId, channel_type: p.channelType }, channelId: p.channelId, mattermost,
    })
    if (!permitido.ok) {
      log?.info?.('archivos: acción rechazada en la puerta', { motivo: permitido.motivo })
      return malo(permitido.texto)
    }

    try {
      const fila = await repo.porId(port, p.archivoId)
      if (!fila) return malo(TEXTO.SIN_ARCHIVO)

      if (p.accion === 'descartar') {
        if (fila.estado === 'importado') return malo(TEXTO.YA_CERRADO)
        await repo.cerrar(port, fila.id, { estado: 'descartado' })
        await reescribir(mattermost, p.postId, TEXTO.DESCARTADO, log)
        return responder({ update: { message: TEXTO.DESCARTADO, props: { attachments: [] } } })
      }

      if (p.accion !== 'importar') return malo(TEXTO.INTERNO)

      // COMPARE-AND-SET: el segundo click no encuentra nada que tomar.
      const tomada = await repo.tomarParaImportar(port, fila.id)
      if (!tomada) {
        return malo(fila.estado === 'importado' ? TEXTO.YA_CERRADO : TEXTO.YA_EN_CURSO)
      }

      const r = await importar({ port }, tomada)
      if (!r.ok) {
        // La propuesta vuelve a quedar disponible: el dueño tiene que poder corregir y reintentar.
        await repo.devolver(port, fila.id, r.error ?? null)
        await reescribir(mattermost, p.postId, r.texto, log)
        return responder({ update: { message: r.texto, props: { attachments: [] } } })
      }

      await repo.cerrar(port, fila.id, {
        estado: 'importado',
        // SE GUARDA LO RELEÍDO, no el conteo. Meses después, la pregunta "¿qué entró por este
        // archivo?" se contesta con las filas que de verdad quedaron.
        resultado: { insertados: r.insertados, releidos: r.releidos, total: r.total ?? null, cobertura: r.cobertura ?? null },
      })
      await reescribir(mattermost, p.postId, r.texto, log)
      return responder({ update: { message: r.texto, props: { attachments: [] } } })
    } catch (e) {
      log?.error?.('archivos: falló la acción', { detalle: String(e?.message ?? e).slice(0, 200) })
      await repo.devolver(port, p.archivoId, String(e?.message ?? e).slice(0, 200)).catch(() => null)
      return malo(TEXTO.INTERNO)
    }
  }
}

/** Reescribe el mensaje del bot con el resultado. Si no se puede, no rompe: el `update` de la
 *  respuesta ya lleva el mismo texto — son dos caminos al mismo efecto, no uno solo. */
async function reescribir(mattermost, postId, texto, log) {
  if (!postId || typeof mattermost?.actualizarPost !== 'function') return
  try {
    await mattermost.actualizarPost({ id: postId, message: texto, props: { attachments: [] } })
  } catch (e) {
    log?.warn?.('archivos: no pude reescribir el post', { detalle: String(e?.message ?? e).slice(0, 120) })
  }
}
