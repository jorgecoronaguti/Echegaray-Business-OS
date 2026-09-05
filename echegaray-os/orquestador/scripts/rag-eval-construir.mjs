#!/usr/bin/env node
// EL CONJUNTO DE EVALUACIÓN DE RECUPERACIÓN: `ecsas-rag-eval`, versionado y reproducible.
//
// ═══ POR QUÉ HACE FALTA UNO DE VERDAD ═══
//
// Los benchmarks anteriores se armaban al vuelo dentro del script que medía, y eso trajo dos
// problemas: no se podían repetir idénticos entre corridas, y uno de ellos resultó CIRCULAR —las
// preguntas salían de (tipo, período) y el pipeline filtraba por (tipo, período), o sea que el
// examen lo escribía el que rendía. Un dataset con archivo, versión y procedencia hace visible de
// dónde salió cada pregunta.
//
// ═══ CÓMO SE CONSTRUYE CADA PREGUNTA, Y DE DÓNDE SALE SU RESPUESTA ═══
//
// Tres familias, y ninguna usa el nombre del archivo —si lo usara, el buscador por nombre ganaría
// por construcción y no se estaría midiendo recuperación:
//
//   entidad     por una PERSONA o un beneficiario que aparece adentro del papel. La respuesta es
//               el único documento donde ese nombre figura. Es la familia difícil.
//   importe     por una cifra exacta que el motor documental extrajo. Un importe identifica.
//   contenido   por una frase distintiva del cuerpo, reescrita como pregunta.
//
// Se descarta toda pregunta cuya respuesta no sea ÚNICA: con dos documentos válidos, acertar
// cualquiera sería acertar y la métrica diría más de lo que sabe.
//
//   node orquestador/scripts/rag-eval-construir.mjs [--salida datos/ml/ecsas-rag-eval.json]

import { writeFile, mkdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { dirname } from 'node:path'
import { query } from '../lib/db.mjs'

const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d }
const SALIDA = arg('--salida', new URL('../datos/ml/ecsas-rag-eval.json', import.meta.url).pathname)
export const VERSION = 1

const RE_PERSONA = /\b([A-ZÁÉÍÓÚÑ]{3,}(?:\s+[A-ZÁÉÍÓÚÑ]{2,}){1,3}),\s*([A-ZÁÉÍÓÚÑ]{3,}(?:\s+[A-ZÁÉÍÓÚÑ]{2,}){0,3})\b/
const RE_BENEF = /Beneficiario:\s*([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\s]{8,50})/

async function main() {
  const docs = await query(`
    select l.drive_file_id, l.nombre, l.tipo, l.campos, l.sensibilidad,
           string_agg(f.texto, ' ' order by f.pagina, f.orden) texto
      from public.documento_leido l
      join public.documento_fragmento f using (drive_file_id)
     where l.error is null
     group by 1,2,3,4,5`)

  const preguntas = []
  const usar = (texto, correcto, familia, extra = {}) => preguntas.push({ texto, correcto, familia, ...extra })

  // ── FAMILIA 1 · POR PERSONA ──
  const porPersona = new Map()
  for (const d of docs.rows) {
    const b = String(d.texto).match(RE_BENEF)
    const m = b ? [null, b[1].trim(), ''] : String(d.texto).match(RE_PERSONA)
    if (!m) continue
    const p = `${m[1]} ${m[2]}`.replace(/\s+/g, ' ').trim()
    if (p.length < 8) continue
    if (!porPersona.has(p)) porPersona.set(p, new Set())
    porPersona.get(p).add(d.drive_file_id)
  }
  for (const [persona, ids] of porPersona) {
    if (ids.size !== 1) continue
    usar(`el papel de ${persona}`, [...ids][0], 'entidad')
  }

  // ── FAMILIA 2 · POR IMPORTE EXACTO ──
  const porImporte = new Map()
  for (const d of docs.rows) {
    const t = Number(d.campos?.total)
    if (!Number.isFinite(t) || t < 10000) continue
    const k = Math.round(t)
    if (!porImporte.has(k)) porImporte.set(k, new Set())
    porImporte.get(k).add(d.drive_file_id)
  }
  for (const [imp, ids] of porImporte) {
    if (ids.size !== 1) continue
    usar(`el comprobante de $${imp.toLocaleString('es-AR')}`, [...ids][0], 'importe')
  }

  // ── FAMILIA 3 · POR UNA FRASE DISTINTIVA DEL CUERPO ──
  // Se busca una línea que aparezca en UN solo documento y tenga sustancia: ni plantilla repetida
  // ni un número suelto.
  const frecuencia = new Map()
  const candidatas = []
  for (const d of docs.rows) {
    for (const linea of String(d.texto).split(/[\n.]/).map((x) => x.trim())) {
      if (linea.length < 25 || linea.length > 90) continue
      const letras = (linea.match(/[a-záéíóúñA-ZÁÉÍÓÚÑ]/g) ?? []).length
      if (letras / linea.length < 0.6) continue
      const k = linea.toLowerCase()
      frecuencia.set(k, (frecuencia.get(k) ?? 0) + 1)
      candidatas.push({ linea, k, id: d.drive_file_id })
    }
  }
  const vistos = new Set()
  for (const c of candidatas) {
    if (frecuencia.get(c.k) !== 1 || vistos.has(c.id)) continue
    vistos.add(c.id)
    usar(`¿qué documento dice «${c.linea}»?`, c.id, 'contenido')
  }

  const dataset = {
    nombre: 'ecsas-rag-eval',
    version: VERSION,
    creado: new Date().toISOString().slice(0, 10),
    procedencia: 'public.documento_leido + documento_fragmento del OS. Cada pregunta sale del CONTENIDO del documento, nunca de su nombre de archivo.',
    sensibilidad: 'CONFIDENCIAL — contiene nombres de personas y importes reales. NO se sube a ningún lado.',
    corpus: { documentos: docs.rows.length },
    familias: Object.fromEntries([...new Set(preguntas.map((p) => p.familia))]
      .map((f) => [f, preguntas.filter((p) => p.familia === f).length])),
    total: preguntas.length,
    hash: createHash('sha1').update(JSON.stringify(preguntas)).digest('hex').slice(0, 12),
    preguntas,
  }

  await mkdir(dirname(SALIDA), { recursive: true })
  await writeFile(SALIDA, JSON.stringify(dataset, null, 1))
  console.log(`ecsas-rag-eval v${VERSION} · ${dataset.total} preguntas · hash ${dataset.hash}`)
  console.log(`  ${Object.entries(dataset.familias).map(([k, v]) => `${k}: ${v}`).join(' · ')}`)
  console.log(`  sobre ${docs.rows.length} documentos · escrito en ${SALIDA}`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().then(() => process.exit(0)).catch((e) => { console.error('ERROR:', e.stack || e.message); process.exit(1) })
}
