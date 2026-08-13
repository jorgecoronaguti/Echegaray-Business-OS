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
//  2. LEASE PERDIDO: si el latido dice que ya no somos dueños —o si la base RECHAZA la transición,
//     que significa lo mismo aunque el latido no se haya enterado—, NO se transiciona NI se falla
//     la tarea. Otro worker la tiene; pisarla duplica el cierre y borra su resultado.
//  3. NO REPETIBLE: una tarea cuyo intento anterior se cortó por lease vencido no se sabe si
//     completó su trabajo. Si su tipo tiene efecto externo (publica en el canal, mueve plata),
//     re-ejecutarla a ciegas duplica el efecto. Va a terminal con motivo y decide una persona.

/** Tipos cuyo trabajo NO se puede repetir a ciegas: ya tocaron algo de afuera cuando se cortaron.
 *  `comunicacion.responder` publica en Mattermost y corre especialistas que escriben (comprobantes);
 *  `operation_execute` aplica una operación ya aprobada. Un tipo ausente de esta lista se reintenta
 *  como siempre — la guarda es opt-in, no cambia el comportamiento del resto. */
export const TIPOS_NO_REPETIBLES = new Set(['comunicacion.responder', 'operation_execute'])

/** Resultados posibles del ciclo. `lease_perdido` no es un fallo: es "no era nuestra".
 *  El ciclo NUNCA lanza: el runner tiene que poder seguir con la tarea siguiente. */
export const RESULTADO = {
  OK: 'ok',
  OMITIDA: 'omitida',
  LEASE_PERDIDO: 'lease_perdido',
  REINTENTA: 'reintenta',
  TERMINAL: 'terminal',
  FALLO_CICLO: 'fallo_ciclo', // ni siquiera se pudo administrar la tarea; el reap decidirá
}

const MOTIVO_INTERRUMPIDA = 'el intento anterior se cortó a mitad (lease vencido) y este trabajo no '
  + 'se puede repetir sin duplicar lo que ya hizo afuera; no se reintenta solo'

/** Cada cuánto late, como fracción del lease: tres latidos por lease, así uno perdido no cuesta nada. */
export const FRACCION_LATIDO = 1 / 3

/** El latido que le corresponde a un lease. Nunca más rápido que 1 s ni más lento que el lease. */
export function latidoPara(leaseSeconds) {
  return Math.max(1000, Math.round(leaseSeconds * FRACCION_LATIDO * 1000))
}

/**
 * ¿Este error es la máquina de estados rechazando la transición?
 *
 * Se reconoce por el TEXTO porque es lo único que devuelve `raise exception` de plpgsql, y el texto
 * es contrato: sale de `orq.transition_task` (`transición inválida % -> %`) y de su control de dueño
 * (`worker % no es dueño del lease`). Los dos significan lo mismo para quien llama: la tarea ya no
 * es suya. Importa incluso con latido: si el heartbeat falla por red justo cuando el reap actúa,
 * `perdido` sigue en false y sin esto llamaríamos a `failTask` sobre una tarea ajena.
 */
export function esTransicionInvalida(mensaje) {
  const s = String(mensaje ?? '')
  return /transici[oó]n\s+inv[aá]lida/i.test(s) || /no es due[ñn]o del lease/i.test(s)
}

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
    try {
      const previo = await antesDeArrancar(task, ganchos)
      return previo ?? await correrYCerrar(task, ganchos)
    } catch (e) {
      // Última red: administrar la tarea falló (la base no contesta, el gancho reventó). No se
      // inventa un cierre — la tarea queda como esté y su lease vencido la devuelve a la cola.
      const motivo = String(e?.message ?? e).slice(0, 400)
      log?.error?.('ciclo-tarea: no se pudo administrar la tarea', { task_id: task?.id, error: motivo })
      return { resultado: RESULTADO.FALLO_CICLO, motivo }
    }
  }

  async function correrYCerrar(task, ganchos) {
    const estadoLease = { perdido: false }
    const latido = programar(() => latir(task, estadoLease), heartbeatMs)
    // Un timer vivo mantiene el proceso arriba: `--once` no terminaría nunca.
    if (typeof latido?.unref === 'function') latido.unref()
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
      // La transición rechazada significa que otro dueño movió el estado, y eso sólo pasa cuando el
      // reap ya dio la tarea por abandonada. El handler ya corrió: reencolarla repetiría su efecto.
      if (estadoLease.perdido || esTransicionInvalida(err?.message)) return avisarPerdido(task, err)
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
