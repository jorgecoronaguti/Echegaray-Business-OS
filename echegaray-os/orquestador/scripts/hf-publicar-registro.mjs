#!/usr/bin/env node
// PUBLICA EL REGISTRO DE MODELOS Y LOS MANIFIESTOS DE EVALUACIÓN EN UN REPO PRIVADO DE HF.
//
// ═══ POR QUÉ ESTO VALE LA PENA Y NO ES «USAR HF PORQUE SÍ» ═══
//
// Si la VM se pierde, los DATOS se recuperan: están en el Sheet, en Drive y en Postgres. Lo que no
// se puede reconstruir es la HISTORIA DE MEDICIONES — qué modelos se evaluaron, con qué revisión,
// contra qué versión del dataset y con qué resultado. Sin eso, dentro de seis meses nadie puede
// decir si un modelo nuevo mejoró; sólo puede volver a medir todo desde cero.
//
// ═══ QUÉ SALE Y QUÉ NO ═══
//
// Sale el manifiesto: nombre del dataset, cuántas preguntas de cada familia, su HASH, y las
// métricas. NO sale una sola pregunta, ni un CUIT, ni un importe, ni un id de Drive. Cada archivo
// pasa por `esPublicable()` ANTES de subirse y el script ABORTA si alguno no pasa — una lista
// blanca mal escrita es un error de una línea con consecuencia permanente.
//
// El repo es PRIVADO. Aun sanitizado, el inventario de capacidades de una empresa no es público.
//
//   node orquestador/scripts/hf-publicar-registro.mjs [--aplicar]

import { readFileSync, readdirSync } from 'node:fs'
import { token } from '../lib/ml/hf-inferencia.mjs'
import { inventario } from '../lib/ml/registro.mjs'
import { cargarDataset } from '../lib/ml/evaluacion.mjs'
import { manifiestoDe, esPublicable, registroPublicable, umbralesPublicables } from '../lib/ml/publicar-evaluacion.mjs'

const APLICAR = process.argv.includes('--aplicar')
const REPO = process.env.ORQ_HF_REPO_EVAL || 'jorgecoronaguti/ecsas-ml-registro'
const DIR_DATOS = new URL('../datos/ml/', import.meta.url).pathname

async function api(ruta, opciones = {}) {
  const r = await fetch(`https://huggingface.co${ruta}`, {
    ...opciones,
    headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json', ...opciones.headers },
  })
  const txt = await r.text()
  return { ok: r.ok, estado: r.status, cuerpo: txt.slice(0, 300) }
}

async function main() {
  if (!token()) throw new Error('no hay token de Hugging Face configurado')

  // ── LO QUE SE VA A SUBIR, ARMADO Y REVISADO ──
  const archivos = []
  archivos.push({ ruta: 'registro-de-modelos.json', datos: registroPublicable(inventario()) })

  for (const f of readdirSync(DIR_DATOS).filter((x) => x.endsWith('.json') && x.startsWith('ecsas-'))) {
    const ds = cargarDataset(`${DIR_DATOS}${f}`)
    archivos.push({ ruta: `manifiestos/${ds.nombre}.json`, datos: manifiestoDe(ds) })
  }
  try {
    // El archivo entero NO sale: su prosa cita proveedores reales y nombra tablas del negocio.
    // Salen los números, que son la calibración — lo único que hace falta comparar más adelante.
    const u = JSON.parse(readFileSync(`${DIR_DATOS}umbrales.json`, 'utf8'))
    archivos.push({ ruta: 'umbrales.json', datos: umbralesPublicables(u) })
  } catch { /* todavía no existe */ }

  console.log(`REPO       ${REPO} (privado)`)
  console.log(`ARCHIVOS   ${archivos.length}\n`)

  // ── LA REVISIÓN, ANTES DE TOCAR LA RED ──
  let bloqueado = false
  for (const a of archivos) {
    const r = esPublicable(a.datos)
    const tam = JSON.stringify(a.datos).length
    console.log(`  ${r.publicable ? '✔' : '✖'} ${a.ruta.padEnd(38)} ${String(tam).padStart(7)} bytes${r.publicable ? '' : '  ← ' + r.hallazgos.join(' · ')}`)
    if (!r.publicable) bloqueado = true
  }
  if (bloqueado) {
    console.log('\n✖ ABORTADO: al menos un archivo no pasó la revisión. No se sube nada.')
    process.exitCode = 1
    return
  }

  if (!APLICAR) { console.log('\n═══ SECO. Nada se subió. Repetir con --aplicar. ═══'); return }

  const creado = await api(`/api/repos/create`, {
    method: 'POST',
    body: JSON.stringify({ name: REPO.split('/')[1], type: 'dataset', private: true }),
  })
  console.log(`\n  repo: ${creado.ok ? 'creado' : `ya existía o ${creado.estado}`}`)

  // La API de commit de HF acepta NDJSON: una línea de cabecera y una por archivo.
  const lineas = [JSON.stringify({ key: 'header', value: { summary: 'registro de modelos y manifiestos de evaluación del OS', description: 'Publicado por orquestador/scripts/hf-publicar-registro.mjs. Sólo métricas y metadatos: ninguna pregunta, ningún CUIT, ningún importe.' } })]
  for (const a of archivos) {
    lineas.push(JSON.stringify({
      key: 'file',
      value: { path: a.ruta, encoding: 'base64', content: Buffer.from(JSON.stringify(a.datos, null, 1)).toString('base64') },
    }))
  }
  const r = await fetch(`https://huggingface.co/api/datasets/${REPO}/commit/main`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/x-ndjson' },
    body: lineas.join('\n'),
  })
  const txt = await r.text()
  console.log(`  commit: ${r.status} ${r.ok ? 'OK' : txt.slice(0, 200)}`)
  if (r.ok) console.log(`\n═══ PUBLICADO en https://huggingface.co/datasets/${REPO} (privado) ═══`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().then(() => process.exit(process.exitCode ?? 0)).catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
}
