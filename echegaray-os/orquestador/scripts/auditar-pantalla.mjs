#!/usr/bin/env node
// ¿CÓMO SE VE EL ARCHIVO? — el control que faltaba.
//
// POR QUÉ (21/07). El dueño rechazó la misma pestaña tres veces por formato. Yo verificaba que los
// totales cerraran, y cerraban: lo que estaba roto era lo que se VE, y de eso no había ni un
// control. Un control que suma no ve un "30/12/99" repetido veintidós veces.
//
// Recorre todas las pestañas y lista los defectos de pantalla con su celda exacta. No arregla nada:
// arreglar cada uno es trabajo de la pestaña que lo produce, y taparlos desde acá escondería dónde
// está la causa.
//
//   node orquestador/scripts/auditar-pantalla.mjs [pestaña]

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { detectar, resumen } from '../lib/defectos-pantalla.mjs'
import { PESTANAS } from './formato-pestanas.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const SOLO = process.argv[2]

function colLetra(n) { let s = ''; for (let i = n - 1; i >= 0; i = Math.floor(i / 26) - 1) s = String.fromCharCode(65 + (i % 26)) + s; return s }

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  const lista = SOLO ? PESTANAS.filter((p) => p.titulo.toLowerCase().includes(SOLO.toLowerCase())) : PESTANAS
  let total = 0

  for (const p of lista) {
    const f = await google.readSheetFormats(ID, `${p.titulo}!A1:${colLetra(p.cols)}${p.hastaFila}`).catch(() => null)
    if (!f) { console.log(`  ${p.titulo.padEnd(26)} no pude leerla`); continue }
    // Las pestañas de CARGA tienen filas vacías al final por diseño (son planillas de entrada):
    // reportarlas como hueco sería ruido en cada corrida y el control dejaría de mirarse.
    const d = detectar(f, { huecoMax: p.carga ? 999 : 3 })
    total += d.length
    if (!d.length) { console.log(`  ${p.titulo.padEnd(26)} ✓`); continue }
    console.log(`  ${p.titulo.padEnd(26)} ⚠ ${d.length} defecto(s)`)
    for (const r of resumen(d)) {
      console.log(`     ${String(r.n).padStart(3)}× ${r.tipo.padEnd(28)} ej. ${r.ejemplo.col}${r.ejemplo.fila} "${String(r.ejemplo.valor).slice(0, 34)}" — ${r.ejemplo.que}`)
    }
  }
  console.log(`\n${total} defecto(s) de pantalla en ${lista.length} pestaña(s)`)
  if (total) process.exitCode = 1
}

main().catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
