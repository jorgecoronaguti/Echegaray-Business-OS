#!/usr/bin/env node
// FRENO: ¿LAS COLUMNAS QUE CALCULA EL OS EN COMPRAS DERRAMAN? Si no, el pipeline se detiene acá.
//
// SÓLO LEE (el cliente nace con scope de lectura). Corre en el pipeline DESPUÉS de los pasos que anclan
// las ARRAYFORMULA de Compras y ANTES del primero que escribe Proveedores, el libro, CAJA o los dos
// Cash Flow. Sale ≠0 con la celda exacta cuando un ancla está en error o falta, o cuando hay contenido
// tipeado dentro de un derrame: el 17/09/2026 un 16/09 pegado en AE962 dejó a 967 compras sin
// «Fecha de caja» y la corrida publicó los Cash Flow sin un solo egreso de Compras. El porqué completo,
// en `lib/compras-derrames.mjs`.
//
//   node orquestador/scripts/freno-derrames-compras.mjs

import { loadConfig } from '../lib/config.mjs'
import { makeGoogleClient } from '../lib/google.mjs'
import { describirHallazgos, diagnosticarDerrames, FILA_ANCLA } from '../lib/compras-derrames.mjs'
import { rangoEncabezado, rangoFilas } from '../lib/columnas-por-encabezado.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const LECTURA = ['https://www.googleapis.com/auth/spreadsheets.readonly']

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: LECTURA })
  const encabezado = (await google.readSheetValues(ID, rangoEncabezado('Compras'), { render: 'FORMATTED_VALUE' }))?.[0] ?? []
  const formulas = await google.readSheetValues(ID, rangoFilas('Compras', FILA_ANCLA), { render: 'FORMULA' }) ?? []
  const valores = await google.readSheetValues(ID, rangoFilas('Compras', FILA_ANCLA, FILA_ANCLA), { render: 'FORMATTED_VALUE' }) ?? []
  const hallazgos = diagnosticarDerrames({ encabezado, formulas, valores })
  if (!hallazgos.length) {
    console.log(`✓ las columnas ARRAYFORMULA de Compras derraman limpias (${formulas.length} filas leídas)`)
    return
  }
  for (const l of describirHallazgos(hallazgos)) console.error(l)
  console.error('⛔ FRENO: no se escriben Proveedores, el libro, CAJA ni los Cash Flow sobre una Compras que no calcula.')
  process.exitCode = 1
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(`⛔ FRENO: no pude verificar los derrames de Compras (${e.message}) — fail-closed`); process.exit(1) })
}
