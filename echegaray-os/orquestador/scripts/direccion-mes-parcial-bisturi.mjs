#!/usr/bin/env node
// LAS CUATRO CELDAS DE UN MES DEL BLOQUE DE DIRECCIÓN, A BISTURÍ. Ver lib/direccion-mes-parcial-plan.mjs.
//
//   node orquestador/scripts/direccion-mes-parcial-bisturi.mjs --mes Agosto            → plan, no escribe
//   node orquestador/scripts/direccion-mes-parcial-bisturi.mjs --mes Agosto --aplicar  → snapshot + escribe + relee
//
// Escribe con `yaGuardado` porque las cuatro celdas se prueban del OS ANTES (forma del generador) y el
// dueño autorizó esta escritura el 18/09 («ok, no en compras»: la fila de agosto lee la pestaña de pagos
// sin compra). Deja snapshot de la pestaña entera en orq.sheet_snapshots y relee cada celda al final:
// la evidencia es el dato leído en el destino, no el 200 de la API.

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { leerColumnasRetiros } from '../lib/direccion-retiros.mjs'
import { planMesParcial } from '../lib/direccion-mes-parcial-plan.mjs'
import { tomarSnapshot } from '../lib/sheet-snapshot.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const PESTAÑA = 'Jornales por Quincena'
const APLICAR = process.argv.includes('--aplicar')
const iMes = process.argv.indexOf('--mes')
const MES = iMes > 0 ? process.argv[iMes + 1] : 'Agosto'
const AÑO = Number(process.env.ORQ_ANIO || new Date().getFullYear())

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  const cols = await leerColumnasRetiros(google, ID)
  const formulas = await google.readSheetValues(ID, `'${PESTAÑA}'!A1:H120`, { render: 'FORMULA' })
  const plan = planMesParcial(formulas, cols, { mes: MES, anio: AÑO })
  if (!plan.ok) { console.error(`NO hay plan: ${plan.motivo}`); process.exitCode = 1; return }
  console.log(`${PESTAÑA} · fila ${plan.fila} (${MES} ${AÑO}) · total mensual en la fila ${plan.filaTotal}`)
  for (const c of plan.celdas) console.log(`  ${c.igual ? '=' : '→'} ${c.celda}: ${c.igual ? 'ya tiene la fórmula nueva' : c.nueva.slice(0, 110) + (c.nueva.length > 110 ? '…' : '')}`)
  const cambios = plan.celdas.filter((c) => !c.igual)
  if (!cambios.length) { console.log('nada que escribir: las cuatro celdas ya están.'); return }
  if (!APLICAR) { console.log(`\n— en seco: ${cambios.length} celda(s) cambiarían. Repetilo con --aplicar.`); return }

  const snap = await tomarSnapshot({ google, fileId: ID, pestana: PESTAÑA, tool: 'direccion-mes-parcial-bisturi',
    directive: `fila ${MES} ${AÑO} del bloque de Dirección lee _PAGOS_NO_COMPRA_RAW y proyecta el resto (autorizado 18/09)` })
  console.log(`snapshot → ${snap ?? 'NO SE PUDO'}`)
  if (!snap) { console.error('sin snapshot no escribo: no habría cómo volver atrás.'); process.exitCode = 1; return }

  const data = cambios.map((c) => ({ range: `'${PESTAÑA}'!${c.celda}`, values: [[c.nueva]] }))
  const res = await google.batchUpdateValues(ID, data, { yaGuardado: true })
  if (res?.protegido) { console.error(`la guarda frenó la escritura: ${res.motivo ?? JSON.stringify(res)}`); process.exitCode = 1; return }

  // RELECTURA: cada celda, fórmula y valor.
  const despues = await google.readSheetValues(ID, `'${PESTAÑA}'!A${plan.fila}:H${plan.fila}`, { render: 'FORMULA' })
  const valores = await google.readSheetValues(ID, `'${PESTAÑA}'!A${plan.fila}:H${plan.fila}`, { render: 'UNFORMATTED_VALUE' })
  let ok = true
  for (const c of cambios) {
    const j = c.celda.charCodeAt(0) - 65
    const leida = String(despues?.[0]?.[j] ?? '')
    const bien = leida === c.nueva
    ok &&= bien
    console.log(`  ${bien ? '✓' : '✗'} ${c.celda} ${bien ? 'quedó escrita' : 'NO coincide con lo escrito'} · valor: ${JSON.stringify(valores?.[0]?.[j])}`)
  }
  if (!ok) process.exitCode = 1
}

main().catch((e) => { console.error(e.message ?? e); process.exit(1) })
