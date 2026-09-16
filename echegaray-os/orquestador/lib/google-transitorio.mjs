// ¿ESTA FALLA DE GOOGLE ES PASAJERA? — una sola respuesta para todos los que reintentan.
//
// ═══ POR QUÉ EXISTE (15/09/2026, 14:44) ═══
//
// El dueño mandó 8 fotos de comprobantes al canal de compras. La visión leyó las 8, el fajo se armó,
// y el cargador murió LEYENDO la fila de rótulos de Compras con un HTTP 504 de Google Sheets —
// antes de escribir una sola celda. El bot contestó «Terminé, pero no cargué ninguno de los 8» y el
// evento quedó `procesado`: ocho lecturas de IA tiradas por un servidor que no contestó a tiempo.
//
// `google.mjs` ya reintenta un 5xx cuatro veces en ~11 segundos (`ESPERAS_5XX`). Cuando el 504 sale
// de ahí igual, la falla es más larga que eso y hay que reintentar a otra escala: segundos dentro
// del proceso, minutos desde la base. Los dos niveles necesitan la MISMA pregunta —«¿esto vale la
// pena reintentarlo?»— y esa pregunta se contesta acá, una vez.
//
// LO QUE NO ES TRANSITORIO, y por qué importa decirlo: un 400/401/403 real, un rótulo que falta, un
// JSON roto o una columna prohibida no cambian por esperar. Reintentar eso es repetir el error con
// más latencia — y si el error fue A MITAD de una escritura, reintentarlo es cómo se duplica un gasto.

/** Códigos HTTP que Google devuelve cuando el problema es de ellos o de cuota, no del pedido. */
export const STATUS_TRANSITORIOS = Object.freeze([429, 500, 502, 503, 504])

/** Fallas de red antes de que haya un status: DNS, socket cortado, timeout del cliente. */
const RED = /\b(ECONNRESET|ETIMEDOUT|ECONNREFUSED|EAI_AGAIN|ENOTFOUND|EPIPE|UND_ERR_(CONNECT_TIMEOUT|SOCKET|HEADERS_TIMEOUT|BODY_TIMEOUT))\b|fetch failed|socket hang up|network timeout|timed? ?out/i

/** El status que `google.mjs` mete en el mensaje: «google api 504: …», «google export 503: …». */
const STATUS_EN_TEXTO = /\bgoogle (?:api|export(?: [a-z/.+-]+)?(?: revision| pdf)?) (\d{3})\b/i

/**
 * Esperas dentro del MISMO proceso, en ms, para una corrida del cargador que falló antes de escribir.
 *
 * Cortas a propósito: el worker de comunicación tiene un latido de 5 minutos por tick y una tanda
 * grande ya tarda 2m30s por post. Lo que no entra acá se reintenta desde la base, en minutos.
 * `ORQ_CARGADOR_ESPERAS_MS=5000,15000` las cambia sin deploy; vacío = sin reintento en proceso.
 */
export const ESPERAS_CARGADOR_MS_DEFAULT = Object.freeze([5_000, 15_000])

export function esperasDelCargador(env = process.env) {
  const raw = env.ORQ_CARGADOR_ESPERAS_MS
  if (raw == null) return [...ESPERAS_CARGADOR_MS_DEFAULT]
  return String(raw).split(',').map((s) => s.trim()).filter(Boolean).map(Number).filter((n) => Number.isFinite(n) && n >= 0)
}

/** El status HTTP de un error, si lo trae —como propiedad o adentro del mensaje—. */
export function statusDe(e) {
  const directo = Number(e?.status ?? e?.statusCode ?? e?.response?.status ?? e?.code)
  if (Number.isInteger(directo) && directo >= 100 && directo < 600) return directo
  const m = STATUS_EN_TEXTO.exec(String(e?.message ?? e ?? ''))
  return m ? Number(m[1]) : null
}

/**
 * ¿Vale la pena volver a intentar exactamente lo mismo dentro de un rato?
 *
 * Sí para 429 y 5xx de Google y para cortes de red. No para todo lo demás: un error de contrato, de
 * permiso o de datos se arregla cambiando algo, no esperando.
 */
export function esTransitorio(e) {
  if (e == null) return false
  if (e.transitorio === true) return true
  const status = statusDe(e)
  if (status != null) return STATUS_TRANSITORIOS.includes(status)
  return RED.test(String(e?.message ?? e?.cause?.message ?? e ?? '')) || RED.test(String(e?.cause?.code ?? e?.code ?? ''))
}
