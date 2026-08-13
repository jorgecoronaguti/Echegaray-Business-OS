#!/usr/bin/env node
// Observabilidad por CLI (interfaz interina hasta la integración en la UI de la
// Fase 5). Muestra cola por estado, últimas tareas, dead-letter, y actividad de
// workers. Lee el Event Log y el ledger (fuente única de verdad).
import { query, closePool } from '../lib/db.mjs'
import { queueSnapshot, tareasEnFallo } from '../lib/ledger.mjs'

async function main() {
  const snap = await queueSnapshot()
  console.log('\n== COLA POR ESTADO ==')
  if (!snap.length) console.log('  (vacía)')
  for (const r of snap) console.log(`  ${r.state.padEnd(18)} ${r.n}`)

  const recent = await query(
    `select left(id::text,8) id, type, left(title,32) title, state, attempt, coalesce(locked_by,'-') worker
       from orq.tasks order by created_at desc limit 8`,
  )
  console.log('\n== ÚLTIMAS TAREAS ==')
  for (const r of recent.rows) console.log(`  ${r.id}  ${r.state.padEnd(12)} a${r.attempt} ${r.type.padEnd(12)} ${r.title}`)

  const dl = await query(`select count(*)::int n from orq.tasks where state='dead_letter'`)
  const wk = await query(
    `select worker_id, count(*)::int n, max(started_at) last from orq.task_attempts
      where started_at > now() - interval '1 hour' group by worker_id order by last desc limit 5`,
  )
  // El CONTEO de dead-letter no alcanza: el 13/08 el dueño vio "cargué 3" y la tarea había muerto
  // tres veces sin que nadie pudiera decir por qué. Acá va el MOTIVO de cada una, que es lo que
  // convierte un número en algo accionable.
  console.log(`\n== DEAD-LETTER: ${dl.rows[0].n} ==`)
  const fallidas = await tareasEnFallo({ horas: 48, limite: 10 })
  console.log('\n== TERMINARON EN FALLO (48 h) — con motivo ==')
  if (!fallidas.length) console.log('  (ninguna)')
  for (const r of fallidas) {
    console.log(`  ${String(r.id).slice(0, 8)}  ${r.state.padEnd(12)} a${r.attempt}/${r.max_attempts} ${r.type}`)
    console.log(`      ${String(r.title).slice(0, 60)} — ${String(r.error).slice(0, 120)}`)
  }
  console.log('\n== WORKERS (última hora) ==')
  if (!wk.rows.length) console.log('  (sin actividad)')
  for (const r of wk.rows) console.log(`  ${String(r.worker_id).padEnd(24)} ${r.n} intentos  último ${r.last?.toISOString?.() ?? r.last}`)

  const ev = await query(`select type, count(*)::int n from orq.events group by type order by n desc limit 8`)
  console.log('\n== EVENTOS (top tipos) ==')
  for (const r of ev.rows) console.log(`  ${r.type.padEnd(24)} ${r.n}`)

  await closePool()
}

main().catch((e) => { console.error('status falló:', e.message); process.exitCode = 1 })
