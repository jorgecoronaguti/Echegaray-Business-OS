// Resiliencia de arranque: cuando el pooler de Supabase parpadea (econnrefused transitorio),
// el worker tocaba la DB en el primer paso, tiraba y systemd lo reiniciaba en cadena (7 crasheos
// en 3 días). En vez de abortar ante un blip, esperamos la DB con backoff y recién abortamos si
// es una caída real. No cambia ninguna lógica de negocio — solo evita el crash-loop.

/** ¿El error es una caída de conexión TRANSITORIA (vale la pena reintentar) y no un bug real? */
export function esErrorConexionTransitorio(err) {
  const code = String(err?.code ?? '').toUpperCase()
  if (['ECONNREFUSED', 'ETIMEDOUT', 'ECONNRESET', 'EPIPE', 'ENOTFOUND', 'EAI_AGAIN'].includes(code)) return true
  const msg = String(err?.message ?? err ?? '').toLowerCase()
  return /econnrefused|failed to connect|connection terminated|connection refused|connection reset|server closed the connection|timeout|too many connections|could not connect/.test(msg)
}

/** Espera a que la DB responda, reintentando SOLO ante errores de conexión transitorios.
 *  `ping` es inyectable para testear sin DB. Devuelve el resultado del ping o lanza:
 *   - el error tal cual si NO es transitorio (bug real → que aborte fuerte);
 *   - el último error si se agotaron los intentos (caída real y prolongada). */
export async function esperarDb({ ping, esperasMs = [500, 1000, 2000, 4000, 8000, 15000], onRetry, sleep } = {}) {
  const wait = sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)))
  for (let intento = 0; ; intento++) {
    try {
      return await ping()
    } catch (e) {
      const transitorio = esErrorConexionTransitorio(e)
      if (!transitorio || intento >= esperasMs.length) throw e
      if (onRetry) onRetry({ intento: intento + 1, de: esperasMs.length, espera_ms: esperasMs[intento], error: e.message })
      await wait(esperasMs[intento])
    }
  }
}
