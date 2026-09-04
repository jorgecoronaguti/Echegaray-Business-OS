// EL RERANKER: mira la pregunta y el pasaje JUNTOS, que es lo que un embedding no puede hacer.
//
// ═══ POR QUÉ PUEDE APORTAR ALGO QUE EL EMBEDDING NO ═══
//
// Un embedding comprime cada texto a un vector POR SEPARADO y después los compara. Nunca ve la
// pregunta y el documento en la misma pasada, así que no puede notar que «la multa» de la pregunta
// es exactamente la multa de este documento y no la del otro. Un reranker sí: los concatena y
// produce un puntaje de relevancia del par.
//
// El precio es que no escala: hay que correrlo una vez por candidato. Por eso va DESPUÉS del
// recuperador, sobre 20 documentos y no sobre 10.875 — reordena, no busca.
//
// ═══ LICENCIAS: UNA DESCARTADA ANTES DE PROBARLA ═══
//
// `jinaai/jina-reranker-v2-base-multilingual` es el más descargado de su categoría (1,1 M) y está
// bajo CC-BY-NC-4.0: NO COMERCIAL. Esto es el sistema operativo de una empresa que factura. No se
// evalúa siquiera — un modelo que no se puede usar no es un candidato, y medirlo sería gastar la VM
// para producir un número que no se puede aplicar.

/** Los candidatos con licencia compatible. La revisión va clavada: sin ella no se sabe qué corrió. */
export const RERANKERS = Object.freeze({
  'bge-base': {
    id: 'Xenova/bge-reranker-base',
    revision: '280bcc27a84e0b898c251e06fddb25171bd9b101',
    licencia: 'MIT (base BAAI/bge-reranker-base)',
    dtype: 'q8', discoMb: 279,
    porQue: 'el más chico con licencia permisiva que esta VM puede sostener junto al resto',
  },
  'bge-m3': {
    id: 'onnx-community/bge-reranker-v2-m3-ONNX',
    revision: '6f5ff652985168e6d0e1c2ba2b2e2e08a1c37f5f',
    licencia: 'Apache-2.0 (base BAAI/bge-reranker-v2-m3)',
    dtype: 'q8', discoMb: 571,
    porQue: 'multilingüe de verdad y más grande: sirve para saber si el techo está en el tamaño',
  },
})

const cargados = new Map()

export async function cargarReranker(clave) {
  const c = RERANKERS[clave]
  if (!c) throw new Error(`no hay un reranker declarado con la clave «${clave}»`)
  if (cargados.has(clave)) return cargados.get(clave)
  const { AutoTokenizer, AutoModelForSequenceClassification, env } = await import('@huggingface/transformers')
  env.cacheDir = new URL('../../datos/modelos/', import.meta.url).pathname
  const t0 = Date.now()
  const tok = await AutoTokenizer.from_pretrained(c.id, { revision: c.revision })
  const modelo = await AutoModelForSequenceClassification.from_pretrained(c.id, { dtype: c.dtype, revision: c.revision, device: 'cpu' })
  const m = { clave, ...c, tok, modelo, msCarga: Date.now() - t0 }
  cargados.set(clave, m)
  return m
}

export async function soltarReranker(clave) {
  const m = cargados.get(clave)
  if (!m) return false
  await m.modelo?.dispose?.().catch(() => {})
  cargados.delete(clave)
  return true
}

/**
 * Reordena candidatos por relevancia contra la pregunta.
 *
 * @param {string} clave        cuál de los rerankers declarados
 * @param {string} pregunta
 * @param {Array<{id:*, texto:string}>} candidatos
 * @returns {Promise<Array<{id:*, texto:string, puntaje:number}>>} ordenados de mayor a menor
 */
export async function reordenar(clave, pregunta, candidatos = [], { lote = 4, maxLargo = 512 } = {}) {
  if (!candidatos.length) return []
  const m = await cargarReranker(clave)
  const salida = []
  for (let i = 0; i < candidatos.length; i += lote) {
    const trozo = candidatos.slice(i, i + lote)
    const entradas = m.tok(
      trozo.map(() => String(pregunta)),
      { text_pair: trozo.map((c) => String(c.texto ?? '').slice(0, 2000)),
        padding: true, truncation: true, max_length: maxLargo },
    )
    const r = await m.modelo(entradas)
    const logits = r.logits.tolist()
    trozo.forEach((c, j) => salida.push({ ...c, puntaje: Array.isArray(logits[j]) ? logits[j][0] : logits[j] }))
  }
  return salida.sort((a, b) => b.puntaje - a.puntaje)
}
