#!/usr/bin/env node
// EL CICLO DE INTELIGENCIA DE ADMIN & FINANZAS — corre solo, cada ciclo, 0 API.
//
// Cierra el loop que las fases F0–F9 construyeron pero que no corría solo (ningún sync financiero tenía
// timer). En orden de dependencia:
//   1. MATERIALIZA las tablas del motor (modelo de liquidez, calendario, condiciones, comparador,
//      estrategia, plan de tesorería) que la web LEE — y de paso ALIMENTA LA CAJA NEGRA (F0): cada uno
//      de esos syncs registra su foto con timestamp, que es el sustrato del aprendizaje.
//   2. REFRESCA el scorecard (F6) para que /scorecard-finanzas muestre datos frescos.
//   3. MIDE la precisión del forecast contra la caja negra (F2) y, si detecta un sesgo sistemático,
//      PROPONE un ajuste al backlog autónomo — NUNCA lo aplica: mover un supuesto de plata es tu decisión.
//   4. EMITE las acciones y borradores del CFO proactivo (F9) al Centro de Acción — Nivel D (preparación).
//      Cualquier paso que mueva plata queda gateado por pending_operations: requiere tu aprobación (Nivel E).
//
// NO escribe el Sheet: los syncs LEEN el Sheet y materializan tablas de Supabase. Si un paso falla, siguen
// los demás y el proceso sale != 0 para que el timer lo registre. Es 0 API: todo determinístico.
//
//   node orquestador/scripts/sync-finanzas-ciclo.mjs [--dry]

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const ejecutar = promisify(execFile)
const AQUI = path.dirname(fileURLToPath(import.meta.url))
const DRY = process.argv.includes('--dry')

// Orden de dependencia: modelo → calendario → condiciones → comparador → estrategia → plan → scorecard.
// Cada uno materializa su tabla vigente y (los del motor) registran su foto en la caja negra.
const SYNCS = [
  'sync-modelo-liquidez.mjs',
  'sync-calendario-financiero.mjs',
  'sync-condiciones-financieras.mjs',
  'sync-comparar-financiamiento.mjs',
  'sync-estrategia-financiera.mjs',
  'sync-plan-tesoreria.mjs',
  'sync-scorecard-finanzas.mjs',
]

async function correrSyncs() {
  const ok = []
  const fallaron = []
  for (const s of SYNCS) {
    if (DRY) { console.log(`   (dry) correría ${s}`); ok.push(s); continue }
    try {
      await ejecutar(process.execPath, [path.join(AQUI, s)], { timeout: 180000, cwd: path.resolve(AQUI, '..', '..') })
      ok.push(s); console.log(`   ✓ ${s}`)
    } catch (e) {
      fallaron.push(s); console.log(`   ✗ ${s}: ${String(e?.message ?? e).slice(0, 200)}`)
    }
  }
  return { ok, fallaron }
}

// F2 — mide la precisión del forecast contra la caja negra y PROPONE ajustes (no aplica). Nivel D.
async function medirPrecision(google) {
  try {
    const { query } = await import('../lib/db.mjs')
    const { precisionForecast, registrarPropuestaAjuste } = await import('../lib/aprendizaje-forecast.mjs')
    const pf = await precisionForecast({ query, google })
    let propuestas = 0
    for (const p of pf.propuestas || []) {
      try { await registrarPropuestaAjuste({ query }, p); propuestas++ } catch { /* idempotente / ya existía */ }
    }
    console.log(`   ✓ F2 precisión: ${pf.nota}${propuestas ? ` · ${propuestas} propuesta(s) de ajuste al backlog (para tu confirmación)` : ''}`)
    return true
  } catch (e) { console.log(`   ✗ F2 precisión: ${String(e?.message ?? e).slice(0, 200)}`); return false }
}

// F9 — emite las acciones y borradores del CFO al Centro de Acción. autorizadoPor='CFO IA' crea sólo las
// tareas de PREPARACIÓN (Nivel D); el paso con plata sigue gateado por pending_operations (tu aprobación).
async function emitirCfo(google) {
  try {
    const { query } = await import('../lib/db.mjs')
    const { cicloCfoProactivo } = await import('../lib/cfo-proactivo.mjs')
    const r = await cicloCfoProactivo({ query, google }, { autorizadoPor: 'CFO IA' })
    if (r.estado === 'sin dato') { console.log(`   · F9 CFO: sin dato (${r.motivo})`); return true }
    const n = (r.acciones || []).length
    const creadas = r.ejecucion?.creada ? ' → tareas de preparación en el Centro de Acción (mover plata requiere tu aprobación)' : ` · ${r.ejecucion?.nota || 'Nivel D'}`
    console.log(`   ✓ F9 CFO: ${n} acción(es) propuesta(s)${creadas}`)
    return true
  } catch (e) { console.log(`   ✗ F9 CFO: ${String(e?.message ?? e).slice(0, 200)}`); return false }
}

async function main() {
  const t0 = Date.now()
  console.log('▸ Ciclo de inteligencia Admin & Finanzas\n1. Materializando tablas del motor + alimentando la caja negra:')
  const { ok, fallaron } = await correrSyncs()

  let google = null
  if (!DRY) {
    try {
      const { makeGoogleClient, WRITE_SCOPES } = await import('../lib/google.mjs')
      const { loadConfig } = await import('../lib/config.mjs')
      google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
    } catch { /* sin Google: F2 ancla sólo con lo que la caja negra observó; F9 puede quedar sin plan */ }
    console.log('2. Aprendizaje y propuestas:')
    await medirPrecision(google)
    await emitirCfo(google)
  }

  console.log(`\nciclo finanzas: ${ok.length} sync ok, ${fallaron.length} con error · ${((Date.now() - t0) / 1000).toFixed(1)}s`)
  if (fallaron.length) process.exitCode = 1
}

main().catch((e) => { console.error('ciclo finanzas: error fatal', e); process.exit(1) })
