#!/usr/bin/env node
// REVISIÓN INTERNA DE LOGS Y BUGS (rutina de mantenimiento del OS — la corre el DEV/loop, NO el
// chat). Junta de forma determinística las señales de falla reales: tareas y operaciones que
// fallaron (DB) + errores/warnings de los servicios (journald: API 400, fallas de tool, cortes
// por costo, espirales de reintento, tools que devolvieron error) agrupados por patrón.
// Uso: node orquestador/scripts/revisar-logs.mjs [horas]
import { query } from '../lib/db.mjs'
import { execFile } from 'node:child_process'

const horas = Math.min(Math.max(Number(process.argv[2]) || 12, 1), 72)

function journal(h) {
  return new Promise((resolve) => {
    execFile('journalctl', ['--user', '-u', 'echegaray-orq-interactive.service', '-u', 'echegaray-orq-worker.service', '--since', `${h} hours ago`, '--no-pager', '-o', 'cat'],
      { maxBuffer: 24 * 1024 * 1024, timeout: 20000 }, (err, stdout) => resolve(err && !stdout ? [] : String(stdout || '').split('\n')))
  })
}
const patron = (m) => String(m).replace(/\b[0-9a-f]{8}-[0-9a-f-]{27,}\b/gi, '<id>').replace(/req_[A-Za-z0-9]+/g, '<req>').replace(/\b\d[\d.,]*\b/g, '<n>').replace(/"[^"]{40,}"/g, '"…"').slice(0, 160).trim()
const ERR_RE = /"level"\s*:\s*"(error|warn)"|api\s+\d{3}|\b400\b|INVALID_ARGUMENT|could not process|"ok"\s*:\s*false|frenó por tope|\[FRENO|\[BASTA|max_tokens|is_error/i

async function main() {
  const [tareas, ops, lineas] = await Promise.all([
    query(`select type, left(coalesce(error,''),160) err, to_char(updated_at,'DD/MM HH24:MI') cuando from orq.tasks where state='failed' and updated_at > now() - ($1||' hours')::interval order by updated_at desc limit 25`, [String(horas)]),
    query(`select payload->>'tool' tool, left(coalesce(error,''),160) err, to_char(updated_at,'DD/MM HH24:MI') cuando from orq.pending_operations where status='failed' and updated_at > now() - ($1||' hours')::interval order by updated_at desc limit 25`, [String(horas)]),
    journal(horas),
  ])
  // tools que devolvieron error/ok:false (traza nueva 'anthropic-api: tool')
  const toolFails = new Map()
  const grupos = new Map()
  for (const l of lineas) {
    if (!l) continue
    let j = null; try { j = JSON.parse(l) } catch { /* no-JSON */ }
    if (j?.msg === 'anthropic-api: tool' && j.ok === false) {
      const k = `${j.tool}: ${patron(j.out || '')}`
      toolFails.set(k, (toolFails.get(k) || 0) + 1)
      continue
    }
    if (!ERR_RE.test(l)) continue
    const msg = j?.msg ? `${j.msg}${j.error ? ' — ' + j.error : ''}` : l
    const p = patron(msg); if (!p) continue
    const g = grupos.get(p) || { veces: 0, ej: msg.slice(0, 200) }; g.veces++; grupos.set(p, g)
  }
  const cortes = lineas.filter((l) => /frenó por tope|"stop_reason"\s*:\s*"(cost_cap|max_tokens)"/.test(l)).length
  const espirales = lineas.filter((l) => /\[FRENO|\[BASTA/.test(l)).length

  console.log(`\n=== REVISIÓN DE LOGS — últimas ${horas}h (${new Date().toLocaleString()}) ===`)
  console.log(`resumen: ${tareas.rows.length} tareas falladas · ${ops.rows.length} operaciones falladas · ${toolFails.size} tools con error · ${cortes} cortes por costo/tokens · ${espirales} espirales`)
  if (tareas.rows.length) { console.log('\nTAREAS FALLADAS:'); tareas.rows.forEach((r) => console.log(`  [${r.cuando}] ${r.type} — ${r.err}`)) }
  if (ops.rows.length) { console.log('\nOPERACIONES FALLADAS:'); ops.rows.forEach((r) => console.log(`  [${r.cuando}] ${r.tool} — ${r.err}`)) }
  if (toolFails.size) { console.log('\nTOOLS QUE DEVOLVIERON ERROR (por frecuencia):'); [...toolFails.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15).forEach(([k, v]) => console.log(`  ${v}× ${k}`)) }
  if (grupos.size) { console.log('\nERRORES/WARNINGS DEL LOG (por patrón):'); [...grupos.entries()].sort((a, b) => b[1].veces - a[1].veces).slice(0, 15).forEach(([p, g]) => console.log(`  ${g.veces}× ${p}`)) }
  if (!tareas.rows.length && !ops.rows.length && !toolFails.size && !grupos.size) console.log('\n✓ Sin fallas registradas. El OS está sano.')
  process.exit(0)
}
main().catch((e) => { console.error('revisar-logs falló:', e.message); process.exit(1) })
