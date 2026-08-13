// EL CICLO DE VIDA DE UNA TAREA RECLAMADA — una sola definición para todos los runners.
//
// ═══ POR QUÉ EXISTE ESTE ARCHIVO (13/08) ═══
//
// El ciclo `claimed → running → (handler) → reviewing → succeeded` estaba escrito DOS VECES:
// en `worker.mjs` (con latido de lease) y en `comunicacion/conector.mjs` (SIN latido). La copia
// sin latido produjo el incidente del 13/08 19:27: el especialista de comprobantes tardó 2m32s,
// el lease de 30 s venció a los 35 s, el reaper mandó la tarea a `retrying`, y al terminar el
// handler la transición `retrying -> reviewing` explotó. La tarea se re-ejecutó ENTERA tres veces
// —cargando comprobantes de nuevo sobre un estado ya modificado— y murió en `dead_letter` con el
// SÍNTOMA guardado como error ("transición inválida") en vez de la causa ("lease expirado").
//
// La transición `retrying -> reviewing` NO se agrega: una tarea en `retrying` está devuelta a la
// cola y puede tenerla otro worker. Que el worker viejo la "termine" es exactamente el bug —
// dos ejecuciones cerrando la misma tarea. Lo que estaba mal era el ESTADO DE PARTIDA: la tarea
// nunca debió salir de `running`, porque estaba viva. La cura es latir el lease, y si igual se
// perdió, callarse: el reaper ya se hizo cargo.
//
// ═══ LAS TRES GUARDAS ═══
//
//  1. LATIDO: mientras el handler corre, se extiende el lease. Sin esto un trabajo largo se
//     autodeclara abandonado.
//  2. LEASE PERDIDO: si el latido dice que ya no somos dueños, NO se transiciona NI se falla la
//     tarea. Otro worker la tiene; pisarla duplica el cierre y borra su resultado.
//  3. NO REPETIBLE: una tarea cuyo intento anterior se cortó por lease vencido no se sabe si
//     completó su trabajo. Si su tipo tiene efecto externo (publica en el canal, mueve plata),
//     re-ejecutarla a ciegas duplica el efecto. Va a terminal con motivo y decide una persona.

/** Tipos cuyo trabajo NO se puede repetir a ciegas: ya tocaron algo de afuera cuando se cortaron.
 *  `comunicacion.responder` publica en Mattermost y corre especialistas que escriben (comprobantes);
 *  `operation_execute` aplica una operación ya aprobada. Un tipo ausente de esta lista se reintenta
 *  como siempre — la guarda es opt-in, no cambia el comportamiento del resto. */
export const TIPOS_NO_REPETIBLES = new Set(['comunicacion.responder', 'operation_execute'])

/** Resultados posibles del ciclo. `lease_perdido` no es un fallo: es "no era nuestra". */
export const RESULTADO = {
  OK: 'ok',
  OMITIDA: 'omitida',
  LEASE_PERDIDO: 'lease_perdido',
  REINTENTA: 'reintenta',
  TERMINAL: 'terminal',
}

const MOTIVO_INTERRUMPIDA = 'el intento anterior se cortó a mitad (lease vencido) y este trabajo no '
  + 'se puede repetir sin duplicar lo que ya hizo afuera; no se reintenta solo'

/**
 * Construye el ejecutor del ciclo. Todo lo externo se inyecta: se testea sin base ni relojes reales.
 *
 * @param {object} dep
 * @param {object} dep.ledger      {transition, heartbeat, failTask, intentoPrevioInterrumpido}
 * @param {string} dep.workerId
 * @param {number} dep.leaseSeconds  vida del lease que se renueva en cada latido
 * @param {number} dep.heartbeatMs   cada cuánto se late (DEBE ser bastante menor que el lease)
 * @param {number} [dep.backoffMs]   backoff base para failTask
 * @param {object} [dep.log]
 * @param {Set<string>} [dep.noRepetibles]
 * @param {Function} [dep.programar]  setInterval inyectable (tests)
 * @param {Function} [dep.cancelar]   clearInterval inyectable (tests)
 */
export function crearCicloTarea(dep = {}) {
  const {
    ledger, workerId, leaseSeconds, heartbeatMs, backoffMs = 30_000, log,
    noRepetibles = TIPOS_NO_REPETIBLES,
    programar = setInterval, cancelar = clearInterval,
  } = dep
  if (!ledger) throw new Error('ciclo-tarea: falta el ledger')
  // Un latido más lento que el lease es peor que no latir: da falsa sensación de cobertura y el
  // lease vence igual. Se corta acá, al construir, y no en producción a las 19:27.
  if (!(heartbeatMs > 0) || !(leaseSeconds > 0) || heartbeatMs >= leaseSeconds * 1000) {
    throw new Error(`ciclo-tarea: heartbeatMs (${heartbeatMs}) debe ser menor que el lease (${leaseSeconds}s)`)
  }

  /**
   * Corre UNA tarea ya reclamada, de punta a punta.
   * @param {object} task la fila de orq.tasks que devolvió claim_task
   * @param {object} ganchos {correr, antesDeCorrer, alFallar, alTerminarEnFallo}
   * @returns {Promise<{resultado:string, motivo?:string, estado?:string, salida?:object}>}
   */
  return async function ejecutarCiclo(task, ganchos = {}) {
    const previo = await antesDeArrancar(task, ganchos)
    if (previo) return previo

    const estadoLease = { perdido: false }
    const latido = programar(() => latir(task, estadoLease), heartbeatMs)
    try {
      await ledger.transition(task.id, workerId, 'running')
      const salida = await ganchos.correr(task)
      // GUARDA 2: perdimos el lease mientras corríamos. La tarea ya es de otro (o volvió a la cola):
      // transicionarla desde acá es el bug del 13/08. Se calla y se va.
      if (estadoLease.perdido) return avisarPerdido(task)
      await ledger.transition(task.id, workerId, 'reviewing')
      await ledger.transition(task.id, workerId, 'succeeded', {
        result: salida?.result ?? {}, evidence: salida?.evidence ?? {}, review: { passed: true, gate: 'noop' },
      })
      return { resultado: RESULTADO.OK, salida }
    } catch (err) {
      if (estadoLease.perdido) return avisarPerdido(task, err)
      return await manejarFallo(task, err, ganchos)
    } finally {
      cancelar(latido)
    }
  }

  async function latir(task, estadoLease) {
    try {
      if (await ledger.heartbeat(task.id, workerId, leaseSeconds)) return
      estadoLease.perdido = true
      log?.warn?.('lease perdido; la tarea ya no es de este worker', { task_id: task.id })
    } catch (e) {
      // Un blip de red en el latido no mata la tarea: el lease sigue corriendo y el próximo latido
      // decide. Sólo `false` (la base dijo que no somos dueños) marca el lease como perdido.
      log?.warn?.('latido con error (se reintenta)', { task_id: task.id, error: String(e?.message ?? e) })
    }
  }

  function avisarPerdido(task, err) {
    log?.warn?.('tarea abandonada sin cerrar: el lease ya no es nuestro', {
      task_id: task.id, error: err ? String(err?.message ?? err) : null,
    })
    return { resultado: RESULTADO.LEASE_PERDIDO }
  }

  /** Gancho de pre-ejecución + GUARDA 3. Devuelve null si la tarea debe correr. */
  async function antesDeArrancar(task, ganchos) {
    const previo = await ganchos.antesDeCorrer?.(task)
    if (previo?.omitir) return { resultado: RESULTADO.OMITIDA, motivo: previo.motivo ?? null }
    if (!(await debeFrenarPorInterrupcion(task))) return null
    await ledger.transition(task.id, workerId, 'cancelled', { error: MOTIVO_INTERRUMPIDA })
    log?.error?.('tarea NO repetible cortada a mitad: no se reintenta sola', {
      task_id: task.id, type: task.type, attempt: task.attempt,
    })
    await ganchos.alTerminarEnFallo?.(task, { estado: 'cancelled', motivo: MOTIVO_INTERRUMPIDA })
    return { resultado: RESULTADO.TERMINAL, estado: 'cancelled', motivo: MOTIVO_INTERRUMPIDA }
  }

  async function debeFrenarPorInterrupcion(task) {
    if (!noRepetibles.has(task.type)) return false
    if (!(task.attempt > 1)) return false
    return await ledger.intentoPrevioInterrumpido(task.id, task.attempt)
  }

  async function manejarFallo(task, err, ganchos) {
    const motivo = String(err?.message ?? err).slice(0, 400)
    if ((await ganchos.alFallar?.(task, err))?.manejado) {
      return { resultado: RESULTADO.OMITIDA, motivo }
    }
    const estado = await ledger.failTask(task.id, workerId, motivo, backoffMs)
    log?.error?.('tarea falló', { task_id: task.id, error: motivo, next_state: estado })
    if (estado === 'dead_letter') {
      await ganchos.alTerminarEnFallo?.(task, { estado, motivo })
      return { resultado: RESULTADO.TERMINAL, estado, motivo }
    }
    return { resultado: RESULTADO.REINTENTA, estado, motivo }
  }
}
