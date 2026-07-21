#!/usr/bin/env node
// CARGA EL IPC REAL DEL INDEC como `tipo='dato'` y aplica la corrección de la vista `factor_ajuste`.
//
// Antes de esto, los diez períodos de `indice_economico` eran expectativas del REM: el OS ajustaba
// meses ya publicados con un pronóstico. Ver orquestador/lib/ipc-publicado.mjs para el detalle de
// cómo se verifica cada número contra los acumulados que el propio INDEC publicó.
//
// IDEMPOTENTE: se puede correr las veces que haga falta. No borra las proyecciones —quedan para
// poder comparar después qué tan bien pronosticó el mercado—, la vista simplemente las ignora
// cuando existe el dato firme del mismo mes.
//
//   node orquestador/scripts/cargar-ipc-publicado.mjs [--dry]

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { query, closePool } from '../lib/db.mjs'
import { IPC, FUENTE, URL, verificarAcumulado, faltantes, acumulado } from '../lib/ipc-publicado.mjs'

const DRY = process.argv.includes('--dry')
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const MIGRACION = join(RAIZ, 'supabase', 'migrations', '20260721180000_factor_ajuste_dato_manda.sql')
const pct = (v) => `${(Number(v) * 100).toFixed(1)}%`

async function main() {
  // 1. NUNCA CARGAR SIN VERIFICAR. Si la tabla no reproduce los acumulados del INDEC, hay un dato
  //    mal transcripto y cargarlo sería meter el error en la base.
  const rotos = verificarAcumulado()
  if (rotos.length) {
    for (const r of rotos) {
      console.error(`✗ ${r.que}: publicado ${pct(r.publicado)} vs encadenado ${pct(r.encadenado)}`)
    }
    throw new Error('la tabla del IPC no reproduce los acumulados publicados — hay un dato mal cargado')
  }
  console.log(`✓ verificado contra el INDEC: 1er trimestre ${pct(acumulado('2026-03'))} · 1er semestre ${pct(acumulado('2026-06'))}`)

  // 2. La vista corregida: un mes, una fila, el dato le gana a la expectativa. VA PRIMERO — cargar
  //    el dato con la vista vieja duplicaría cada mes cerrado en proyeccion_egreso.
  const sql = await readFile(MIGRACION, 'utf8')
  if (DRY) console.log('— dry: no aplico la migración de factor_ajuste')
  else {
    await query(sql)
    console.log('✓ factor_ajuste corregida: un mes se acumula UNA vez')
  }

  // 3. Los meses publicados que faltan.
  const { rows: enBase } = await query("select periodo, tipo from public.indice_economico where indice='ipc'")
  const faltan = faltantes(enBase)
  if (!faltan.length) console.log('— el IPC publicado ya estaba completo')

  for (const m of faltan) {
    if (DRY) { console.log(`  — dry: ${m.periodo}  ${pct(m.variacion)}`); continue }
    await query(
      `insert into public.indice_economico (indice, periodo, variacion, tipo, fuente, url, leido_en)
       values ('ipc', $1, $2, 'dato', $3, $4, now())
       on conflict (indice, periodo, tipo) do update set
         variacion = excluded.variacion, fuente = excluded.fuente, leido_en = now()`,
      [m.periodo, m.variacion, FUENTE, URL],
    )
    console.log(`  ✚ ${m.periodo}  ${pct(m.variacion)}  (dato INDEC, reemplaza la expectativa del REM)`)
  }

  if (DRY) return

  // 4. EL CANARIO. Si un mes quedara con dos filas, toda proyección del OS estaría inflada y ningún
  //    cuadro lo diría: el error entra parejo por los dos lados y los controles siguen en $0.
  const { rows: dup } = await query('select * from public.factor_ajuste_canario')
  if (dup.length) throw new Error(`¡${dup.length} mes(es) se acumulan dos veces! ${dup.map((d) => d.periodo).join(', ')}`)
  console.log('✓ canario vacío: ningún mes se cuenta dos veces')

  // 5. Qué quedó, y cuánto se movió respecto de lo que el OS venía usando.
  const { rows } = await query(
    "select periodo, tipo, variacion, factor_acumulado from public.factor_ajuste where indice='ipc' order by periodo",
  )
  console.log('\nIPC que usa el OS para proyectar:')
  for (const r of rows) {
    const marca = r.tipo === 'dato' ? 'INDEC   ' : 'REM (exp)'
    console.log(`  ${r.periodo}  ${pct(r.variacion).padStart(6)}  ${marca}  acumulado ×${Number(r.factor_acumulado).toFixed(4)}`)
  }
}

main()
  .catch((e) => { console.error('✗', e.message); process.exitCode = 1 })
  .finally(() => closePool())
