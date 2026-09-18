#!/usr/bin/env node
// ESTADO — qué está pasando con los recursos de desarrollo, en una pantalla.
// Uso: estado.mjs [--json]

import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { DIR, medir, politica, procesosDesarrollo, registros, vivo } from './comun.mjs'

const m = medir()
const pol = politica()
const procs = procesosDesarrollo().sort((a, b) => b.rssMB - a.rssMB)
const gobernados = registros().filter((r) => vivo(r.pid))

// Cupos: el sello `.quien` lo escribe quien toma el cupo; vale mientras ese pid viva.
const cupos = {}
const slots = join(DIR, 'slots')
if (existsSync(slots)) {
  for (const f of readdirSync(slots).filter((x) => x.endsWith('.quien'))) {
    const clase = f.split('.')[0]
    const txt = readFileSync(join(slots, f), 'utf8')
    const pid = Number((txt.match(/pid=(\d+)/) || [])[1])
    if (pid && vivo(pid)) (cupos[clase] ||= []).push({ pid, orden: txt.replace(/^.*pid=\d+ /, '').trim().slice(0, 80) })
  }
}
const cola = existsSync(join(DIR, 'cola'))
  ? readdirSync(join(DIR, 'cola')).map((f) => Number(f.split('-').pop())).filter((p) => p && vivo(p))
  : []

const emergencia = m.memDispMB < (pol.ECOS_EMERGENCIA_MB ?? 450) || m.swapPct > (pol.ECOS_EMERGENCIA_SWAP_PCT ?? 85)
const salida = { medicion: m, emergencia, cupos, cola, gobernados: gobernados.map((r) => ({ ...r, archivo: undefined })), procesos: procs, politica: pol }

if (process.argv.includes('--json')) { process.stdout.write(JSON.stringify(salida, null, 2) + '\n'); process.exit(0) }

const lineas = []
lineas.push(`memoria: ${m.memDispMB} MB disponibles de ${m.memTotalMB} · swap ${m.swapUsadoMB}/${m.swapTotalMB} MB (${m.swapPct}%) · carga ${m.carga1} / ${m.carga5} / ${m.carga15}`)
if (emergencia) lineas.push('⚠ EMERGENCIA: por debajo del umbral. No arranca trabajo pesado nuevo.')
for (const c of ['next', 'browser', 'validacion']) {
  const max = pol[`ECOS_MAX_${c.toUpperCase()}`] ?? 1
  const usados = cupos[c] || []
  lineas.push(`cupo ${c.padEnd(10)} ${usados.length}/${max}${usados.map((u) => `  · pid ${u.pid}: ${u.orden}`).join('')}`)
}
lineas.push(`cola: ${cola.length ? cola.map((p) => `pid ${p}`).join(', ') : 'vacía'}`)
lineas.push(`procesos de desarrollo vivos: ${procs.length}${procs.length ? '' : ' (ninguno)'}`)
for (const p of procs.slice(0, 15)) {
  const huerfano = p.ppid === 1 ? ' HUÉRFANO' : ''
  lineas.push(`  ${String(p.pid).padStart(8)}  ${String(p.rssMB).padStart(5)} MB  ${p.clase.padEnd(10)} ${p.enScope ? 'gobernado' : 'suelto   '}${huerfano}  ${p.cmd.slice(0, 70)}`)
}
process.stdout.write(lineas.join('\n') + '\n')
