#!/usr/bin/env node
// FORMATO CONDICIONAL EN TODAS LAS PESTAÑAS CALCULADAS — QUE EL ERROR SE VEA.
//
// 2ª pasada de rediseño fino (regla de oro 22/07: cada pestaña minimalista y de CLASE MUNDIAL). El
// checklist de google-sheets-business-systems pide "formato condicional para que el error se vea".
// Este paso deja en CADA pestaña calculada una regla que pinta en rojo toda celda con #ERROR!/#REF!/
// #N/A: un modelo roto grita en la pantalla en vez de esperar al auditor.
//
// NO toca Compras ni Cobranzas (carga, del dueño). Es idempotente: reemplaza las reglas de cada
// pestaña, no las apila.
//
//   node orquestador/scripts/formato-condicional.mjs [--dry]

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { PESTANAS } from './formato-pestanas.mjs'
import { requestsPara } from '../lib/formato-condicional.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const DRY = process.argv.includes('--dry')

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  const meta = await google.getSheetMeta(ID)
  // Las de CARGA son del dueño: no se les toca el formato (misma disciplina que reparar-pantalla).
  const calculadas = PESTANAS.filter((p) => !p.carga)
  const condActual = await google.getConditionalFormats(ID)

  const requests = []
  const tocadas = []
  for (const p of calculadas) {
    const hoja = meta.find((h) => h.title === p.titulo)
    if (!hoja) continue
    const reglasExistentes = condActual.find((c) => c.title === p.titulo)?.reglas ?? 0
    requests.push(...requestsPara(hoja.sheetId, { cols: p.cols, hastaFila: p.hastaFila, reglasExistentes }))
    tocadas.push(`${p.titulo}${reglasExistentes ? ` (reemplaza ${reglasExistentes})` : ''}`)
  }

  console.log(`Formato condicional "error en rojo" en ${tocadas.length} pestañas calculadas:`)
  console.log(`  ${tocadas.join(' · ')}`)
  if (DRY) return console.log(`\n(--dry) ${requests.length} requests, no escribí nada.`)

  for (let i = 0; i < requests.length; i += 200) await google.spreadsheetBatchUpdate(ID, requests.slice(i, i + 200))

  // VERIFICAR: releer y confirmar que cada calculada quedó con exactamente una regla.
  const despues = await google.getConditionalFormats(ID)
  const mal = calculadas
    .map((p) => ({ t: p.titulo, n: despues.find((c) => c.title === p.titulo)?.reglas ?? 0 }))
    .filter((x) => x.n !== 1)
  console.log(`\n✓ ${tocadas.length} pestañas con la regla de error`)
  if (mal.length) { console.log(`  ⚠ no quedaron con exactamente 1 regla: ${mal.map((x) => `${x.t}=${x.n}`).join(', ')}`); process.exitCode = 1 }
}

main().catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
