// EL ESTADO DEL RAZONADOR — para que el OS NUNCA pare por falta de crédito de Anthropic.
//
// POR QUÉ (24/07). El dueño: "el OS no puede dejar de funcionar si la API se queda sin créditos; una
// empresa entera corre en él todo el tiempo". La operación diaria ya es 0-API (web, Sheet, sync,
// capacidades determinísticas del chat, aprobar/ejecutar). Lo único que necesita la API es el
// RAZONAMIENTO libre. Este módulo es el interruptor que deja que el resto del OS SEPA cuándo el
// razonador está sin crédito, para degradar con gracia en vez de tirar un error.
//
// El flag vive en public.os_runtime (key/value, ya existe, lectura pública) → la web y la extensión
// también pueden mostrar "razonador sin crédito" sin lógica nueva. NUNCA lanza: si la base falla, el
// razonador se asume disponible (no queremos que un problema de este módulo apague la IA por error).

const MODO_KEY = 'modo_cerebro'
const OK = 'ok'
const SIN_CREDITO = 'sin_credito'

// Estado en memoria del proceso: evita escribir a la base en cada llamada exitosa. Sólo se escribe
// en las TRANSICIONES (ok→sin_credito y sin_credito→ok). En el camino feliz, marcarCerebroOk no toca
// la base.
let ultimoEstado = OK

async function db() {
  return (await import('./db.mjs')).query
}

/** ¿El razonador está disponible? Lee el flag persistido. Ante cualquier error, asume que SÍ
 *  (no apagar la IA por un problema de este módulo). Devuelve {disponible, desde}. */
export async function cerebroDisponible() {
  try {
    const query = await db()
    const { rows } = await query('select value, updated_at from public.os_runtime where key = $1', [MODO_KEY])
    if (!rows.length) return { disponible: true, desde: null }
    const disponible = rows[0].value !== SIN_CREDITO
    ultimoEstado = disponible ? OK : SIN_CREDITO
    return { disponible, desde: disponible ? null : rows[0].updated_at }
  } catch {
    return { disponible: true, desde: null }
  }
}

/** Reporta que el razonador quedó SIN CRÉDITO (402/401/insuficiente). Fire-and-forget: nunca lanza.
 *  Persiste el flag para que todo el OS degrade a determinístico. */
export async function marcarSinCredito(detalle = '') {
  ultimoEstado = SIN_CREDITO
  try {
    const query = await db()
    await query(
      `insert into public.os_runtime (key, value, updated_at) values ($1, $2, now())
         on conflict (key) do update set value = excluded.value, updated_at = now()`,
      [MODO_KEY, SIN_CREDITO])
  } catch { /* si la base falla, el flag en memoria igual protege este proceso */ }
  return { detalle: String(detalle).slice(0, 200) }
}

/** Reporta que el razonador respondió OK. Sólo escribe si venía marcado sin crédito (transición):
 *  en el camino feliz es un no-op, sin costo de base. */
export async function marcarCerebroOk() {
  if (ultimoEstado === OK) return { cambio: false }
  ultimoEstado = OK
  try {
    const query = await db()
    await query(
      `insert into public.os_runtime (key, value, updated_at) values ($1, $2, now())
         on conflict (key) do update set value = excluded.value, updated_at = now()`,
      [MODO_KEY, OK])
  } catch { /* idem */ }
  return { cambio: true }
}

export const _internos = { MODO_KEY, OK, SIN_CREDITO, getUltimoEstado: () => ultimoEstado, setUltimoEstado: (v) => { ultimoEstado = v } }
