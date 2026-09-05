#!/usr/bin/env node
// LOS CUATRO MOTORES CONTRA `ecsas-rag-eval`. Es la corrida que decide si el reranker entra.
//
//   node orquestador/scripts/rag-evaluar.mjs [--n 120] [--con-reranker]

import { query } from '../lib/db.mjs'
import { cargarDataset, evaluarRecuperacion, tabla } from '../lib/ml/evaluacion.mjs'
import { buscarEnContenido } from '../lib/drive-busqueda/contenido.mjs'
import { recuperar } from '../lib/ml/recuperar.mjs'
import { reordenar, cargarReranker } from '../lib/ml/reranker.mjs'

const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? Number(process.argv[i + 1]) : d }
const N = arg('--n', 120)
const CON_RERANKER = process.argv.includes('--con-reranker')
const RUTA = new URL('../datos/ml/ecsas-rag-eval.json', import.meta.url).pathname
const eje = (sql, p) => query(sql, p)

async function main() {
  const ds = cargarDataset(RUTA)
  console.log(`DATASET    ${ds.nombre} v${ds.version} · hash ${ds.hash} · ${ds.total} preguntas`)
  console.log(`           familias: ${Object.entries(ds.familias).map(([k, v]) => `${k} ${v}`).join(' · ')}`)
  console.log(`MUESTRA    ${Math.min(N, ds.total)} preguntas (paso fijo: dos corridas miden lo mismo)\n`)

  const r = []
  r.push(await evaluarRecuperacion(ds, async (p) => {
    const x = await buscarEnContenido(eje, p.texto, { limite: 20 })
    return x.documentos.map((d) => d.driveFileId)
  }, { limite: N, etiqueta: 'léxico (producción anterior)' }))

  r.push(await evaluarRecuperacion(ds, async (p) => {
    // SIN reranker tambien: si no, esta variante lo incluye y su numero es identico al de
    // produccion, que es lo que paso en la primera corrida. Una etiqueta que miente sobre lo que
    // midio es peor que una variante de menos.
    const x = await recuperar(eje, p.texto, { limite: 20, usarVector: false, usarReranker: false })
    return x.documentos.map((d) => d.driveFileId)
  }, { limite: N, etiqueta: 'filtros + léxico (sin reranker)' }))

  r.push(await evaluarRecuperacion(ds, async (p) => {
    const x = await recuperar(eje, p.texto, { limite: 20, usarReranker: false })
    return x.documentos.map((d) => d.driveFileId)
  }, { limite: N, etiqueta: 'híbrido sin reranker' }))

  // EL PIPELINE COMPLETO tal como queda en produccion: el reranker corre SOLO donde midio que
  // ayuda. Correrlo siempre daba +2,6 puntos globales y escondia que arruinaba dos de las tres
  // familias de preguntas.
  r.push(await evaluarRecuperacion(ds, async (p) => {
    const x = await recuperar(eje, p.texto, { limite: 20 })
    return x.documentos.map((d) => d.driveFileId)
  }, { limite: N, etiqueta: 'PRODUCCIÓN (reranker ruteado)' }))

  if (CON_RERANKER) {
    const m = await cargarReranker('bge-base')
    console.log(`RERANKER   ${m.id} @ ${m.revision.slice(0, 12)} · ${m.licencia} · cargado en ${m.msCarga} ms\n`)
    r.push(await evaluarRecuperacion(ds, async (p) => {
      const x = await recuperar(eje, p.texto, { limite: 10 })
      if (x.documentos.length < 2) return x.documentos.map((d) => d.driveFileId)
      // EL RERANKER TIENE QUE VER EL PASAJE, no un resumen: medido, con el extracto pierde 7,7
      // puntos y con el texto real gana 6,0. Se le da el primer fragmento de cada candidato.
      const t = await eje(`select drive_file_id, texto from public.documento_fragmento
                            where drive_file_id = any($1::text[]) and orden = 0`,
      [x.documentos.map((d) => d.driveFileId)])
      const porId = new Map(t.rows.map((y) => [y.drive_file_id, y.texto]))
      const ro = await reordenar('bge-base', p.texto,
        x.documentos.map((d) => ({ id: d.driveFileId, texto: porId.get(d.driveFileId) ?? d.nombre })))
      return ro.map((y) => y.id)
    }, { limite: N, etiqueta: 'híbrido + reranker HF' }))
  }

  console.log('MOTOR                             Top-1  Recall@5     MRR    ms   vs base')
  console.log('─'.repeat(78))
  for (const f of tabla(r, { base: 'léxico (producción anterior)' })) {
    console.log(`${f.motor.padEnd(33)}${f.top1} ${f.recallK}  ${f.mrr}  ${String(f.ms).padStart(4)}   ${f.vsBase}`)
  }

  console.log('\nPOR FAMILIA DE PREGUNTA (Top-1):')
  const fams = [...new Set(r.flatMap((x) => Object.keys(x.porFamilia)))]
  console.log(`  ${''.padEnd(33)}${fams.map((f) => f.padStart(12)).join('')}`)
  for (const x of r) {
    console.log(`  ${x.etiqueta.padEnd(33)}${fams.map((f) => `${((x.porFamilia[f]?.top1 ?? 0) * 100).toFixed(0)}%`.padStart(12)).join('')}`)
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().then(() => process.exit(0)).catch((e) => { console.error('ERROR:', e.stack || e.message); process.exit(1) })
}
