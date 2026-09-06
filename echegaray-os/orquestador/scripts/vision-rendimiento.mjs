#!/usr/bin/env node
// QUÉ RINDE LA PLATA DE VISIÓN — no cuánto cuesta, sino cuánto de lo que produce se puede cotizar.
//
//   node orquestador/scripts/vision-rendimiento.mjs
//
// No llama a ningún modelo ni gasta un token: lee las lecturas YA PAGADAS del caché, las enlaza con
// el plano del que salieron hasheando los PNG recortados que siguen en disco, y las pasa por el
// MISMO cómputo que corre en producción.

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { DIR_CACHE } from '../lib/plano/cache-lecturas.mjs'
import { DIR_CACHE as DIR_RECORTES, leerLlaveDeRecorte } from '../lib/ingesta/recortes.mjs'
import { rendimiento, gananciaDeFusionar } from '../lib/ml/vision-rendimiento.mjs'

/**
 * DE QUÉ PLANO SALIÓ CADA LECTURA DE REGIÓN.
 *
 * El caché de lecturas no lo guarda, y el de recortes sí lo tiene en el nombre del archivo. La
 * llave de la lectura es el sha256 del PNG, así que hashear los recortes reconstruye el vínculo
 * exacto —no un parecido— entre una lectura y su plano, su página y su caja.
 */
export function enlazarConPlanos(dirRecortes = DIR_RECORTES) {
  const enlace = new Map()
  let sinParsear = 0
  for (const f of fs.readdirSync(dirRecortes)) {
    if (!f.endsWith('.png')) continue
    const meta = leerLlaveDeRecorte(f)
    if (!meta) { sinParsear += 1; continue }
    const bytes = fs.readFileSync(path.join(dirRecortes, f))
    enlace.set(`v3region:${crypto.createHash('sha256').update(bytes).digest('hex').slice(0, 32)}`, meta)
  }
  return { enlace, sinParsear }
}

function lecturasDeDisco(dir = DIR_CACHE) {
  const out = []
  for (const f of fs.readdirSync(dir)) {
    if (!f.startsWith('v3region')) continue
    try { out.push({ llave: f.replace(/\.json$/, ''), ...JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) }) }
    catch { /* una entrada rota no decide el informe de las otras 112 */ }
  }
  return out
}

function main() {
  const { enlace, sinParsear } = enlazarConPlanos()
  const lecturas = lecturasDeDisco()
  const conPlano = lecturas.map((l) => ({ ...l, archivo: enlace.get(l.llave)?.hashArchivo ?? null }))
  const enlazadas = conPlano.filter((l) => l.archivo)

  console.log(`\n═══ RENDIMIENTO DE interpretar-region · ${lecturas.length} lecturas ya pagadas ═══\n`)
  console.log(`  enlazadas a su plano: ${enlazadas.length}/${lecturas.length}` +
    `${sinParsear ? ` · ${sinParsear} archivos del caché de recortes sin llave legible` : ''}`)

  const r = rendimiento(conPlano.map((l) => ({ ...l, archivo: l.archivo ?? 'desconocido' })))
  console.log(`  elementos ${r.elementos} · COMPUTADOS ${r.computados} (${r.pct}%) · con origen citable ${r.admitidos}\n`)

  console.log('═══ POR FORMA GEOMÉTRICA — es acá donde se decide, no en el modelo ═══\n')
  console.table(r.porForma.map((f) => ({ forma: f.forma, elementos: f.elementos, computados: f.computados, '%': f.pct })))

  console.log('\n═══ POR SUBCAPACIDAD ═══\n')
  console.table(r.porTipo.map((t) => ({ subcapacidad: t.tipo, llamadas: t.llamadas, elementos: t.elementos, computados: t.computados, '%': t.pct })))

  console.log('\n═══ QUÉ FALTA EN LOS QUE NO SE COMPUTARON ═══\n')
  console.table(r.motivos.slice(0, 8))

  const porPlano = new Map()
  for (const l of enlazadas) porPlano.set(l.archivo, [...(porPlano.get(l.archivo) ?? []), l])
  const g = gananciaDeFusionar(porPlano)
  console.log(`\n═══ ¿EL DEFECTO ES LA SEGMENTACIÓN? ═══\n`)
  console.log(`  ${porPlano.size} planos · ${g.grupos} elementos distintos · ${g.multivista} vistos en MÁS DE UNA vista`)
  console.log(`  computables en alguna vista suelta: ${g.computablesSueltos}`)
  console.log(`  computables fusionando las vistas : ${g.computablesFusionados}   →  GANANCIA ${g.ganados >= 0 ? '+' : ''}${g.ganados}`)
  if (!g.multivista) console.log('  ⚠ ningún elemento apareció en dos vistas: la ganancia no significa nada.')
  console.log('')
}

if (import.meta.url === `file://${process.argv[1]}`) main()
