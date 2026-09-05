// EL MOTOR DE EVALUACIÓN. Un dataset, un motor, una config → métricas reproducibles.
//
// ═══ POR QUÉ ESTO ES UN MÓDULO Y NO UN SCRIPT MÁS ═══
//
// Porque la pregunta que hay que poder contestar dentro de seis meses es «¿el modelo nuevo mejoró?»,
// y eso exige correr EXACTAMENTE la misma evaluación. Cuando cada benchmark se escribe al vuelo
// dentro del script que mide, dos corridas no son comparables y el «mejoró» es una impresión.
//
// Acá el dataset viene de un archivo con versión y hash; el motor es una función; y el resultado se
// guarda con el hash del dataset, así que dos números sólo se comparan si midieron lo mismo.
//
// ═══ MÉTRICAS DE RECUPERACIÓN, Y POR QUÉ ESAS ═══
//
// Top-1 dice si la respuesta correcta salió PRIMERA, que es lo único que importa cuando el
// consumidor muestra una. Recall@k dice si está entre las primeras k, que es lo que importa cuando
// el consumidor arma un contexto. MRR premia estar arriba sin exigir ser primero: es la que mejor
// resume las dos. NDCG no se calcula porque acá cada pregunta tiene UNA respuesta correcta, y con
// relevancia binaria y un solo relevante NDCG es una función monótona del rango — no agrega nada.

import { readFileSync } from 'node:fs'

/** Carga un dataset versionado. Falla ruidosamente: evaluar contra un archivo que no está es peor
 *  que no evaluar, porque devuelve cero y parece un resultado. */
export function cargarDataset(ruta) {
  const d = JSON.parse(readFileSync(ruta, 'utf8'))
  if (!d?.preguntas?.length) throw new Error(`el dataset ${d?.nombre ?? ruta} no tiene preguntas`)
  return d
}

/**
 * Corre un motor sobre un dataset.
 *
 * @param {object} dataset
 * @param {(pregunta:object)=>Promise<string[]>} motor devuelve el ranking de ids
 * @param {{k?:number, limite?:number, etiqueta?:string}} opts
 */
export async function evaluarRecuperacion(dataset, motor, { k = 5, limite = null, etiqueta = 'motor' } = {}) {
  const preguntas = limite ? muestra(dataset.preguntas, limite) : dataset.preguntas
  let top1 = 0, enK = 0, mrr = 0, sinRespuesta = 0, ms = 0
  const porFamilia = new Map()

  for (const p of preguntas) {
    const t0 = Date.now()
    let ranking = []
    try { ranking = await motor(p) } catch { ranking = [] }
    ms += Date.now() - t0
    const pos = ranking.indexOf(p.correcto)
    if (!ranking.length) sinRespuesta += 1
    if (pos === 0) top1 += 1
    if (pos >= 0 && pos < k) enK += 1
    if (pos >= 0) mrr += 1 / (pos + 1)
    const f = porFamilia.get(p.familia) ?? { n: 0, top1: 0, enK: 0 }
    f.n += 1; if (pos === 0) f.top1 += 1; if (pos >= 0 && pos < k) f.enK += 1
    porFamilia.set(p.familia, f)
  }

  const n = preguntas.length || 1
  return {
    etiqueta, dataset: dataset.nombre, version: dataset.version, hash: dataset.hash,
    n: preguntas.length, k,
    top1: top1 / n, recallK: enK / n, mrr: mrr / n, sinRespuesta: sinRespuesta / n,
    msPorConsulta: Math.round(ms / n),
    porFamilia: Object.fromEntries([...porFamilia].map(([f, v]) => [f, { n: v.n, top1: v.top1 / v.n, recallK: v.enK / v.n }])),
  }
}

/** Muestra DETERMINÍSTICA por paso fijo. Aleatoria haría que dos corridas midieran cosas distintas
 *  y la comparación entre modelos incluiría la suerte del muestreo. */
export function muestra(xs, n) {
  if (xs.length <= n) return xs
  const paso = xs.length / n
  return Array.from({ length: n }, (_, i) => xs[Math.floor(i * paso)])
}

/** La tabla comparativa. Ordena por MRR y marca la diferencia contra el primero de la lista, que es
 *  el que se toma como línea de base. */
export function tabla(resultados, { base = null } = {}) {
  const b = base ? resultados.find((r) => r.etiqueta === base) : resultados[0]
  const pc = (x) => `${(x * 100).toFixed(1)}%`.padStart(7)
  const filas = [...resultados].sort((x, y) => y.mrr - x.mrr).map((r) => ({
    motor: r.etiqueta, top1: pc(r.top1), recallK: pc(r.recallK), mrr: pc(r.mrr),
    ms: r.msPorConsulta,
    vsBase: b && r !== b ? `${(r.mrr - b.mrr) >= 0 ? '+' : ''}${((r.mrr - b.mrr) * 100).toFixed(1)} pts` : '—',
  }))
  return filas
}
