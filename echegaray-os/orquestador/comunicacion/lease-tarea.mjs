// EL LEASE DE UNA TAREA QUE TARDA MINUTOS — NÚCLEO PURO, CERO SQL Y CERO RED.
//
// ═══ EL DEFECTO QUE ARREGLA (13/08, medido en producción) ═══
//
// El dueño mandó ocho comprobantes al canal. El worker de comunicación claimó la tarea con un lease
// de **30 segundos** y arrancó el handler, que baja ocho archivos y hace ocho lecturas de visión: dos
// minutos y medio. Nadie extendía el lease. Entonces:
//
//   19:27:02  comunicacion.responder: ejecutando   task_id=fcb3a2eb
//   19:29:35  comunicacion: el especialista publicó por su cuenta      ← el trabajo SE HIZO
//   19:29:36  ERROR work-fabric comm falló  error="transición inválida retrying -> reviewing"
//   19:29:37  comunicacion.responder: ejecutando   task_id=fcb3a2eb   ← LA MISMA TAREA otra vez
//   19:33:17  comunicacion: el especialista publicó por su cuenta      ← y publica DE NUEVO
//
// La cadena completa, que no se ve en ninguna línea sola:
//
//   1. `claim_task` pone `lease_expires_at = now() + 30s` y estado `claimed`.
//   2. El handler tarda 150 s. A los 30 s el lease vence.
//   3. `reap_expired_leases` ve una tarea `running` con lease vencido, cree que el worker murió y la
//      manda a **`retrying` con `run_after = now()`** — o sea, elegible YA.
//   4. El handler termina y publica. El worker intenta `running -> reviewing`, pero el estado ya no
//      es `running`: es `retrying`, y esa transición NO EXISTE en `orq.task_transitions`. Excepción.
//   5. El `catch` llamaba a `failTask`, que vuelve a dejarla `retrying` con backoff de 1 s.
//   6. `claim_task` la vuelve a tomar (incrementando `attempt`) y **todo el trabajo se rehace**:
//      se vuelven a bajar los adjuntos, se vuelve a pagar la visión y se vuelve a publicar.
//
// Se repite hasta agotar `max_attempts`. Para el dueño eso se ve como "cargó a medias y mal": tres
// respuestas distintas al mismo envío, cada una con el estado del fajo en un momento distinto.
//
// ═══ LOS DOS ARREGLOS, Y POR QUÉ HACEN FALTA LOS DOS ═══
//
// · **HEARTBEAT.** Mientras el handler corre se extiende el lease. Es la causa: el reap existe para
//   recuperar trabajo ABANDONADO, y una tarea que late no está abandonada. Un lease más largo solo
//   no alcanza —el día que lleguen treinta fotos vuelve a pasar—; el latido no depende del tamaño.
//
// · **NO REINTENTAR UN EFECTO QUE YA OCURRIÓ.** Si aun así se perdiera el lease (la base no contesta
//   el heartbeat, el proceso se congela), el handler pudo haber publicado ya. Ahí `failTask` es
//   exactamente lo que NO hay que hacer: reencola una tarea cuyo efecto externo ya salió. Se declara
//   y se corta. Un mensaje repetido es barato; un gasto cargado dos veces, no.
//
// Todo entra INYECTADO para que esto se pruebe con relojes falsos y sin Postgres: el defecto que
// arregla es de TIEMPO, y un defecto de tiempo que no se puede probar en un test vuelve.

/** Cada cuánto late, como fracción del lease. Tres latidos por lease: uno se puede perder. */
export const FRACCION_LATIDO = 1 / 3

/** Lease por defecto del worker de comunicación, en segundos. Ver `procesarWorkFabric`. */
export const LEASE_SEGUNDOS = Number(process.env.ORQ_COMM_LEASE_SECONDS || 180)

/** Qué pasó con la tarea, y qué se puede hacer con ella después. */
export const CIERRE = Object.freeze({
  OK: 'ok',                   // corrió y se cerró: succeeded
  FALLO: 'fallo',             // corrió mal y todavía era nuestra: fail_task decide reintento
  LEASE_PERDIDO: 'lease_perdido', // el efecto pudo haber ocurrido y la tarea ya no es nuestra
})

/**
 * Corre un handler MANTENIENDO EL LEASE, y cierra la tarea según lo que de verdad pasó.
 *
 * @param {object} o
 * @param {object} o.task                 la tarea claimada
 * @param {string} o.workerId
 * @param {Function} o.correr             () => Promise<out>  el handler ya atado a su contexto
 * @param {Function} o.heartbeat          (taskId, workerId, leaseSeconds) => Promise<boolean>
 * @param {Function} o.transition         (taskId, workerId, estado, patch?) => Promise<any>
 * @param {Function} o.failTask           (taskId, workerId, error, backoffMs) => Promise<any>
 * @param {number} [o.leaseSeconds]
 * @param {number} [o.backoffMs]
 * @param {Function} [o.programar]        setInterval inyectable (tests)
 * @param {Function} [o.cancelar]         clearInterval inyectable (tests)
 * @param {object} [o.log]
 * @returns {Promise<{cierre:string, out?:object, error?:string}>}  NUNCA lanza.
 */
export async function correrConLease({
  task, workerId, correr, heartbeat, transition, failTask,
  leaseSeconds = LEASE_SEGUNDOS, backoffMs = 1000,
  programar = setInterval, cancelar = clearInterval, log,
} = {}) {
  let perdido = false
  // El latido corre en paralelo al handler y NO puede tumbarlo: si el heartbeat falla por red, se
  // avisa y se sigue: el lease todavía puede estar vivo, y matar la tarea acá la haría reintentar —
  // que es justo el bucle que este archivo existe para cortar.
  const latido = programar(async () => {
    try {
      if (!(await heartbeat(task.id, workerId, leaseSeconds))) {
        perdido = true
        log?.warn?.('work-fabric comm: lease perdido a mitad de la tarea', { task_id: task.id })
      }
    } catch (e) {
      log?.warn?.('work-fabric comm: no pude latir el lease', { task_id: task.id, error: String(e?.message ?? e).slice(0, 200) })
    }
  }, Math.max(1000, Math.round(leaseSeconds * FRACCION_LATIDO * 1000)))
  if (typeof latido?.unref === 'function') latido.unref()

  try {
    const out = await correr()
    if (perdido) {
      // EL TRABAJO SE HIZO Y LA TAREA YA NO ES NUESTRA. No se transiciona (la máquina de estados lo
      // rechazaría con «transición inválida retrying -> reviewing») y sobre todo NO se llama a
      // `failTask`: reencolarla la volvería a ejecutar entera, con su efecto externo incluido.
      log?.error?.('work-fabric comm: efecto ya producido con el lease vencido; NO se reintenta', {
        task_id: task.id, lease_seconds: leaseSeconds,
      })
      return { cierre: CIERRE.LEASE_PERDIDO, out }
    }
    await transition(task.id, workerId, 'reviewing')
    await transition(task.id, workerId, 'succeeded', { result: out?.result ?? {}, evidence: out?.evidence ?? {} })
    return { cierre: CIERRE.OK, out }
  } catch (e) {
    const error = String(e?.message ?? e).slice(0, 400)
    if (perdido || esTransicionInvalida(error)) {
      // Mismo razonamiento: si la transición fue rechazada es porque otro dueño movió el estado, y
      // eso sólo pasa cuando el reap ya dio la tarea por abandonada. El handler ya corrió.
      log?.error?.('work-fabric comm: la tarea se cerró sin poder transicionar; NO se reintenta', {
        task_id: task.id, error,
      })
      return { cierre: CIERRE.LEASE_PERDIDO, error }
    }
    try {
      await failTask(task.id, workerId, error, backoffMs)
    } catch (e2) {
      log?.error?.('work-fabric comm: tampoco pude marcar el fallo', { task_id: task.id, error: String(e2?.message ?? e2).slice(0, 200) })
    }
    return { cierre: CIERRE.FALLO, error }
  } finally {
    cancelar(latido)
  }
}

/**
 * ¿Este error es la máquina de estados rechazando la transición?
 *
 * Se reconoce por el TEXTO porque es lo único que devuelve `raise exception` de plpgsql, y el texto
 * es contrato: sale de `orq.transition_task` (`transición inválida % -> %`) y de su control de dueño
 * (`worker % no es dueño del lease`). Los dos significan lo mismo para quien llama: la tarea ya no es
 * suya, y su efecto —si lo hubo— ya ocurrió.
 */
export function esTransicionInvalida(mensaje) {
  const s = String(mensaje ?? '')
  return /transici[oó]n\s+inv[aá]lida/i.test(s) || /no es due[ñn]o del lease/i.test(s)
}
