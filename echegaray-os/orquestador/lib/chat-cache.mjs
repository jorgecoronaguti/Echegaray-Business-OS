// CEREBRO QUE COMPONE — caché de respuestas del chat (misión: bajar el uso de API con
// cada pregunta, no subirlo). Una pregunta informativa/asesora que llegó a la API deja
// su respuesta; la próxima idéntica sale con 0 API. El interactive-server decide QUÉ es
// cacheable (standalone, sin hilo, sin adjunto, sin escritura) — acá solo se guarda/lee.
// Best-effort: si la DB falla, el chat sigue (nunca rompe ni bloquea).
import { query } from './db.mjs'

const TTL_MIN = Number(process.env.ORQ_CHAT_CACHE_TTL_MIN || 360) // 6h por defecto

/** Normaliza la pregunta para la clave: minúsculas, sin acentos ni puntuación, 1 espacio. */
export function normalizePregunta(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9ñ\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Devuelve la respuesta cacheada VIGENTE (dentro del TTL) o null. Suma un hit. */
export async function cacheGet(rol, directive) {
  const key = normalizePregunta(directive)
  if (key.length < 8) return null
  try {
    const { rows } = await query(
      `select respuesta, model, extract(epoch from (now() - created_at)) / 60 as edad_min
         from orq.chat_cache where rol = $1 and pregunta_norm = $2 limit 1`,
      [rol, key])
    if (!rows.length) return null
    const edadMin = Number(rows[0].edad_min)
    if (edadMin > TTL_MIN) return null // vencida → miss (se recalcula y refresca)
    query(`update orq.chat_cache set hits = hits + 1, last_hit_at = now() where rol = $1 and pregunta_norm = $2`, [rol, key]).catch(() => {})
    return { respuesta: rows[0].respuesta, model: rows[0].model, edadMin: Math.round(edadMin) }
  } catch { return null }
}

/** Guarda (o refresca) la respuesta. No guarda respuestas triviales/vacías. */
export async function cachePut(rol, directive, respuesta, model) {
  const key = normalizePregunta(directive)
  if (key.length < 8 || !respuesta || String(respuesta).trim().length < 20) return
  try {
    await query(
      `insert into orq.chat_cache (rol, pregunta_norm, pregunta, respuesta, model, created_at)
       values ($1, $2, $3, $4, $5, now())
       on conflict (rol, pregunta_norm)
         do update set respuesta = excluded.respuesta, model = excluded.model, created_at = now(), hits = 0`,
      [rol, key, String(directive).slice(0, 500), String(respuesta), model || null])
  } catch { /* best-effort */ }
}

/** Invalida TODA la caché — se llama cuando el dueño ENSEÑA un hecho nuevo (el conocimiento
 *  cambió, las respuestas viejas pueden quedar desactualizadas). Barato: se repuebla sola. */
export async function cacheClearAll() {
  try { await query(`delete from orq.chat_cache`) } catch { /* best-effort */ }
}
