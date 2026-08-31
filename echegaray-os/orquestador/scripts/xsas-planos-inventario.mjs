#!/usr/bin/env node
// ¿HAY PLANOS DE VERDAD, Y SE PUEDEN ABRIR? La pregunta se contesta con archivos, no con adjetivos.
//
//   node orquestador/scripts/xsas-planos-inventario.mjs              # el inventario de todo Drive
//   node orquestador/scripts/xsas-planos-inventario.mjs quattropani  # y además abre los de un proyecto
//   node orquestador/scripts/xsas-planos-inventario.mjs --abrir 6    # cuántos abrir como máximo
//
// ═══ POR QUÉ EXISTE ═══
//
// «¿Existen PDF vectoriales, raster, DWG, DXF o imágenes REALES accesibles?» es una pregunta de
// hecho, y contestarla de memoria —o peor, fabricando un DWG de prueba para tener un verde— es la
// forma más barata de mentir sobre una capacidad. Este script barre `drive_index`, dice qué hay y
// DÓNDE, y después ABRE una muestra para que la respuesta no sea «hay 22 DWG» sino «se abrieron N
// de 22 y éstas son las entidades que salieron».
//
// ═══ UN CONTROL QUE NO PUEDE DECIR QUE NO NO ES UN CONTROL ═══
//
// La clase de un PDF —VECTORIAL, RASTER, MIXTO, TEXTO, VACIO— la mide `clasificarPagina` sobre
// trazos, caracteres e imágenes. Si TODOS los PDF del corpus dieran la misma clase, ese clasificador
// sería una constante disfrazada de medición. Por eso el informe cuenta cuántas clases DISTINTAS
// aparecieron: es la prueba de que el control puede dar más de una respuesta.
//
// La ESCALA no se infiere en ningún caso: cuando una cota o una escala no se puede defender, el
// resultado es FALTA_DATO. Este script no calcula ninguna dimensión — sólo dice qué se pudo abrir.

import { loadConfig } from '../lib/config.mjs'
import { query, closePool } from '../lib/db.mjs'
import { makeGoogleClient } from '../lib/google.mjs'
import { leerPdf } from '../lib/ingesta/pdf.mjs'
import { abrirDwg } from '../lib/ingesta/dwg.mjs'
import { textoDeDxf, medirDxf } from '../lib/ingesta/dxf.mjs'
import { formatoDe, FORMATO } from '../lib/ingesta/registro.mjs'

const args = process.argv.slice(2)
const termino = args.find((a) => !a.startsWith('--')) ?? null
const limite = Number(args.includes('--abrir') ? args[args.indexOf('--abrir') + 1] : 6) || 6

const linea = (t) => console.log(t)
const titulo = (t) => console.log(`\n── ${t} ──`)

console.log('\n═══ QUÉ PLANOS EXISTEN DE VERDAD EN EL DRIVE DE LA EMPRESA ═══')

titulo('EL INVENTARIO, POR EXTENSIÓN (fuente: public.drive_index)')
const ext = await query(`
  select lower(substring(name from '\\.[A-Za-z0-9]+$')) ext, count(*)::int n, sum(size_bytes)::bigint bytes
    from public.drive_index where is_folder = false
   group by 1 order by n desc`)
const interesan = new Set(['.pdf', '.dwg', '.dxf', '.jpg', '.jpeg', '.png', '.tif', '.tiff', '.heic', '.webp'])
for (const f of ext.rows.filter((r) => interesan.has(r.ext))) {
  linea(`  ${String(f.ext).padEnd(8)} ${String(f.n).padStart(5)} archivo(s)  ${(Number(f.bytes) / 1e6).toFixed(1)} MB`)
}
const faltantes = [...interesan].filter((e) => !ext.rows.some((r) => r.ext === e))
linea(`  formatos SIN un solo archivo en Drive: ${faltantes.join(' ') || '(ninguno)'}`)
linea('  Eso NO es una limitación del lector: es que no existen. Fabricar uno para tener un verde')
linea('  probaría que el fabricante sabe fabricar archivos, no que el circuito sabe cotizar.')

titulo('DÓNDE ESTÁN LOS CAD')
const cad = await query(`
  select path, size_bytes, split_part(replace(path, 'administracion/PRESUPUESTOS - CLIENTES/', ''), '/', 1) cliente
    from public.drive_index
   where is_folder = false and (name ilike '%.dwg' or name ilike '%.dxf') order by path`)
const porCliente = new Map()
for (const r of cad.rows) porCliente.set(r.cliente, (porCliente.get(r.cliente) ?? 0) + 1)
linea(`  ${cad.rows.length} archivo(s) CAD en ${porCliente.size} proyecto(s): ${[...porCliente.entries()].map(([c, n]) => `${c}×${n}`).join(' · ')}`)

if (!termino) {
  linea('\n  (sin término: no se abrió ningún archivo. Pasá un proyecto para que además los abra.)')
  await closePool()
  process.exit(0)
}

// ── ABRIR UNA MUESTRA REAL DEL PROYECTO PEDIDO ───────────────────────────────────────────────
const t = `%${termino.toLowerCase()}%`
const suyos = (await query(
  `select drive_file_id, name, path, mime_type, size_bytes from public.drive_index
    where is_folder = false and (path_norm like $1 or nombre_norm like $1) order by path`, [t])).rows
const google = makeGoogleClient({ config: loadConfig() })

titulo(`ABRIENDO LOS CAD DE «${termino.toUpperCase()}»`)
const cads = suyos.filter((d) => [FORMATO.DWG, FORMATO.DXF].includes(formatoDe({ nombre: d.name, mime: d.mime_type })))
let cadAbiertos = 0
for (const d of cads.slice(0, limite)) {
  try {
    const bytes = await google.descargarBytes(d.drive_file_id)
    const r = /\.dxf$/i.test(d.name)
      ? { ok: true, medicion: medirDxf(textoDeDxf(bytes).texto), version: { version: 'DXF', firma: '—' } }
      : await abrirDwg(bytes, { nombre: d.name })
    if (!r.ok) { linea(`  ✖ ${d.name}: ${r.porQue}`); continue }
    cadAbiertos++
    const m = r.medicion ?? {}
    // `version` es `{ firma, version, conocida }`, no una cadena: interpolarlo directo daba
    // «[object Object]», que es la forma de no decir nada ocupando lugar.
    linea(`  ✔ ${d.name} (${r.version?.version ?? '?'} · firma ${r.version?.firma ?? '?'}) · ${m.entidades ?? 0} entidad(es) · ${(m.capas ?? []).length} capa(s) · ${(m.cotas ?? []).length} cota(s) · unidad declarada: ${m.unidad ?? 'NO DECLARADA'}`)
    if (!(m.cotas ?? []).length) linea('      sin cotas: nada que medir de acá sin inventar la escala → FALTA_DATO')
  } catch (e) { linea(`  ✖ ${d.name}: ${String(e?.message ?? e).slice(0, 140)}`) }
}
if (!cads.length) linea('  el proyecto no tiene ningún archivo CAD')

titulo(`CLASIFICANDO LOS PDF DE «${termino.toUpperCase()}»`)
const pdfs = suyos.filter((d) => formatoDe({ nombre: d.name, mime: d.mime_type }) === FORMATO.PDF)
const clases = new Map()
for (const d of pdfs.slice(0, limite * 3)) {
  try {
    const bytes = await google.descargarBytes(d.drive_file_id)
    const doc = await leerPdf(bytes, { conGeometria: true, hasta: 3 })
    const trazos = doc.leidas.reduce((a, p) => a + p.trazos.length, 0)
    const chars = doc.leidas.reduce((a, p) => a + p.caracteres, 0)
    const imgs = doc.leidas.reduce((a, p) => a + p.imagenes.length, 0)
    clases.set(doc.clase, (clases.get(doc.clase) ?? 0) + 1)
    linea(`  ${String(doc.clase).padEnd(10)} ${String(d.name).slice(0, 52).padEnd(54)} ${doc.paginas} pág · ${trazos} trazo(s) · ${chars} car · ${imgs} imagen(es)`)
  } catch (e) { linea(`  ✖ ${d.name}: ${String(e?.message ?? e).slice(0, 120)}`) }
}

titulo('LO MEDIDO')
linea(`  cad_en_drive                   ${String(cad.rows.length).padStart(6)}  MEDIDO`)
linea(`  cad_del_proyecto_abiertos      ${String(cadAbiertos).padStart(6)}  ${cads.length ? 'MEDIDO' : 'NO_APLICA'} (de ${Math.min(cads.length, limite)} intentados, ${cads.length} en total)`)
linea(`  pdf_clasificados               ${String([...clases.values()].reduce((a, b) => a + b, 0)).padStart(6)}  ${pdfs.length ? 'MEDIDO' : 'NO_APLICA'}`)
linea(`  clases_de_pdf_distintas        ${String(clases.size).padStart(6)}  MEDIDO — ${[...clases.entries()].map(([c, n]) => `${c}×${n}`).join(' · ') || 'ninguna'}`)
if (clases.size <= 1) {
  linea('  ⚠ el clasificador de PDF devolvió UNA SOLA clase en esta muestra: sobre este proyecto NO se')
  linea('    puede afirmar que sabe distinguir vectorial de raster. Hace falta correrlo sobre un')
  linea('    proyecto con planos escaneados para probar que puede dar la otra respuesta.')
}

// ── ¿PUEDE EL CLASIFICADOR DECIR «RASTER»? ───────────────────────────────────────────────────
// Sobre Quattropani devuelve TEXTO y VECTORIAL y nunca RASTER. Con esa evidencia sola no se puede
// afirmar que sepa reconocer un escaneo: puede ser que este proyecto no tenga ninguno, o puede ser
// que la rama RASTER esté muerta. La diferencia se resuelve barriendo OTROS proyectos, no
// razonando. `--barrer N` clasifica N PDF tomados de todo el Drive y dice qué clases salieron.
if (args.includes('--barrer')) {
  const cuantos = Number(args[args.indexOf('--barrer') + 1]) || 40
  titulo(`BARRIENDO ${cuantos} PDF DE TODO EL DRIVE — ¿puede salir RASTER?`)
  const muestra = (await query(
    `select drive_file_id, name, path from public.drive_index
      where is_folder = false and name ilike '%.pdf' and size_bytes between 50000 and 8000000
      order by md5(drive_file_id) limit $1`, [cuantos])).rows
  const g = new Map()
  for (const d of muestra) {
    try {
      const bytes = await google.descargarBytes(d.drive_file_id)
      const doc = await leerPdf(bytes, { conGeometria: true, hasta: 2 })
      g.set(doc.clase, [...(g.get(doc.clase) ?? []), d.name])
    } catch { g.set('NO_ABRE', [...(g.get('NO_ABRE') ?? []), d.name]) }
  }
  for (const [c, ns] of [...g.entries()].sort((a, b) => b[1].length - a[1].length)) {
    linea(`  ${String(c).padEnd(10)} ${String(ns.length).padStart(3)} · p.ej. ${ns.slice(0, 2).map((n) => n.slice(0, 44)).join(' | ')}`)
  }
  linea(`  clases distintas en el barrido: ${[...g.keys()].filter((k) => k !== 'NO_ABRE').join(' · ')}`)
  linea(`  ${g.has('RASTER') ? '✔ el clasificador SÍ puede decir RASTER: no es una constante' : '✖ RASTER no apareció en esta muestra: sigue sin probarse que la rama pueda dar esa respuesta'}`)
}

await closePool()
