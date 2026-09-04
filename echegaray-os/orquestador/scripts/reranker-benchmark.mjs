#!/usr/bin/env node
// ¿VALE LA PENA REORDENAR? Se contesta midiendo, y el costo entra en la cuenta.
//
// El reranker mira la pregunta y el pasaje JUNTOS, cosa que un embedding no puede. A cambio hay que
// correrlo una vez por candidato: si mejora dos puntos y multiplica la latencia por veinte, la
// respuesta correcta es no usarlo. Acá se miden las dos cosas sobre las mismas preguntas reales.
//
//   node orquestador/scripts/reranker-benchmark.mjs [--reranker bge-base] [--preguntas 12] [--candidatos 10]

import { query } from '../lib/db.mjs'
import { recuperar } from '../lib/ml/recuperar.mjs'
import { reordenar, RERANKERS, cargarReranker } from '../lib/ml/reranker.mjs'

const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d }
const RERANKER = arg('--reranker', 'bge-base')
const MAX = Number(arg('--preguntas', 12))
const CAND = Number(arg('--candidatos', 10))

/** Las mismas preguntas por persona del benchmark de recuperación: son las que el filtro no puede
 *  contestar solo, o sea donde reordenar podría aportar algo. */
async function preguntas() {
  const q = await query(`
    select l.drive_file_id, l.nombre, l.tipo, f.texto
      from public.documento_leido l
      join public.documento_fragmento f using (drive_file_id)
     where l.tipo in ('recibo_sueldo','comprobante_pago','libro_sueldos','factura')
       and l.error is null and f.orden = 0
     order by l.drive_file_id`)
  const RE_PERSONA = /\b([A-ZÁÉÍÓÚÑ]{3,}(?:\s+[A-ZÁÉÍÓÚÑ]{2,}){1,3}),\s*([A-ZÁÉÍÓÚÑ]{3,}(?:\s+[A-ZÁÉÍÓÚÑ]{2,}){0,3})\b/
  const RE_BENEF = /Beneficiario:\s*([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\s]{8,50})/
  const por = new Map()
  for (const d of q.rows) {
    const b = String(d.texto).match(RE_BENEF)
    const m = b ? [null, b[1].trim(), ''] : String(d.texto).match(RE_PERSONA)
    if (!m) continue
    const p = `${m[1]} ${m[2]}`.replace(/\s+/g, ' ').trim()
    if (p.length < 8) continue
    if (!por.has(p)) por.set(p, [])
    por.get(p).push(d)
  }
  return [...por].filter(([, ds]) => ds.length === 1)
    .map(([p, ds]) => ({ texto: `el papel de ${p}`, correcto: ds[0].drive_file_id })).slice(0, MAX)
}

const met = (rs) => {
  let t1 = 0, r3 = 0, mrr = 0
  for (const r of rs) {
    const i = r.ranking.indexOf(r.correcto)
    if (i === 0) t1 += 1
    if (i >= 0 && i < 3) r3 += 1
    if (i >= 0) mrr += 1 / (i + 1)
  }
  const n = rs.length || 1
  return { top1: t1 / n, recall3: r3 / n, mrr: mrr / n }
}

async function main() {
  const ps = await preguntas()
  const c = RERANKERS[RERANKER]
  console.log(`CONJUNTO   ${ps.length} preguntas · ${CAND} candidatos a reordenar`)
  console.log(`RERANKER   ${c.id} @ ${c.revision.slice(0, 12)} · ${c.licencia}\n`)

  const eje = (sql, p) => query(sql, p)
  const antes = [], despues = []
  let msRec = 0, msRer = 0

  const m = await cargarReranker(RERANKER)
  console.log(`           cargado en ${m.msCarga} ms · RSS ${Math.round(process.memoryUsage().rss / 1048576)} MB\n`)

  for (const p of ps) {
    const t0 = Date.now()
    const r = await recuperar(eje, p.texto, { limite: CAND })
    msRec += Date.now() - t0
    const ranking = r.documentos.map((d) => d.driveFileId)
    antes.push({ correcto: p.correcto, ranking })

    // EL RERANKER TIENE QUE VER EL PASAJE, NO UN RESUMEN.
    // Primera version: se le pasaba `nombre + extracto`, unas veinte palabras con las coincidencias
    // marcadas. Sobre eso no puede hacer lo unico que sabe hacer —leer la pregunta y el texto en la
    // misma pasada— y perdia 7,7 puntos de MRR. Condenarlo con esa medicion habria sido condenarlo
    // por como se lo llamo. Ahora recibe el texto real del primer fragmento del documento.
    const textos = await query(
      `select drive_file_id, texto from public.documento_fragmento
        where drive_file_id = any($1::text[]) and orden = 0`,
      [r.documentos.map((d) => d.driveFileId)])
    const porId = new Map(textos.rows.map((x) => [x.drive_file_id, x.texto]))
    const t1 = Date.now()
    const reordenado = await reordenar(RERANKER, p.texto,
      r.documentos.map((d) => ({ id: d.driveFileId, texto: porId.get(d.driveFileId) ?? d.nombre })))
    msRer += Date.now() - t1
    despues.push({ correcto: p.correcto, ranking: reordenado.map((x) => x.id) })
  }

  const a = met(antes), b = met(despues)
  const pc = (x) => `${(x * 100).toFixed(1)}%`.padStart(7)
  console.log('                        Top-1  Recall@3     MRR   ms/consulta')
  console.log('─'.repeat(62))
  console.log(`recuperación          ${pc(a.top1)}  ${pc(a.recall3)}  ${pc(a.mrr)}   ${String(Math.round(msRec / ps.length)).padStart(8)}`)
  console.log(`+ reranker            ${pc(b.top1)}  ${pc(b.recall3)}  ${pc(b.mrr)}   ${String(Math.round((msRec + msRer) / ps.length)).padStart(8)}`)
  const dMrr = (b.mrr - a.mrr) * 100
  const veces = (msRec + msRer) / Math.max(1, msRec)
  console.log(`\nDIFERENCIA  MRR ${dMrr >= 0 ? '+' : ''}${dMrr.toFixed(1)} puntos · la consulta tarda ${veces.toFixed(1)}× · +${Math.round(c.discoMb)} MB de disco`)
  console.log(dMrr > 5
    ? '\nVEREDICTO: mejora material. Pasa a candidato para el pipeline.'
    : dMrr > 0
      ? '\nVEREDICTO: mejora marginal. No justifica el costo por consulta ni la RAM residente.'
      : '\nVEREDICTO: NO mejora. Queda deprecado con esta evidencia.')
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().then(() => process.exit(0)).catch((e) => { console.error('ERROR:', e.stack || e.message); process.exit(1) })
}
