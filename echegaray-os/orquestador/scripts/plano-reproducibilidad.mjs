#!/usr/bin/env node
// ¿DOS CORRIDAS DAN LO MISMO? La pregunta que decide si una cotización se puede defender.
//
// Corre el pipeline DOS VECES sobre los mismos archivos y compara la huella —elemento, estado,
// partida y cantidad—. Si difieren, imprime exactamente en qué elemento y con qué partida cada una,
// que es lo único que sirve para arreglarlo.
//
// El caché de interpretación se usa a propósito: «inputs congelados» significa que la lectura de la
// lámina es la misma, que es la condición que el enunciado pide. Con `--refrescar` se mide la otra
// cosa —cuánto varía la LECTURA del modelo entre dos miradas—, que es un dato distinto y también
// vale, pero cuesta plata.
//
//   node orquestador/scripts/plano-reproducibilidad.mjs quattropani
//   node orquestador/scripts/plano-reproducibilidad.mjs quattropani --refrescar

import { query } from '../lib/db.mjs'
import { makeGoogleClient } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { correr } from '../lib/plano/pipeline.mjs'

const args = process.argv.slice(2)
const termino = args.find((a) => !a.startsWith('--'))
if (!termino) {
  console.error('uso: plano-reproducibilidad.mjs <termino> [--refrescar]')
  process.exit(1)
}
const refrescar = args.includes('--refrescar')

const google = makeGoogleClient({ config: loadConfig() })
const corridas = []
for (const n of [1, 2]) {
  const t0 = Date.now()
  const r = await correr({ query, google, termino, refrescar: refrescar && n === 1 })
  corridas.push({ n, huella: r.huella, ms: Date.now() - t0, r })
  const usd = r.ia.usos.reduce((a, u) => a + (u.usd ?? 0), 0)
  console.log(`corrida ${n}: ${r.computo.computados}/${r.computo.detectados} computados · ${r.mapeo.mapeadas} mapeadas · ${r.mapeo.ambiguas ?? 0} ambiguas · ${r.mapeo.candidatas} candidatas · ${r.ia.llamadas} llamadas · USD ${usd.toFixed(4)} · ${(r.ms / 1000).toFixed(1)} s`)
}

const [a, b] = corridas
if (a.huella === b.huella) {
  console.log(`\n✔ REPRODUCIBLE — las dos corridas dieron la misma huella (${a.huella.split('\n').length} elementos)`)
  process.exit(0)
}

console.log('\n✖ NO REPRODUCIBLE — las corridas difieren:')
const filas = (h) => new Map(h.split('\n').map((l) => [l.split('|')[0], l]))
const fa = filas(a.huella)
const fb = filas(b.huella)
for (const clave of new Set([...fa.keys(), ...fb.keys()])) {
  if (fa.get(clave) === fb.get(clave)) continue
  console.log(`  ${clave}\n    corrida 1: ${fa.get(clave) ?? '(no está)'}\n    corrida 2: ${fb.get(clave) ?? '(no está)'}`)
}
process.exit(1)
