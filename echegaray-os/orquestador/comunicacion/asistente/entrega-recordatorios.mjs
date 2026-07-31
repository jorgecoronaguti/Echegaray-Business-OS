// ENTREGA DE RECORDATORIOS — el paso que se engancha al tick del worker de comunicación.
//
// POR QUÉ ACÁ Y NO EN UN SCHEDULER APARTE. El worker de comunicación ya es el proceso de
// larga duración del canal, ya tiene el pool de la base y es el ÚNICO que tiene el cliente
// de Mattermost. Un proceso nuevo sólo para esto agregaría un systemd más, un lease más y
// otra fuente de "¿está corriendo?" — sin resolver nada que este tick no resuelva.
//
// POR QUÉ CON SU PROPIO INTERVALO. El loop del worker puede girar cada 200 ms cuando hay
// trabajo; buscar recordatorios vencidos veinte veces por segundo es una consulta por gusto.
// Mismo criterio que `crearVencedorPeriodico`: intervalo propio, y NO suma al contador de
// `trabajo` que mantiene el loop en modo busy.
//
// LO QUE ESTE PASO NO PUEDE HACER, NUNCA: voltear el tick. Un recordatorio con un
// destinatario que ya no existe, un DM que no abre o un Mattermost caído no pueden frenar el
// inbox, el Work Fabric ni el outbox del canal entero. Todo error se captura, se registra en
// la entrega y se convierte en reintento o en dead-letter.
//
// EL TEXTO ES CORTO A PROPÓSITO. Lo que llega al DM es lo que la persona pidió recordar, y
// nada más: sin ids, sin JSON, sin trazas. La evidencia técnica va a `recordatorio_entregas`,
// que es donde sirve.

import { ESTADO_ENTREGA, LEASE_SEGUNDOS_DEFAULT, MAX_INTENTOS_DEFAULT, RecordatoriosPostgres, esPropio } from './recordatorios.mjs'
import { ERROR } from './contratos.mjs'

/** Cada cuánto se buscan recordatorios vencidos. Un recordatorio tolera medio minuto de
 *  demora; lo que no tolera es una consulta a la base en cada vuelta del loop. */
export const ENTREGA_INTERVALO_MS_DEFAULT = 30_000

/** Cuántos se entregan por pasada. Acotado para que una avalancha (worker caído toda la
 *  noche) no monopolice el tick: lo que sobra se entrega en la pasada siguiente. */
export const ENTREGA_LOTE_DEFAULT = 20

/**
 * El texto que ve la persona. Dos formas, según quién lo pidió:
 *   propio   → `Recordatorio: cargar saldos.`
 *   cruzado  → `Jorge te recordó: buscar las llaves.`
 * El punto final se normaliza para que el contenido tal como lo dictó la persona
 * ("cargar saldos" / "cargar saldos.") no produzca dos puntos ni ninguno.
 */
export function textoEntrega(rec) {
  const contenido = String(rec?.contenido ?? '').trim().replace(/[.\s]+$/, '')
  if (esPropio(rec)) return `Recordatorio: ${contenido}.`
  const quien = String(rec?.creador_display ?? '').trim() || 'Alguien'
  return `${quien} te recordó: ${contenido}.`
}

/** Registra el fallo de UNA ocurrencia y decide si se reintenta o se abandona. */
async function anotarFallo({ rep, maxIntentos, log }, rec, detalle) {
  await rep.registrarEntrega(rec, {
    programadaPara: rec.proxima_ejecucion, estado: ESTADO_ENTREGA.FALLIDA,
    error: detalle, intento: Number(rec.intentos ?? 0) + 1,
  })
  const r = await rep.marcarFallido(rec, detalle, { maxIntentos })
  if (r?.agotado) {
    // Dead-letter: se dice UNA vez y con nombre propio. Un recordatorio que dejó de sonar
    // sin que nadie se entere es peor que uno que nunca se creó.
    log?.error?.('recordatorio abandonado tras agotar intentos', {
      recordatorio_id: rec.id, destinatario: rec.destinatario_user_id, codigo: ERROR.ENTREGA_MATTERMOST,
    })
  }
  return r
}

/** Entrega UNA ocurrencia. Devuelve 'entregado' | 'fallido' | 'duplicado'. */
async function entregarUno(dep, rec) {
  const { rep, abrirDM, publicar } = dep
  const programadaPara = rec.proxima_ejecucion
  // Barrera preventiva: si el worker anterior publicó y murió antes de reprogramar, el lease
  // vence y esta ocurrencia se vuelve a reclamar. Preguntar ANTES de publicar es lo que evita
  // que la persona reciba el mismo mensaje dos veces.
  if (await rep.yaEntregada(rec.id, programadaPara)) {
    await rep.reprogramar(rec)
    return 'duplicado'
  }
  const canalId = await abrirDM(rec.destinatario_user_id)
  if (!canalId) {
    await anotarFallo(dep, rec, 'no se pudo abrir el DM con el destinatario')
    return 'fallido'
  }
  const post = await publicar({ channelId: canalId, texto: textoEntrega(rec) })
  if (!post || post.ok === false) {
    await anotarFallo(dep, rec, 'Mattermost no aceptó el mensaje')
    return 'fallido'
  }
  const r = await rep.registrarEntrega(rec, {
    programadaPara, estado: ESTADO_ENTREGA.ENTREGADA, canalId,
    postId: post.id ?? post.post_id ?? null, intento: Number(rec.intentos ?? 0) + 1,
  })
  // `duplicado` acá significa que otro camino ya la había registrado como entregada: se
  // reprograma igual (la ocurrencia está saldada), pero no se cuenta dos veces.
  await rep.reprogramar(rec)
  return r.duplicado ? 'duplicado' : 'entregado'
}

/**
 * Arma el paso de entrega para el tick del worker.
 *
 * @param {object} o
 * @param {{query:Function, withTx:Function}} [o.port]  pool del OS (arma el repo de Postgres)
 * @param {object} [o.repo]              repositorio ya construido (tests)
 * @param {(userId:string)=>Promise<string|null>} o.abrirDM  en producción, `canalPrivadoPara`
 * @param {(p:{channelId:string, texto:string})=>Promise<object|null>} o.publicar
 *   Devuelve el post creado (con `id`) o algo falsy / lanza si Mattermost lo rechazó.
 * @param {object} [o.log] @param {()=>number} [o.ahora] @param {string} [o.worker]
 * @returns {() => Promise<{corrio:boolean, entregados:number, fallidos:number}>}
 */
export function crearEntregador({
  port = null, repo = null, abrirDM, publicar, log = null, ahora = () => Date.now(),
  worker = process.env.WORKER_ID ?? 'comm-recordatorios-1',
  intervaloMs = ENTREGA_INTERVALO_MS_DEFAULT, lote = ENTREGA_LOTE_DEFAULT,
  maxIntentos = MAX_INTENTOS_DEFAULT, leaseSegundos = LEASE_SEGUNDOS_DEFAULT,
} = {}) {
  const rep = repo ?? (port ? new RecordatoriosPostgres(port) : null)
  if (!rep) throw new Error('crearEntregador: falta el repositorio (port o repo)')
  if (typeof abrirDM !== 'function') throw new Error('crearEntregador: falta abrirDM')
  if (typeof publicar !== 'function') throw new Error('crearEntregador: falta publicar')
  // Un env mal escrito da NaN, y NaN rompe TODA comparación: sin esta guarda el paso correría
  // en cada vuelta del loop en vez de una vez por intervalo.
  const iv = Number.isFinite(intervaloMs) && intervaloMs >= 0 ? intervaloMs : ENTREGA_INTERVALO_MS_DEFAULT
  const dep = { rep, abrirDM, publicar, maxIntentos, log }
  let proximo = ahora() // la primera pasada entrega: al arrancar puede haber atrasos

  return async function entregarSiCorresponde() {
    const t = ahora()
    if (t < proximo) return { corrio: false, entregados: 0, fallidos: 0 }
    proximo = t + iv // se reprograma ANTES de correr: si falla, no se reintenta en loop
    let entregados = 0
    let fallidos = 0
    try {
      const vencidos = await rep.reclamarVencidos({ worker, limite: lote, ahora: new Date(t), leaseSegundos })
      for (const rec of vencidos) {
        try {
          const r = await entregarUno(dep, rec)
          if (r === 'entregado') entregados++
          else if (r === 'fallido') fallidos++
        } catch (e) {
          // Un recordatorio roto no puede frenar a los que vienen atrás, ni al canal entero.
          fallidos++
          try { await anotarFallo(dep, rec, String(e?.message ?? e)) } catch { /* la base contestará en la próxima pasada */ }
          log?.error?.('entrega de recordatorio falló', { recordatorio_id: rec.id, error: String(e?.message ?? e) })
        }
      }
      if (entregados || fallidos) log?.info?.('recordatorios entregados', { entregados, fallidos })
    } catch (e) {
      log?.error?.('paso de recordatorios falló (se reintenta al próximo intervalo)', { error: String(e?.message ?? e) })
    }
    return { corrio: true, entregados, fallidos }
  }
}
