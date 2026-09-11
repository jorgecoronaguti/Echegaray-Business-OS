// UN FETCH QUE NO ESPERA PARA SIEMPRE — para el middleware, que corre en TODA petición.
//
// 11/09/2026: Supabase («Unresponsive Projects», incidente mayor) dejó de contestar en Auth y REST
// durante minutos. El middleware esperaba `getClaims()` y la lectura de `perfiles` sin tope, Vercel
// cortó la función y el dueño vio «504 MIDDLEWARE_INVOCATION_TIMEOUT» en TODAS las pantallas, sin
// saber si era su conexión, Vercel o la base. Con tope, el middleware se entera en segundos y
// contesta una página que dice QUÉ no responde.

export const TOPE_MS_MIDDLEWARE = 6_000

/** Compone el `signal` del llamador con el del tope: gana el que aborte primero. */
function conSenal(init: RequestInit | undefined, ms: number): RequestInit {
  const tope = AbortSignal.timeout(ms)
  const senal = init?.signal
    ? (typeof AbortSignal.any === 'function' ? AbortSignal.any([init.signal, tope]) : init.signal)
    : tope
  return { ...init, signal: senal }
}

/**
 * Devuelve un `fetch` que rechaza con `TimeoutError` pasados `ms`. `base` permite componer con otro
 * envoltorio (la traza de rendimiento); sin base, usa el `fetch` global.
 */
export function fetchConTope(ms: number, base: typeof fetch = fetch): typeof fetch {
  return (entrada, init) => base(entrada, conSenal(init, ms))
}

/** ¿El error es que el backend no contestó a tiempo o no se pudo alcanzar? */
export function esFallaDeBackend(e: unknown): boolean {
  const err = e as { name?: string; message?: string; cause?: { code?: string } } | null
  if (!err) return false
  if (err.name === 'TimeoutError' || err.name === 'AbortError') return true
  if (/fetch failed|ECONNRESET|ETIMEDOUT|ENOTFOUND|ECONNREFUSED|socket hang up/i.test(err.message ?? '')) return true
  return /ECONNRESET|ETIMEDOUT|ENOTFOUND|ECONNREFUSED|UND_ERR/.test(err.cause?.code ?? '')
}
