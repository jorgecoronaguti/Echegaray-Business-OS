// PR-3 · Política de entrega: reintentos, backoff y Dead Letter — pura.
//
// El patrón es Transactional Outbox: el evento saliente se persiste en la MISMA
// transacción que lo generó, y un proceso aparte lo entrega con garantía
// at-least-once. La idempotencia (clave del evento + platform_ref) hace que
// at-least-once no signifique "duplicado en el chat".
//
// Este módulo NO toca la base ni la red: son funciones puras que deciden el
// próximo estado de un ítem de outbox dado el resultado de un intento. Así se
// testea la política sin infraestructura, y el repositorio (memoria/postgres)
// sólo persiste lo que estas funciones deciden.

/** Estados de un ítem de outbox. */
export const ESTADO = Object.freeze({
  PENDIENTE: 'pendiente', // esperando primer intento o reintento
  PUBLICADO: 'publicado', // entregado a la plataforma con éxito (terminal feliz)
  DEAD: 'dead', // agotó reintentos o error permanente (terminal, va a DLQ)
})

/** Máximo de intentos antes de mandar a Dead Letter. */
export const MAX_INTENTOS = 6

/** Backoff exponencial con techo, en milisegundos. intento 1 → 1s, 2 → 2s, 3 →
 *  4s … con techo de 5 min. Determinístico (sin jitter) para que el test sea
 *  estable; el jitter, si se quiere, se suma en el scheduler real. */
export function backoffMs(intento, techoMs = 5 * 60_000) {
  const base = 1000 * 2 ** Math.max(0, intento - 1)
  return Math.min(base, techoMs)
}

/**
 * Decide el próximo estado de un ítem tras un intento de publicación.
 * @param {{intentos:number}} item     estado previo (intentos ya realizados)
 * @param {{ok:boolean, platform_ref?:string, error?:string, reintentable?:boolean}} resultado
 * @param {number} [ahora]  epoch ms (inyectable para tests)
 * @returns {{estado:string, intentos:number, next_attempt_at:number|null, platform_ref:string|null, last_error:string|null, a_dlq:boolean}}
 */
export function decidirProximo(item, resultado, ahora = Date.now()) {
  const intentos = (item?.intentos ?? 0) + 1

  if (resultado?.ok) {
    return {
      estado: ESTADO.PUBLICADO,
      intentos,
      next_attempt_at: null,
      platform_ref: resultado.platform_ref ?? null,
      last_error: null,
      a_dlq: false,
    }
  }

  const permanente = resultado?.reintentable === false
  const agotado = intentos >= MAX_INTENTOS
  if (permanente || agotado) {
    return {
      estado: ESTADO.DEAD,
      intentos,
      next_attempt_at: null,
      platform_ref: null,
      last_error: resultado?.error ?? 'error desconocido',
      a_dlq: true, // el servicio lo copia a la tabla dead_letter
    }
  }

  return {
    estado: ESTADO.PENDIENTE,
    intentos,
    next_attempt_at: ahora + backoffMs(intentos),
    platform_ref: null,
    last_error: resultado?.error ?? null,
    a_dlq: false,
  }
}
