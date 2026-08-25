// EL FAJO MUDO GRITA — el control que faltaba, disparado por el propio worker.
//
// ═══ POR QUÉ EXISTE (25/08) ═══
//
// Un fajo que queda `abierto` esperando una respuesta que nunca se publicó es invisible para TODOS
// los controles a la vez: no tiene `error` (así que no hay dead-letter), no tiene `aviso_post_id`
// (así que no hay mensaje en el canal), y no tiene fila en Compras (así que el auditor de descalces
// tampoco lo ve). El fajo `de1c9a7a` estuvo así con $304.515,98 adentro y la única alarma fue el
// dueño diciendo que el bot «se clavó».
//
// ═══ QUÉ HACE, Y POR QUÉ NO ES UN AVISO GENÉRICO ═══
//
// Publica LA PREGUNTA QUE FALTÓ, en el canal y el hilo del fajo. Un «tenés una carga trabada» obliga
// a ir a buscar qué era; la pregunta se contesta ahí mismo con una palabra. Después guarda el
// `aviso_post_id`, que es lo que impide que esto se convierta en un recordatorio cada cinco minutos.
//
// ═══ POR QUÉ EN EL WORKER Y NO SÓLO EN EL TIMER DIARIO ═══
//
// Porque un comprobante trabado a las 15:20 no puede esperar al vigía de las 07:30 del día
// siguiente. El timer diario sigue haciendo falta —el worker puede estar caído, que es justo cuando
// más fajos quedan a medio camino— pero el que salva la conversación es éste.

import { fajosMudos, MINUTOS_MUDO } from '../../lib/comprobantes/vigilancia.mjs'
import { textoPregunta } from '../../lib/comprobantes/mensaje.mjs'
import * as repoReal from './repositorio.mjs'

/** Cada cuánto se barre. Cinco minutos: dos ticks de holgura sobre los ~2m30s que tarda un post. */
export const VIGIA_INTERVALO_MS_DEFAULT = 5 * 60_000

/**
 * El texto con el que se rompe el silencio. Si el fajo tiene algo que preguntar, se pregunta; si no,
 * se dice que quedó trabado y qué hay adentro — nunca se calla y nunca se inventa un motivo.
 */
export function avisoDeFajo(fajo, mudo) {
  const p = textoPregunta(fajo)
  if (p?.texto) return `${p.texto}\n\n_(Se me había quedado sin contestar hace ${mudo.minutos} minutos.)_`
  const n = mudo.comprobantes
  return `⚠ Tengo **${n} ${n === 1 ? 'comprobante' : 'comprobantes'}** de tu carga sin terminar de registrar `
    + `hace ${mudo.minutos} minutos y no supe qué hacer con ${n === 1 ? 'él' : 'ellos'}. `
    + 'Mandámelos de nuevo, o escribime **«descartalo»** si ya no van.'
}

/**
 * Un barrido. Devuelve qué encontró y qué pudo avisar; nunca lanza.
 *
 * @param {object} d {port, publicar, repo?, log?, minutos?}
 *   `publicar` = ({channelId, rootPostId, texto}) => Promise<{id}|null>
 */
export async function barrerFajosMudos(d = {}) {
  const { port, publicar, repo = repoReal, log = null, minutos = MINUTOS_MUDO } = d
  const salida = { encontrados: 0, avisados: 0, sinAvisar: 0 }
  if (typeof port?.query !== 'function' || typeof publicar !== 'function') return salida
  let filas
  try {
    filas = await repo.fajosSinAviso(port, { minutos })
  } catch (e) {
    // Sin la tabla (antes de la migración) o con la base caída no se afirma nada: no poder mirar no
    // es haber mirado, y un vigía que se cae no puede tumbar el worker.
    log?.warn?.('comprobantes: no pude revisar los fajos mudos', { detalle: String(e?.message ?? e).slice(0, 200) })
    return salida
  }
  const mudos = fajosMudos(filas, { minutos })
  salida.encontrados = mudos.length
  if (!mudos.length) return salida

  const porId = new Map(filas.map((f) => [f.id, f]))
  for (const m of mudos) {
    const fajo = porId.get(m.id)
    if (!fajo?.channel_id) { salida.sinAvisar++; continue }
    try {
      const post = await publicar({ channelId: fajo.channel_id, rootPostId: fajo.root_post_id ?? null, texto: avisoDeFajo(fajo, m) })
      if (!post?.id) { salida.sinAvisar++; continue }
      // EL AVISO SE GUARDA ANTES DE CANTAR VICTORIA: es lo único que impide repetirlo cada barrido.
      await repo.guardarAvisoPost(port, { id: fajo.id, avisoPostId: post.id })
      salida.avisados++
      log?.error?.('comprobantes: un fajo quedó mudo y se avisó', {
        fajo: fajo.id, minutos: m.minutos, comprobantes: m.comprobantes, suma: m.suma,
      })
    } catch (e) {
      salida.sinAvisar++
      log?.error?.('comprobantes: un fajo quedó mudo y NO pude avisar', {
        fajo: fajo.id, minutos: m.minutos, detalle: String(e?.message ?? e).slice(0, 200),
      })
    }
  }
  return salida
}

/**
 * El barrido con su propio intervalo, para colgarlo del tick del worker.
 *
 * Mismo patrón que `crearVencedorPeriodico`: no suma a `trabajo` (este loop gira cada 200 ms) y
 * nunca propaga error — un vigía roto no puede voltear el canal.
 */
export function crearVigiaDeFajosMudos({ port, publicar, repo, intervaloMs = VIGIA_INTERVALO_MS_DEFAULT, log = null, ahora = () => Date.now() } = {}) {
  let proximo = 0
  return async function vigilar() {
    const t = ahora()
    if (t < proximo) return null
    proximo = t + intervaloMs
    try {
      const r = await barrerFajosMudos({ port, publicar, repo, log })
      if (r.encontrados) log?.info?.('comprobantes: barrido de fajos mudos', r)
      return r
    } catch (e) {
      log?.warn?.('comprobantes: el vigía de fajos mudos falló', { detalle: String(e?.message ?? e).slice(0, 200) })
      return null
    }
  }
}
