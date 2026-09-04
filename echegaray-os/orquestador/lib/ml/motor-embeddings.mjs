// EL MOTOR DE EMBEDDINGS, CON MÁS DE UN MODELO. Es lo que permite comparar y reemplazar.
//
// ═══ POR QUÉ NO ALCANZABA `embeddings.mjs` ═══
//
// Ése tiene UN modelo cableado, y está bien para lo que hace: comparar nombres de proveedores. Pero
// elegir un modelo de recuperación exige correr tres sobre las mismas preguntas y mirar los
// números; y reemplazarlo después exige saber qué filas se embebieron con cuál. Un motor de un solo
// modelo convierte «cambiar de modelo» en «reindexar todo y rezar».
//
// ═══ LA REVISIÓN NO ES UN DETALLE ═══
//
// Un modelo de Hugging Face es un repositorio vivo: `main` de hoy no es `main` del mes que viene, y
// un vector generado con otra versión de los pesos no es comparable con los que ya están guardados
// — la búsqueda no falla, devuelve peor y nadie se entera. Cada modelo declara su commit, y ese
// commit viaja con cada vector.
//
// ═══ LA VM MANDA ═══
//
// 4 núcleos, 7 GB, sin GPU. Los modelos se cargan de a uno y a pedido; el que no se usa no ocupa.
// La guarda de RAM es la misma que ya protege a `embeddings.mjs`: si no hay memoria, se declara y
// no se carga — un modelo que tumba la VM es peor que una búsqueda sin vectores.

import { createHash } from 'node:crypto'
import { readFileSync, existsSync } from 'node:fs'
import { normalizar } from './normalizar.mjs'

/**
 * LOS CANDIDATOS. Cada uno con su revisión fijada y su licencia revisada — sin las dos cosas no
 * puede ir a producción, y sin benchmark tampoco.
 *
 * `prefijo` existe porque los modelos e5 fueron entrenados con instrucciones («query:» / «passage:»)
 * y usarlos sin ellas los degrada; los granite y los bge no las llevan. Ponerle a un modelo el
 * prefijo del otro es la forma más rápida de que un buen modelo mida mal en un benchmark.
 */
export const CANDIDATOS = Object.freeze({
  'e5-small': {
    id: 'Xenova/multilingual-e5-small',
    revision: '761b726dd34fb83930e26aab4e9ac3899aa1fa78',
    licencia: 'MIT (modelo base intfloat/multilingual-e5-small)',
    dtype: 'int8', dimensiones: 384, discoMb: 118,
    prefijo: { consulta: 'query: ', documento: 'passage: ' },
    porQue: 'el que ya está instalado: es la línea de base contra la que se mide cualquier cambio',
  },
  'granite-97m': {
    id: 'ibm-granite/granite-embedding-97m-multilingual-r2',
    revision: '835ad14087e140460703cf0fae09f97d469d65c2',
    licencia: 'Apache-2.0',
    dtype: 'q8', dimensiones: 768, discoMb: 98,
    prefijo: { consulta: '', documento: '' },
    porQue: 'multilingüe, Apache-2.0, y su ONNX viene cuantizado para AVX2 — el tamaño exacto de esta VM',
  },
  'bge-m3': {
    id: 'onnx-community/bge-m3-ONNX',
    revision: '25b9af8e87a38eb120cfe87125383677b9cd309e',
    licencia: 'MIT',
    dtype: 'q8', dimensiones: 1024, discoMb: 568,
    prefijo: { consulta: '', documento: '' },
    porQue: 'el más grande que esta VM puede sostener: sirve para saber si el techo está en el modelo o en otro lado',
  },
})

/** Cuánta RAM libre exige cargar un modelo. Debajo de esto NO se carga: una búsqueda sin vectores
 *  es una degradación; una VM sin memoria es una caída. */
const PISO_RAM_MB = Number(process.env.ORQ_ML_PISO_RAM_MB || 1200)

function ramDisponibleMb() {
  try {
    const m = readFileSync('/proc/meminfo', 'utf8').match(/MemAvailable:\s+(\d+) kB/)
    if (m) return Math.round(Number(m[1]) / 1024)
  } catch { /* no es Linux o /proc no está */ }
  // eslint-disable-next-line no-undef
  return Math.round(require('node:os').freemem() / 1048576)
}

const cargados = new Map()

/** Carga un candidato. Perezoso y una sola vez por proceso. */
export async function cargar(clave) {
  const c = CANDIDATOS[clave]
  if (!c) throw new Error(`no hay un candidato declarado con la clave «${clave}»`)
  if (cargados.has(clave)) return cargados.get(clave)

  const libre = ramDisponibleMb()
  if (libre < PISO_RAM_MB) {
    throw new Error(`sin RAM para «${clave}»: quedan ${libre} MB y el piso es ${PISO_RAM_MB} MB`)
  }

  const { pipeline, env } = await import('@huggingface/transformers')
  env.cacheDir = new URL('../../datos/modelos/', import.meta.url).pathname
  const t0 = Date.now()
  const extraer = await pipeline('feature-extraction', c.id, { dtype: c.dtype, revision: c.revision, device: 'cpu' })
  const motor = { clave, ...c, extraer, msCarga: Date.now() - t0, rssMb: Math.round(process.memoryUsage().rss / 1048576) }
  cargados.set(clave, motor)
  return motor
}

/** Suelta un modelo. Sin esto, comparar tres candidatos en un proceso los deja a los tres residentes
 *  y la VM se queda sin memoria a mitad del benchmark. */
export async function soltar(clave) {
  const m = cargados.get(clave)
  if (!m) return false
  await m.extraer?.dispose?.().catch(() => {})
  cargados.delete(clave)
  if (global.gc) global.gc()
  return true
}

/**
 * Embebe textos. `rol` decide el prefijo — y usar el rol equivocado degrada al modelo sin avisar.
 * @param {'consulta'|'documento'} rol
 */
export async function embeber(clave, textos, { rol = 'documento', lote = 8 } = {}) {
  const m = await cargar(clave)
  const lista = Array.isArray(textos) ? textos : [textos]
  const pref = m.prefijo[rol] ?? ''
  const salida = []
  for (let i = 0; i < lista.length; i += lote) {
    const trozo = lista.slice(i, i + lote).map((t) => pref + String(t ?? '').slice(0, 4000))
    const r = await m.extraer(trozo, { pooling: 'mean', normalize: true })
    const d = r.dims.at(-1)
    for (let j = 0; j < trozo.length; j += 1) salida.push(Array.from(r.data.slice(j * d, (j + 1) * d)))
  }
  return Array.isArray(textos) ? salida : salida[0]
}

/** Coseno entre dos vectores YA normalizados: es el producto punto. */
export function coseno(a, b) {
  let s = 0
  for (let i = 0; i < a.length; i += 1) s += a[i] * b[i]
  return s
}

/** El hash del texto embebido. Si el fragmento cambia, el vector queda obsoleto y se ve. */
export const hashTexto = (t) => createHash('sha1').update(String(t ?? '')).digest('hex')

export { normalizar, existsSync }
