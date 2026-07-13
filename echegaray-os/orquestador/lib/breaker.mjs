// Resiliencia a nivel PROVEEDOR para el Reasoner (Anthropic). Dos piezas
// independientes del Work Fabric — no tocan worker, ledger ni reintentos del
// ledger; sólo protegen la salida hacia la API:
//
//   1. Semáforo de concurrencia: acota los requests simultáneos a la API para
//      no tocar rate limits (ITPM/OTPM) cuando N especialistas corren en
//      paralelo. Independiente del CONCURRENCY del worker.
//
//   2. Circuit breaker: tras N fallos consecutivos corta en corto durante un
//      cooldown, devolviendo un error inmediato (BreakerOpenError) en vez de
//      martillar la API. Los fallos de CREDENCIAL (401/403) lo abren de una:
//      reintentar una key inválida no tiene sentido y sólo quema intentos.
//
// El breaker NO reemplaza el backoff/dead-letter del ledger: lo complementa.
// Un ciclo de reintentos del ledger que caiga con el breaker abierto falla
// rápido (instantáneo) en vez de esperar timeouts, acelerando el dead-letter
// honesto sin tormenta de retries. Estado en memoria, por proceso worker.

/** Error tipado: el breaker está abierto; no se intentó el request. */
export class BreakerOpenError extends Error {
  constructor(provider, msRestantes) {
    super(`circuit breaker '${provider}' abierto; reintentar en ~${Math.ceil(msRestantes / 1000)}s`)
    this.name = 'BreakerOpenError'
    this.code = 'BREAKER_OPEN'
    this.provider = provider
    this.retryable = false // no reintentar dentro del mismo intento
  }
}

/** Semáforo asíncrono simple (FIFO). Limita ejecuciones concurrentes a `max`. */
export function createSemaphore(max) {
  const n = Math.max(1, Number(max) || 1)
  let inUse = 0
  const waiters = []
  const acquire = () =>
    new Promise((resolve) => {
      if (inUse < n) {
        inUse++
        resolve()
      } else {
        waiters.push(resolve)
      }
    })
  const release = () => {
    const next = waiters.shift()
    if (next) next()
    else inUse = Math.max(0, inUse - 1)
  }
  return {
    /** Corre fn() con un permiso tomado; lo libera pase lo que pase. */
    async run(fn) {
      await acquire()
      try {
        return await fn()
      } finally {
        release()
      }
    },
    get pending() {
      return waiters.length
    },
    get inUse() {
      return inUse
    },
  }
}

/**
 * Circuit breaker con cooldown. `now` inyectable para tests.
 * @param {object} p
 * @param {string} p.provider
 * @param {number} p.threshold  fallos consecutivos que abren el breaker
 * @param {number} p.cooldownMs ventana de corte
 * @param {() => number} [p.now]
 */
export function createBreaker({ provider = 'anthropic', threshold = 5, cooldownMs = 30000, now = Date.now } = {}) {
  let consecutivos = 0
  let abiertoHasta = 0

  /** Lanza BreakerOpenError si está abierto; si no, no hace nada. */
  function assertClosed() {
    const t = now()
    if (t < abiertoHasta) throw new BreakerOpenError(provider, abiertoHasta - t)
  }

  function onSuccess() {
    consecutivos = 0
    abiertoHasta = 0
  }

  /**
   * Registra un fallo. `hard=true` (credencial 401/403) abre de inmediato con un
   * cooldown extendido (el error no se resuelve reintentando).
   */
  function onFailure({ hard = false } = {}) {
    consecutivos++
    if (hard) {
      abiertoHasta = now() + cooldownMs * 2
    } else if (consecutivos >= threshold) {
      abiertoHasta = now() + cooldownMs
    }
  }

  return {
    assertClosed,
    onSuccess,
    onFailure,
    get state() {
      return now() < abiertoHasta ? 'open' : 'closed'
    },
    get consecutiveFailures() {
      return consecutivos
    },
    get openUntil() {
      return abiertoHasta
    },
  }
}
