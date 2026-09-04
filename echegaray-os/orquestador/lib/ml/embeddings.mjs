// EL MOTOR DE EMBEDDINGS. UNA SOLA PUERTA, IGUAL QUE `lib/ia/` LO ES PARA EL RAZONAMIENTO.
//
// ═══ QUÉ ES UN EMBEDDING, Y QUÉ NO ES ═══
//
// Convierte un texto en un vector para poder medir CUÁNTO SE PARECEN dos textos. No entiende, no
// decide y no razona: da un número entre -1 y 1. Todo lo que se construya arriba —búsqueda,
// resolución de identidad, selección de contexto— es aritmética sobre ese número.
//
// Por eso nunca reemplaza a Claude: lo que hace es que a Claude le llegue menos material y mejor
// elegido.
//
// ═══ POR QUÉ EL MODELO SE CARGA UNA VEZ Y DE FORMA PEREZOSA ═══
//
// Cargarlo cuesta ~6 s y ~580 MB de RSS. En una VM de 7 GB con 14 timers y Postgres compitiendo,
// cargarlo al importar el módulo significaría pagarlo en CADA script que toque la cadena de
// imports, aunque no embeba nada. Se carga la primera vez que alguien lo pide de verdad.
//
// ═══ LOS PREFIJOS NO SON DECORACIÓN ═══
//
// La familia e5 se entrena con `query:` y `passage:`: una pregunta y un documento se embeben
// distinto A PROPÓSITO. Usarlos al revés —o no usarlos— degrada el resultado sin dar ningún error,
// que es la peor forma de romper algo.
//
// ═══ LO QUE ESTA VM CONTESTÓ (04/09/2026) ═══
//
//   7 ms por embedding · 5,8 s de carga · 584 MB de RSS · 130 MB de pesos en disco
//   4 cores · Intel Xeon Cascade Lake con AVX-512 VNNI · sin GPU
//
// El número de VNNI importa: ONNX Runtime usa esas instrucciones para INT8 y por eso 7 ms y no 30.

import { createHash } from 'node:crypto'

/** El modelo. Se cambia acá y en `registro.mjs`, en ningún otro lado. */
export const MODELO = process.env.ORQ_ML_EMBED_MODELO || 'Xenova/multilingual-e5-small'
export const DIMENSIONES = 384

/** Dónde viven los pesos. Bajo `orquestador/datos/` para que no se mezclen con node_modules y
 *  sobrevivan a un `npm ci`. */
const CACHE_DIR = process.env.ORQ_ML_CACHE_DIR || new URL('../../datos/modelos/', import.meta.url).pathname

let _pipe = null
let _cargando = null

/** Las marcas diacríticas de Unicode, escritas con escape a propósito: pegadas literalmente son
 *  caracteres invisibles que nadie puede revisar en un diff. */
const DIACRITICOS = /[̀-ͯ]/g

/**
 * NORMALIZACIÓN ANTES DE EMBEBER. No es cosmética: "S.R.L." y "SRL" tienen que dar el MISMO vector
 * para que la comparación mida el nombre y no la puntuación. Se hace acá, una vez, para que ningún
 * llamador tenga su propia versión — dos normalizaciones distintas del mismo texto son dos
 * identidades distintas, y eso ya costó caro en este repo con los ids de los planos.
 */
export function normalizar(texto) {
  return String(texto ?? '')
    .normalize('NFD').replace(DIACRITICOS, '')
    .toUpperCase()
    .replace(/[^A-Z0-9ÑÜ\s.-]/g, ' ')
    .replace(/\b(S\.?R\.?L|S\.?A\.?S?|S\.?H|SOCIEDAD ANONIMA|SRL|SA|SAS)\b\.?/g, ' ')
    .replace(/[.\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** La clave de caché de un texto ya normalizado. El mismo texto no se re-embebe nunca. */
const claveDe = (t) => createHash('sha1').update(`${MODELO} ${t}`).digest('hex')

const cache = new Map()
const TOPE_CACHE = 5000

/** Carga perezosa, una sola vez, con las llamadas concurrentes compartiendo la misma promesa. */
async function pipeline() {
  if (_pipe) return _pipe
  if (_cargando) return _cargando
  _cargando = (async () => {
    const { pipeline: crear, env } = await import('@huggingface/transformers')
    env.cacheDir = CACHE_DIR
    _pipe = await crear('feature-extraction', MODELO, { dtype: 'q8' })
    return _pipe
  })()
  return _cargando
}

/** ¿Está el motor disponible? Sirve para el health check y para que un caller decida degradar. */
export async function disponible() {
  try { await pipeline(); return true } catch { return false }
}

/**
 * El vector de un texto.
 *
 * @param {string} texto
 * @param {'consulta'|'documento'} rol qué es este texto para la familia e5. Una pregunta y un
 *   documento NO se embeben igual, y equivocarse acá degrada sin dar error.
 */
export async function embeber(texto, rol = 'documento') {
  const limpio = normalizar(texto)
  if (!limpio) return null
  const conPrefijo = MODELO.includes('e5') ? `${rol === 'consulta' ? 'query' : 'passage'}: ${limpio}` : limpio
  const k = claveDe(conPrefijo)
  if (cache.has(k)) return cache.get(k)
  const ex = await pipeline()
  const salida = await ex(conPrefijo, { pooling: 'mean', normalize: true })
  const v = Array.from(salida.data)
  if (cache.size >= TOPE_CACHE) cache.delete(cache.keys().next().value)
  cache.set(k, v)
  return v
}

/** Varios de una, reusando la carga del modelo. */
export async function embeberVarios(textos = [], rol = 'documento') {
  const out = []
  for (const t of textos) out.push(await embeber(t, rol))
  return out
}

/** Similitud coseno entre dos vectores YA normalizados. Entre -1 y 1: 1 es idéntico. */
export function coseno(a, b) {
  if (!a || !b || a.length !== b.length) return null
  let s = 0
  for (let i = 0; i < a.length; i++) s += a[i] * b[i]
  return s
}

/** Estado del motor, para el health check. No carga el modelo si todavía no se cargó. */
export function estado() {
  return { modelo: MODELO, dimensiones: DIMENSIONES, cargado: Boolean(_pipe), enCache: cache.size, cacheDir: CACHE_DIR }
}
