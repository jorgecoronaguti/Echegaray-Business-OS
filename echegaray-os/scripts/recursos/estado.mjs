#!/usr/bin/env node
// ESTADO — qué está pasando con los recursos de desarrollo, en una pantalla.
// Uso: estado.mjs [--json]

import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { DIR, medir, politica, procesosDesarrollo, registros, vivo } from './comun.mjs'

const m = medir()
const pol = politica()
const procs = procesosDesarrollo().sort((a, b) => b.rssMB - a.rssMB)
const gobernados = registros().filter((r) => vivo(r.pid))

// ═══ CUPOS: LA EVIDENCIA ES EL CANDADO, NO EL SELLO (18/09/2026) ═══
//
// Este panel informaba el cupo a partir del sello `.quien`, y el sello mentía: un pedido de `e2e` que
// conseguía `browser` y no conseguía `next` devolvía el candado pero dejaba el sello escrito. El panel
// mostraba al mismo tiempo «cupo browser 1/1 · pid N» y a ese pid EN LA COLA. Con ese panel el bloqueo
// mutuo de ese día era indiagnosticable: decía que el cupo estaba tomado por quien lo estaba pidiendo.
//
// Ahora se le pregunta al candado (`flock -n`: si lo consigue, estaba libre) y el sello sólo aporta el
// nombre. Un sello sin candado se muestra como HUÉRFANO en vez de como dueño.
function estadoCandado(archivo) {
  if (!existsSync(archivo)) return 'libre'
  try { execFileSync('flock', ['-n', archivo, 'true'], { stdio: 'ignore' }); return 'libre' }
  catch (e) { return e?.status === 1 ? 'tomado' : 'desconocido' }
}
function leerSello(archivo) {
  if (!existsSync(archivo)) return null
  const txt = readFileSync(archivo, 'utf8').trim()
  const campo = (k) => (txt.match(new RegExp(`\\b${k}=(\\S+)`)) || [])[1]
  const pid = Number(campo('pid'))
  if (!pid) return null
  // Los sellos de la versión anterior no traen `dueno=` ni `orden=`: ahí el comando es lo que sigue al
  // pid, y la sesión es desconocida. Vale mientras conviven las dos versiones.
  const orden = txt.includes(' orden=') ? txt.split(' orden=')[1] : txt.replace(/^\S+ pid=\d+\s*/, '')
  return { pid, dueno: Number(campo('dueno') || 0) || null, desde: txt.split(' ')[0], orden: orden.slice(0, 80), vivo: vivo(pid) }
}

const CLASES = ['next', 'browser', 'validacion']
const slots = join(DIR, 'slots')
const cupos = {}
for (const clase of CLASES) {
  const max = pol[`ECOS_MAX_${clase.toUpperCase()}`] ?? 1
  cupos[clase] = { max, ranuras: [] }
  for (let i = 1; i <= max; i++) {
    const candado = estadoCandado(join(slots, `${clase}.${i}.lock`))
    const sello = leerSello(join(slots, `${clase}.${i}.quien`))
    cupos[clase].ranuras.push({ i, candado, sello, selloHuerfano: !!sello && candado === 'libre' })
  }
  cupos[clase].usados = cupos[clase].ranuras.filter((r) => r.candado !== 'libre').length
}

// La cola, con lo que pide cada uno y cuánto hace que espera: sin eso no se ve quién traba a quién.
const cola = existsSync(join(DIR, 'cola'))
  ? readdirSync(join(DIR, 'cola')).sort().map((f) => {
      const t = f.match(/^(\d+)-([a-z+]+)-(\d+)$/)
      if (!t) return null
      const pid = Number(t[3])
      return vivo(pid) ? { pid, clases: t[2], esperaS: Math.max(0, Math.round((Date.now() - Number(t[1]) / 1e6) / 1000)) } : null
    }).filter(Boolean)
  : []

const emergencia = m.memDispMB < (pol.ECOS_EMERGENCIA_MB ?? 450) || m.swapPct > (pol.ECOS_EMERGENCIA_SWAP_PCT ?? 85)
const salida = { medicion: m, emergencia, cupos, cola, gobernados: gobernados.map((r) => ({ ...r, archivo: undefined })), procesos: procs, politica: pol }

if (process.argv.includes('--json')) { process.stdout.write(JSON.stringify(salida, null, 2) + '\n'); process.exit(0) }

const lineas = []
lineas.push(`memoria: ${m.memDispMB} MB disponibles de ${m.memTotalMB} · swap ${m.swapUsadoMB}/${m.swapTotalMB} MB (${m.swapPct}%) · carga ${m.carga1} / ${m.carga5} / ${m.carga15}`)
if (emergencia) lineas.push('⚠ EMERGENCIA: por debajo del umbral. No arranca trabajo pesado nuevo.')
for (const c of CLASES) {
  const { max, usados, ranuras } = cupos[c]
  const detalle = ranuras.map((r) => {
    if (r.selloHuerfano) return `  · LIBRE, con sello huérfano de pid ${r.sello.pid} (lo limpia \`ecos barrer\`)`
    if (r.candado === 'libre') return ''
    if (!r.sello) return '  · tomado (todavía sin sellar)'
    return `  · pid ${r.sello.pid} (sesión ${r.sello.dueno ?? '?'}) desde ${r.sello.desde}: ${r.sello.orden}${r.sello.vivo ? '' : ' [SU PROCESO YA NO EXISTE]'}`
  }).join('')
  lineas.push(`cupo ${c.padEnd(10)} ${usados}/${max}${detalle}`)
}
lineas.push(`cola: ${cola.length ? cola.map((q) => `pid ${q.pid} pide ${q.clases} (espera ${q.esperaS}s)`).join(' · ') : 'vacía'}`)
lineas.push(`procesos de desarrollo vivos: ${procs.length}${procs.length ? '' : ' (ninguno)'}`)
for (const p of procs.slice(0, 15)) {
  const huerfano = p.ppid === 1 ? ' HUÉRFANO' : ''
  lineas.push(`  ${String(p.pid).padStart(8)}  ${String(p.rssMB).padStart(5)} MB  ${p.clase.padEnd(10)} ${p.enScope ? 'gobernado' : 'suelto   '}${huerfano}  ${p.cmd.slice(0, 70)}`)
}
process.stdout.write(lineas.join('\n') + '\n')
