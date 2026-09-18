#!/usr/bin/env node
// BARRIDO DE HUÉRFANOS — limpia SÓLO procesos de desarrollo que ya no tienen dueño.
//
// Un huérfano es, con seguridad, una de estas cuatro cosas:
//   1. una tarea gobernada por `ecos` cuyo proceso `ecos` murió (queda el registro y el scope);
//   2. un proceso de desarrollo (next dev, Chromium de Playwright, tsc, eslint, node --test) que fue
//      adoptado por PID 1: el que lo lanzó ya no existe;
//   3. uno cuyo directorio de trabajo fue borrado (el worktree se abandonó);
//   4. uno que corre dentro de `ecos.slice` sin ningún `ecos` vivo que lo haya registrado.
//
// Todo lo demás se deja. Un `next dev` que otro agente tiene vivo en su terminal NO es huérfano y
// no se toca, aunque esté ocupando el cupo: ese caso lo resuelve la cola, no el barrido.
//
// Uso: barrer.mjs [--seco] [--motivo texto]     `--seco` muestra sin matar.

import { unlinkSync, readdirSync, existsSync, appendFileSync, mkdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { DIR, procesosDesarrollo, registros, vivo, medir, tieneDueno, padreDe, descendientes } from './comun.mjs'

const args = process.argv.slice(2)
const SECO = args.includes('--seco')
const motivo = (args[args.indexOf('--motivo') + 1] || 'manual')
const acciones = []
const log = (s) => acciones.push(s)

function stopScope(unidad) {
  if (SECO) return
  try { execFileSync('systemctl', ['--user', 'stop', unidad], { stdio: 'ignore', timeout: 15000, env: envSystemd() }) } catch { /* ya no existe */ }
}
function envSystemd() {
  const uid = process.getuid()
  return { ...process.env, XDG_RUNTIME_DIR: process.env.XDG_RUNTIME_DIR || `/run/user/${uid}`,
    DBUS_SESSION_BUS_ADDRESS: process.env.DBUS_SESSION_BUS_ADDRESS || `unix:path=/run/user/${uid}/bus` }
}
function matar(p, porque) {
  log(`${SECO ? 'mataría' : 'maté'} ${p.pid} (${p.clase}, ${p.rssMB} MB) — ${porque}: ${p.cmd.slice(0, 90)}`)
  if (SECO) return
  try { process.kill(p.pid, 'SIGTERM') } catch { /* ya murió */ }
}

// ── 1. Registros de `ecos` cuyo proceso murió: se apaga el scope entero. ──
// También si su DUEÑO (la sesión que lo lanzó) ya no existe: un `ecos next -- npm run dev &` que
// sobrevivió a su sesión tiene el cupo tomado para nadie.
for (const r of registros()) {
  const unidad = `ecos-${String(r.clase).replace(/,/g, '-')}-${r.pid}.scope`
  let porque = ''
  if (!vivo(r.pid)) porque = `su ecos (pid ${r.pid}) ya no existe`
  else if (r.dueno && !vivo(r.dueno)) porque = `la sesión que lo lanzó (pid ${r.dueno}) terminó`
  if (!porque) continue
  log(`${SECO ? 'apagaría' : 'apagué'} ${unidad} — ${porque}`)
  stopScope(unidad)
  if (!SECO) {
    if (vivo(r.pid)) { try { process.kill(r.pid, 'SIGTERM') } catch { /* nada */ } }
    try { unlinkSync(r.archivo) } catch { /* nada */ }
  }
}

// ── 2–4. Procesos de desarrollo sin dueño. ──
const antes = medir()
const candidatos = procesosDesarrollo()
const matados = []
const cache = new Map()
// Los ANCESTROS de una tarea gobernada viva (el `npm run typecheck` que llamó a `ecos`) no se tocan:
// su dueño es el propio ecos, que está vivo y registrado. Sin esta exención, un `npm run typecheck`
// lanzado con `nohup … &` parecería "sin dueño" mientras su tsc corre perfectamente adentro del scope.
const intocables = new Set()
for (const r of registros()) {
  if (!vivo(r.pid)) continue
  let p = r.pid, saltos = 0
  while (p > 1 && saltos++ < 64) { intocables.add(p); p = padreDe(p); if (!p) break }
}
for (const p of candidatos) {
  let porque = ''
  if (intocables.has(p.pid)) continue
  if (p.ppid === 1) porque = 'adoptado por PID 1 (quien lo lanzó ya no existe)'
  else if (!p.enScope && !tieneDueno(p.pid, cache)) porque = 'sin dueño: ninguna sesión viva en su cadena de padres'
  else if (/\(deleted\)$/.test(p.cwd)) porque = 'su directorio de trabajo fue borrado (worktree abandonado)'
  else if (p.enScope) {
    const m = p.cgroup.match(/ecos-[a-z-]+-(\d+)\.scope/)
    if (m && !vivo(Number(m[1]))) porque = `su ecos (pid ${m[1]}) murió`
  }
  if (!porque) continue
  matar(p, porque); matados.push(p)
  // Con la raíz se va el árbol entero: matar sólo el `bash -c` que lanzó un `next dev` deja vivo al
  // next-server de 2 GB — que es justamente lo que había que limpiar.
  for (const d of descendientes(p.pid)) {
    if (matados.some((m) => m.pid === d.pid) || intocables.has(d.pid)) continue
    matar(d, `descendiente de ${p.pid}`); matados.push(d)
  }
}

// Gracia de 4 segundos y luego SIGKILL a lo que no se fue: un next-server que ignora SIGTERM es
// exactamente el proceso que nadie quiere ver vivo cinco minutos después.
if (matados.length && !SECO) {
  await new Promise((r) => setTimeout(r, 4000))
  for (const p of matados) {
    if (vivo(p.pid)) { try { process.kill(p.pid, 'SIGKILL'); log(`SIGKILL a ${p.pid}: ignoró SIGTERM`) } catch { /* nada */ } }
  }
}

// ── Tickets de cola y sellos de cupo de procesos muertos. ──
for (const sub of ['cola']) {
  const d = join(DIR, sub); if (!existsSync(d)) continue
  for (const f of readdirSync(d)) {
    const pid = Number(f.split('-').pop())
    if (pid && !vivo(pid) && !SECO) { try { unlinkSync(join(d, f)) } catch { /* nada */ } }
  }
}

const despues = medir()
const resumen = acciones.length
  ? acciones.join('\n')
  : 'sin huérfanos: no había nada que limpiar'
process.stdout.write(`barrido (${motivo}${SECO ? ', en seco' : ''}): ${candidatos.length} proceso(s) de desarrollo vistos\n${resumen}\n`
  + `memoria disponible ${antes.memDispMB} → ${despues.memDispMB} MB · swap ${antes.swapPct}% → ${despues.swapPct}%\n`)
try {
  mkdirSync(join(DIR, 'log'), { recursive: true })
  appendFileSync(join(DIR, 'log', 'barridos.log'), `${new Date().toISOString()}\t${motivo}\t${SECO ? 'seco' : 'real'}\t${acciones.length} acción(es)\t${acciones.join(' | ')}\n`)
} catch { /* el log es una ayuda, no un requisito */ }
