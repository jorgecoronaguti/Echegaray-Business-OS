// EL REINTENTO DE LOS FAJOS QUE GOOGLE DEJÓ SIN CARGAR — el barrido que corre en el worker.
//
// ═══ QUÉ HACE Y QUÉ NO ═══
//
// Toma los fajos en `reintento` cuyo turno llegó (`proximo_intento_at <= now()`), los pasa a
// `confirmado` con compare-and-set (dos workers no reintentan el mismo) y los vuelve a escribir con
// EL MISMO `escribirFajo` de siempre: reserva de claves, freno de mano, cargador como proceso hijo
// con su dedup contra la pestaña viva. No hay un segundo camino de escritura: hay un segundo momento.
//
// Después contesta EN EL HILO del post original: «cargué N» si entró, el error si el cargador dijo
// algo que no es pasajero (candado, rótulo, congelado), o «me rendí» cuando se agota el cupo de
// intentos. Si volvió a fallar por Google, `escribirFajo` ya lo dejó programado para más tarde y acá
// no se dice nada: el dueño ya leyó «lo reintento solo» y repetírselo cada minuto sería ruido.
//
// ═══ POR QUÉ VIVE EN EL WORKER DE COMUNICACIÓN Y NO EN EL TIMER DE LA WEB ═══
//
// `echegaray-comprobantes-web.timer` corre cada minuto y hubiera sido cómodo, pero su servicio no
// tiene el token de Mattermost (`worker.env`, sin `MM_*`): podría cargar y no podría avisar, que es
// la mitad del pedido. El worker de comunicación es el único proceso con el pool, el cliente de
// Mattermost y la credencial de Google — igual que el vigía de fajos mudos, y por la misma razón.
//
// Para los fajos que entraron por la PANTALLA (plataforma `web`) no hay hilo: se cierra la fila de
// `public.comprobante_entrada` que quedó `en_espera`, que es lo que la pantalla mira.

import * as repoReal from './repositorio.mjs'
import { escribirFajo } from './escritura.mjs'
import { ESTADO } from '../../lib/comprobantes/fajo.mjs'
import { MAX_INTENTOS_REINTENTO, TEXTO_REINTENTO } from '../../lib/comprobantes/reintento.mjs'

/** Cada cuánto se barre. Un minuto: la primera espera programada es de un minuto. */
export const REINTENTO_INTERVALO_MS_DEFAULT = 60_000

const recorte = (s) => String(s ?? '').trim().slice(0, 200)

/**
 * La fila de la pantalla 24 que quedó `en_espera` por este fajo. Best effort: si no hay tabla o no
 * hay fila, no pasa nada — la verdad del gasto es la pestaña Compras y el registro de claves.
 */
async function cerrarEntradaWeb(port, fajo, r) {
  const cargado = r?.estado === ESTADO.CARGADO
  const estado = cargado ? ((r?.filas ?? []).some((f) => f?.fila != null) ? 'cargado' : 'ya_estaba') : 'error'
  const motivo = cargado ? null : recorte(r?.avisos?.[0] ?? r?.texto ?? 'la carga volvió a fallar')
  await port.query(
    `update public.comprobante_entrada set estado = $2, motivo = $3, procesado_at = now()
      where fajo_id = $1 and estado = 'en_espera'`,
    [fajo.id, estado, motivo])
}

/**
 * Un barrido. Devuelve qué encontró y qué hizo; nunca lanza.
 *
 * @param {object} d {port, publicar?, escribir?, repo?, google?, log?, maxIntentos?, limite?}
 *   `publicar` = ({channelId, rootPostId, texto}) => Promise<{id}|null>   (Mattermost)
 *   `escribir` = (fajo) => Promise<{estado, texto, ...}>                    default: `escribirFajo`
 *   `google`   = cliente o función que lo construye (sólo para el auditor y el espejo)
 */
export async function reintentarFajos(d = {}) {
  const { port, publicar = null, repo = repoReal, log = null, maxIntentos = MAX_INTENTOS_REINTENTO, limite = 5 } = d
  const salida = { encontrados: 0, cargados: 0, reprogramados: 0, rendidos: 0, fallidos: 0, avisados: 0 }
  if (typeof port?.query !== 'function') return salida
  const googleDe = () => (typeof d.google === 'function' ? d.google() : (d.google ?? null))
  const escribir = d.escribir ?? ((f) => escribirFajo({ port, log, repo, google: googleDe() }, f))

  let filas
  try {
    filas = await repo.fajosParaReintentar(port, { limite })
  } catch (e) {
    // Sin la migración (columna `proximo_intento_at` ausente) o con la base caída no se afirma nada.
    log?.warn?.('comprobantes: no pude revisar los fajos en reintento', { detalle: recorte(e?.message) })
    return salida
  }
  salida.encontrados = filas.length
  for (const pendiente of filas) {
    const tomado = await repo.tomarParaReintentar(port, { id: pendiente.id }).catch(() => null)
    if (!tomado) continue
    const n = (tomado.items ?? []).length
    // `intentos` ya cuenta los intentos hechos (el primero fue en línea, al recibir las fotos).
    const intento = (Number(tomado.intentos) || 0) + 1
    let r
    try {
      r = await escribir(tomado)
    } catch (e) {
      // Igual que `cargarSolo`: una excepción no puede perder el fajo. Se reabre con su error.
      await repo.reabrirFajo(port, { id: tomado.id, error: recorte(e?.message ?? e) }).catch(() => {})
      salida.fallidos++
      log?.error?.('comprobantes: el reintento lanzó', { fajo: tomado.id, intento, detalle: recorte(e?.message ?? e) })
      continue
    }

    let texto = null
    if (r?.estado === ESTADO.CARGADO) {
      salida.cargados++
      texto = `${TEXTO_REINTENTO.cargado(intento)}\n${r.texto ?? ''}`.trim()
      log?.info?.('comprobantes: un fajo en reintento se cargó', { fajo: tomado.id, intento, filas: (r.filas ?? []).length })
    } else if (r?.estado === ESTADO.REINTENTO) {
      const hechos = Number(r?.reintento?.intentos) || intento
      if (hechos >= maxIntentos) {
        // Se agotó el cupo: se cierra en `error` desde `reintento` (lo dejó así `escribirFajo`) y se dice.
        const cerrado = await repo.cerrarFajo(port, {
          id: tomado.id, estado: ESTADO.ERROR, desde: ESTADO.REINTENTO,
          error: recorte(`Google no respondió en ${hechos} intentos: ${tomado.error ?? ''}`),
        }).catch(() => null)
        if (cerrado) { salida.rendidos++; texto = TEXTO_REINTENTO.rendido(n, hechos) }
        log?.error?.('comprobantes: me rendí con un fajo en reintento', { fajo: tomado.id, intentos: hechos })
      } else {
        salida.reprogramados++
        log?.warn?.('comprobantes: el reintento volvió a fallar por Google; queda programado', { fajo: tomado.id, intento, proximo: r?.reintento?.proximo ?? null })
      }
    } else {
      // Falló por algo que NO es pasajero (candado, rótulo, congelado…) o quedó encolado: `escribirFajo`
      // ya dejó el fajo como corresponde y armó el texto de siempre. Se publica ese texto.
      salida.fallidos++
      texto = r?.texto ?? null
      log?.error?.('comprobantes: el reintento terminó sin cargar', { fajo: tomado.id, intento, estado: r?.estado ?? null })
    }

    if (!texto) continue
    try {
      if (tomado.plataforma === 'web') {
        await cerrarEntradaWeb(port, tomado, r)
        salida.avisados++
      } else if (typeof publicar === 'function' && tomado.channel_id) {
        const post = await publicar({ channelId: tomado.channel_id, rootPostId: tomado.root_post_id ?? null, texto })
        if (post?.id) salida.avisados++
      }
    } catch (e) {
      log?.error?.('comprobantes: el fajo se resolvió y NO pude avisar en el hilo', { fajo: tomado.id, detalle: recorte(e?.message ?? e) })
    }
  }
  return salida
}

/**
 * El barrido con su propio intervalo, para colgarlo del tick del worker. Mismo patrón que
 * `crearVigiaDeFajosMudos`: no suma a `trabajo` y nunca propaga error.
 */
export function crearReintentoDeFajos({ port, publicar, repo, google, escribir, intervaloMs = REINTENTO_INTERVALO_MS_DEFAULT, log = null, ahora = () => Date.now() } = {}) {
  let proximo = 0
  return async function reintentar() {
    const t = ahora()
    if (t < proximo) return null
    proximo = t + intervaloMs
    try {
      const r = await reintentarFajos({ port, publicar, repo, google, escribir, log })
      if (r.encontrados) log?.info?.('comprobantes: barrido de fajos en reintento', r)
      return r
    } catch (e) {
      log?.warn?.('comprobantes: el reintento de fajos falló', { detalle: recorte(e?.message ?? e) })
      return null
    }
  }
}
