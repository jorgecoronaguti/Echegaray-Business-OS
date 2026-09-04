#!/usr/bin/env node
// ¿CUÁNTO DEL DRIVE SE PUEDE LEER SIN UN SOLO MODELO? La medición que decide el pipeline entero.
//
// ═══ POR QUÉ ESTA MEDICIÓN VA PRIMERO ═══
//
// El Drive tiene 3.045 PDF. Un OCR local en esta VM —4 núcleos, sin GPU— cuesta segundos de CPU por
// página; Claude cuesta plata por página. Si resulta que el 90% de esos PDF ya trae su texto
// escrito, el motor documental es casi gratis y procesarlo entero es una tarde. Si resulta que el
// 90% son escaneos, es otro proyecto y hay que decirlo antes de empezarlo, no después.
//
// Nadie puede contestar esto mirando el catálogo de Hugging Face. Se contesta bajando documentos
// reales y abriéndolos.
//
// ═══ LA MUESTRA ES ESTRATIFICADA, NO LOS PRIMEROS N ═══
//
// Los primeros N por fecha serían todos del mismo lote y del mismo emisor. Se toman N de cada
// CARPETA RAÍZ del Drive, que es como está organizado el negocio: administración, obras, legales,
// personal. Una muestra sesgada mide el sesgo.
//
//   node orquestador/scripts/documentos-benchmark.mjs [--por-area 6] [--max-paginas 4]

import { makeGoogleClient, READONLY_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { query } from '../lib/db.mjs'
import { leerDocumento } from '../lib/documentos/leer.mjs'

const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? Number(process.argv[i + 1]) : d }
const POR_AREA = arg('--por-area', 6)
const MAX_PAGINAS = arg('--max-paginas', 4)

/**
 * El área de un documento son sus DOS primeras carpetas.
 *
 * Con una sola, el Drive entero se reparte en tres montones y la muestra queda ciega: los recibos
 * de sueldo y los planos de estructura caen los dos en «administracion». El segundo nivel es donde
 * de verdad se separa un tipo documental de otro.
 */
const areaDe = (path) => String(path ?? '').split('/').filter(Boolean).slice(0, 2).join('/') || '(raíz)'

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: READONLY_SCOPES })

  const q = await query(`
    select drive_file_id, name, path, mime_type, size_bytes
      from public.drive_index
     where not is_folder and tipo in ('pdf', 'imagen') and coalesce(size_bytes, 0) between 1000 and 25000000
     order by drive_file_id`)
  const porArea = new Map()
  for (const f of q.rows) {
    const a = areaDe(f.path)
    if (!porArea.has(a)) porArea.set(a, [])
    porArea.get(a).push(f)
  }
  // De cada área se toman los más grandes y los más chicos: un PDF de 8 KB y uno de 4 MB no se
  // parecen en nada, y tomar sólo el medio esconde los dos extremos donde están los problemas.
  const muestra = []
  for (const [a, fs] of porArea) {
    fs.sort((x, y) => (x.size_bytes ?? 0) - (y.size_bytes ?? 0))
    const k = Math.min(POR_AREA, fs.length)
    const paso = Math.max(1, Math.floor(fs.length / k))
    for (let i = 0; i < k; i += 1) muestra.push({ ...fs[i * paso], area: a })
  }

  console.log(`CORPUS     ${q.rows.length} documentos en el índice · ${porArea.size} áreas (dos niveles de carpeta)`)
  console.log(`MUESTRA    ${muestra.length} documentos (hasta ${POR_AREA} por área, ${MAX_PAGINAS} páginas cada uno)\n`)

  const r = { conTexto: 0, sinTexto: 0, mixtos: 0, fallaron: 0, msTotal: 0, caracteres: 0, tablas: 0, paginas: 0 }
  const porAreaR = new Map()
  const fallos = []

  for (const f of muestra) {
    const t0 = Date.now()
    let bytes
    try {
      bytes = await google.descargarBytes(f.drive_file_id)
    } catch (e) {
      r.fallaron += 1; fallos.push(`${f.name}: descarga ${e.message.slice(0, 50)}`); continue
    }
    const d = await leerDocumento(bytes, { nombre: f.name, mimeDeclarado: f.mime_type, maxPaginas: MAX_PAGINAS })
    const ms = Date.now() - t0
    r.msTotal += ms

    const acc = porAreaR.get(f.area) ?? { con: 0, sin: 0, falla: 0 }
    if (!d.ok) { r.fallaron += 1; acc.falla += 1; fallos.push(`${f.name}: ${d.porQue}`) }
    else if (d.necesitaOcr) { r.sinTexto += 1; acc.sin += 1 }
    else {
      r.conTexto += 1; acc.con += 1
      r.caracteres += d.caracteres; r.tablas += d.tablas.length; r.paginas += d.paginasLeidas
      if (d.mixto) r.mixtos += 1
    }
    porAreaR.set(f.area, acc)
    const marca = !d.ok ? '✖' : d.necesitaOcr ? 'OCR' : d.mixto ? '~' : '✔'
    console.log(`  ${marca.padEnd(4)} ${String(f.area).slice(0, 18).padEnd(19)} ${String(f.name).slice(0, 44).padEnd(45)} ${String(d.caracteres ?? 0).padStart(6)} car · ${d.tablas?.length ?? 0} tablas · ${String(ms).padStart(5)} ms`)
  }

  const n = muestra.length
  const p = (x) => `${((x / n) * 100).toFixed(1)}%`
  console.log(`\n═══ RESULTADO SOBRE ${n} DOCUMENTOS REALES ═══`)
  console.log(`  con capa de texto (GRATIS)   ${String(r.conTexto).padStart(3)}   ${p(r.conTexto)}   ${r.mixtos} de ellos mixtos`)
  console.log(`  escaneos (NECESITAN OCR)     ${String(r.sinTexto).padStart(3)}   ${p(r.sinTexto)}`)
  console.log(`  no se pudieron abrir         ${String(r.fallaron).padStart(3)}   ${p(r.fallaron)}`)
  console.log(`  ${r.caracteres.toLocaleString('es-AR')} caracteres y ${r.tablas} tablas extraídos de ${r.paginas} páginas`)
  console.log(`  ${Math.round(r.msTotal / Math.max(1, n))} ms por documento (incluye la descarga de Drive)`)

  console.log('\n  POR ÁREA:')
  for (const [a, v] of [...porAreaR].sort((x, y) => (y[1].con + y[1].sin) - (x[1].con + x[1].sin))) {
    const t = v.con + v.sin + v.falla
    console.log(`    ${String(a).slice(0, 26).padEnd(27)} texto ${String(v.con).padStart(2)}/${t}  ·  OCR ${v.sin}  ·  falla ${v.falla}`)
  }
  if (fallos.length) {
    console.log('\n  LOS QUE NO SE PUDIERON ABRIR:')
    for (const f of fallos.slice(0, 12)) console.log(`    · ${f}`)
  }

  const proyectado = Math.round((r.sinTexto / Math.max(1, r.conTexto + r.sinTexto)) * q.rows.length)
  console.log(`\n  PROYECCIÓN al corpus entero: ~${q.rows.length - proyectado} PDF leíbles sin modelo · ~${proyectado} necesitarían OCR.`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().then(() => process.exit(0)).catch((e) => { console.error('ERROR:', e.stack || e.message); process.exit(1) })
}
