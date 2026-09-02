// EL CONTEXTO DE TRABAJO DE UNA CONVERSACIÓN /XSAS — lo que hace que «ahora esos» signifique algo.
//
// ═══ QUÉ ES Y QUÉ NO ES ═══
//
// No es memoria conversacional para un modelo: es ESTADO OPERACIONAL estructurado — qué archivos
// están activos, qué entidades quedaron determinadas, qué produjo el último trabajo — guardado en
// Postgres para que sobreviva al proceso. Un follow-up se resuelve consultando este estado, no
// reenviándole el transcript a un modelo.
//
// ═══ EL AISLAMIENTO ES DEL ACTOR, SIEMPRE ═══
//
// La clave es (actor_id, correlation_id) y TODA lectura filtra por el actor del pedido — que lo puso
// el servidor, no el navegador. Conocer el correlation_id de otro no alcanza para leer su contexto.
//
// ═══ REFERENCIAS, NO BLOBS ═══
//
// De un archivo se guarda su hash y su carátula; el parse completo vive en `orq.xsas_adjunto`. El
// contexto se mantiene chico a propósito: es un índice de trabajo, no un archivo histórico.

/** Cuántos archivos activos recuerda una conversación. Los más nuevos ganan. */
export const MAX_ARCHIVOS_ACTIVOS = 10

/** Carga el contexto de trabajo. `null` si no hay (o si no hay base — se declara, no se rompe). */
export async function cargarContexto(query, { actorId, correlacionId }) {
  if (!query || !actorId || !correlacionId) return null
  try {
    const { rows } = await query(
      'select datos from orq.xsas_contexto where actor_id = $1 and correlation_id = $2 limit 1',
      [String(actorId), String(correlacionId)],
    )
    return rows?.[0]?.datos ?? null
  } catch { return null }
}

/**
 * Guarda un PARCHE de contexto (merge superficial sobre lo que hay). Nunca lanza: perder el
 * contexto degrada la continuidad, no la respuesta de este pedido.
 */
export async function guardarContexto(query, { actorId, correlacionId, parche }) {
  if (!query || !actorId || !correlacionId || !parche) return false
  try {
    await query(
      `insert into orq.xsas_contexto (actor_id, correlation_id, datos, actualizado_en)
       values ($1,$2,$3,now())
       on conflict (actor_id, correlation_id)
       do update set datos = orq.xsas_contexto.datos || excluded.datos, actualizado_en = now()`,
      [String(actorId), String(correlacionId), JSON.stringify(parche)],
    )
    return true
  } catch { return false }
}

/** La carátula de una lectura, para el contexto: identidad y forma, sin el parse. PURA. */
export function caratulaDeLectura(l) {
  return { hash: l.hash, nombre: l.nombre, destino: l.destino, formato: l.formato ?? null, tamano: l.tamano ?? null }
}

/** Suma archivos al contexto sin crecer sin techo: dedup por hash, los nuevos primero. PURA. */
export function acotarArchivos(previos = [], nuevos = []) {
  const todos = [...nuevos, ...(Array.isArray(previos) ? previos : [])]
  const vistos = new Set()
  const out = []
  for (const a of todos) {
    if (!a?.hash || vistos.has(a.hash)) continue
    vistos.add(a.hash)
    out.push(a)
    if (out.length >= MAX_ARCHIVOS_ACTIVOS) break
  }
  return out
}

// ═══ ¿ESTA FRASE SE REFIERE AL TRABAJO ANTERIOR? ═══
//
// No se hardcodean las frases del dueño una por una: se detecta la ANÁFORA — la palabra que sólo
// significa algo si hubo un antes («eso», «esos», «el archivo», «de nuevo») — y la orden sin objeto
// («seguí», «hacelo», «dale»). El detector peca de corto: un falso negativo cae en el ruteo de
// siempre; un falso positivo secuestraría una pregunta nueva.
const ANAFORAS = new Set([
  'eso', 'esos', 'esa', 'esas', 'aquello',
  'anterior', 'anteriores', 'mismo', 'misma', 'mismos',
])
const FRASES_ANAFORICAS = [
  'de nuevo', 'otra vez', 'el archivo', 'la planilla', 'el pdf', 'el extracto', 'el excel',
  'lo que quedo', 'lo pendiente', 'quedo pendiente', 'los que no', 'las que no', 'lo que no',
  'lo de antes', 'lo de recien',
]
const ORDENES_SIN_OBJETO = new Set(['segui', 'seguile', 'hacelo', 'hacela', 'hacelos', 'dale', 'continua', 'continuemos', 'avanza', 'retoma', 'retomalo'])

/** Palabras que piden lo NO resuelto del trabajo anterior. */
const PIDE_PENDIENTE = /pendiente|no cerr|no tom|rechaz|falt|sin conciliar|quedo afuera|no pud/

/**
 * Clasifica la frase: `{es, aspecto}` — `aspecto` es 'pendiente' (lo que no cerró del trabajo
 * previo) o 'resumen' (volver a mostrar lo leído). PURA.
 */
export function referenciaContextual(texto) {
  const norm = String(texto ?? '')
    .toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[¿?¡!.,;:]/g, ' ').replace(/\s+/g, ' ').trim()
  const palabras = norm.split(' ')
  const corta = palabras.length <= 10
  const es = (corta && palabras.some((w) => ANAFORAS.has(w)))
    || palabras.some((w) => ORDENES_SIN_OBJETO.has(w))
    || FRASES_ANAFORICAS.some((f) => norm.includes(f))
  if (!es) return { es: false, aspecto: null }
  return { es: true, aspecto: PIDE_PENDIENTE.test(norm) ? 'pendiente' : 'resumen' }
}
