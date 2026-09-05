#!/usr/bin/env node
// ¿ACIERTA SigLIP QUÉ ES CADA IMAGEN DEL DRIVE? Con ground truth INDEPENDIENTE del modelo.
//
// La etiqueta no la pongo yo mirando la imagen: sale de la CARPETA en la que el archivo vive, que
// la ordenó una persona por otro motivo y sin saber que iba a servir de examen. Un DNI vive en
// «PERSONAL: ALTAS - BAJAS - HM - EPP - DNI» y un plano en la carpeta de planos de su obra.
// Es la única forma de que el examen no lo escriba el que rinde.
//
//   node orquestador/scripts/vision-benchmark.mjs [--tope 30]

import { query } from '../lib/db.mjs'
import { makeGoogleClient, READONLY_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { clasificarImagen, cargarVision, MODELO } from '../lib/ml/vision.mjs'
import { writeFile, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? Number(process.argv[i + 1]) : d }
const TOPE = arg('--tope', 30)

/** La etiqueta que la CARPETA implica. Null = la carpeta no dice nada y la fila no sirve de examen. */
function etiquetaDeLaCarpeta(name, path) {
  const p = `${path} ${name}`.toLowerCase()
  if (/\bdni\b/.test(p)) return 'dni'
  if (/logo|isotipo/.test(p)) return 'logo'
  if (/gantt|diagrama|cronograma/.test(p)) return 'diagrama'
  if (/plano|conforme a obra|perforaci/.test(p)) return 'plano'
  if (/firma/.test(p)) return 'firma'
  if (/comprobante|factura|recibo|ticket/.test(p)) return 'comprobante'
  return null
}

async function main() {
  const q = await query(`
    select drive_file_id, name, path, size_bytes
      from public.drive_index
     where tipo = 'imagen' and not is_folder and coalesce(size_bytes,0) between 20000 and 8000000
     order by drive_file_id`)

  // `drive_index.tipo = 'imagen'` incluye .dwg, que son planos de CAD: no son imágenes y ninguna
  // librería los abre. Contarlos como fallos del modelo sería culparlo de no leer un formato que
  // nadie le dio.
  const ES_RASTER = /\.(jpe?g|png|webp|gif|bmp|tiff?)$/i
  const conEtiqueta = q.rows
    .filter((r) => ES_RASTER.test(String(r.name)))
    .map((r) => ({ ...r, real: etiquetaDeLaCarpeta(r.name, r.path) })).filter((r) => r.real)
  // Muestra estratificada por etiqueta: si el 80% fueran DNI, acertar siempre «dni» daría 80% y no
  // mediría nada.
  const porClase = new Map()
  for (const r of conEtiqueta) {
    if (!porClase.has(r.real)) porClase.set(r.real, [])
    porClase.get(r.real).push(r)
  }
  const porCada = Math.max(2, Math.floor(TOPE / porClase.size))
  const muestra = [...porClase.values()].flatMap((xs) => xs.filter((_, i) => i % Math.max(1, Math.floor(xs.length / porCada)) === 0).slice(0, porCada))

  console.log(`CORPUS     ${q.rows.length} imágenes · ${conEtiqueta.length} con etiqueta deducible de su carpeta`)
  console.log(`MUESTRA    ${muestra.length} · ${[...porClase].map(([k, v]) => `${k}:${v.length}`).join(' · ')}`)
  const m = await cargarVision()
  console.log(`MODELO     ${MODELO.id} @ ${MODELO.revision.slice(0, 12)} · ${MODELO.licencia}`)
  console.log(`           cargado en ${m.msCarga} ms · RSS ${Math.round(process.memoryUsage().rss / 1048576)} MB\n`)

  const google = makeGoogleClient({ config: loadConfig(), scopes: READONLY_SCOPES })
  const dir = await mkdtemp(join(tmpdir(), 'orq-vis-'))
  let ok = 0, sinDecidir = 0, ms = 0
  const confusion = new Map()

  for (const f of muestra) {
    let ruta
    try {
      const b = await google.descargarBytes(f.drive_file_id)
      ruta = join(dir, `${f.drive_file_id}.img`)
      await writeFile(ruta, b)
    } catch (e) { console.log(`  ✖ ${String(f.name).slice(0, 40)}: ${e.message.slice(0, 40)}`); continue }

    const r = await clasificarImagen(ruta, 'tipoDeImagen', { motor: m })
    ms += r.ms
    const acerto = r.clase === f.real
    if (r.clase === null) sinDecidir += 1
    else if (acerto) ok += 1
    else {
      const k = `${f.real} → ${r.clase}`
      confusion.set(k, (confusion.get(k) ?? 0) + 1)
    }
    console.log(`  ${(acerto ? '✔' : r.clase === null ? '?' : '✖')} ${String(f.name).slice(0, 40).padEnd(41)} real ${String(f.real).padEnd(12)} dijo ${String(r.clase ?? '—').padEnd(12)} ${(r.confianza * 100).toFixed(0)}%`)
  }
  await rm(dir, { recursive: true, force: true })

  const n = muestra.length
  console.log(`\n═══ SOBRE ${n} IMÁGENES REALES ═══`)
  console.log(`  aciertos        ${ok}   ${((ok / n) * 100).toFixed(1)}%`)
  console.log(`  no decidió      ${sinDecidir}   ${((sinDecidir / n) * 100).toFixed(1)}%  (confianza o margen insuficiente)`)
  console.log(`  errores         ${n - ok - sinDecidir}   ${(((n - ok - sinDecidir) / n) * 100).toFixed(1)}%`)
  console.log(`  ${Math.round(ms / Math.max(1, n))} ms por imagen · RSS ${Math.round(process.memoryUsage().rss / 1048576)} MB`)
  if (confusion.size) {
    console.log('\n  DÓNDE SE EQUIVOCA (real → dijo):')
    for (const [k, v] of [...confusion].sort((a, b) => b[1] - a[1])) console.log(`    ${v} × ${k}`)
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().then(() => process.exit(0)).catch((e) => { console.error('ERROR:', e.stack || e.message); process.exit(1) })
}
