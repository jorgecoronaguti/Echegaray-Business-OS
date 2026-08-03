#!/usr/bin/env node
// ESTADO DE SESIÓN — el puente entre una sesión y la siguiente.
//
// POR QUÉ EXISTE. Cerrar Claude Code hoy pierde todo lo que no está en un archivo. La sesión que
// sigue arranca preguntando "¿en qué rama estoy?", "¿qué quedó a medio hacer?", "¿esto ya lo
// probé?" — y las responde releyendo el repo, que es la forma más cara de recordar. La medición de
// este repo lo muestra: 8.194 de los 26.185 comandos de shell del historial empiezan con `cd`
// reorientándose, y `interactive-server.mjs` se leyó entero 385 veces.
//
// Corre en dos momentos:
//   --inicio  (SessionStart) inyecta el estado real: rama, qué está sin commitear, últimos commits,
//             y el traspaso que dejó escrito la sesión anterior.
//   --fin     (SessionEnd) deja la marca mecánica de dónde quedó todo.
//
// ═══ TRES DECISIONES QUE IMPORTAN ═══
//
// 1. EL ESTADO SE CALCULA, NO SE LEE DE UN ARCHIVO. La rama y los archivos sucios salen de `git`
//    en el momento. Un archivo de estado escrito ayer miente hoy, y un traspaso que miente es peor
//    que ninguno: se actúa sobre él con confianza. Lo único que se lee de disco es la parte
//    SEMÁNTICA —qué estaba haciendo y por qué— que ningún comando puede deducir.
//
// 2. LO SEMÁNTICO LO ESCRIBO YO, A MANO, CON `/traspaso`. Este hook no inventa un resumen: no
//    tiene con qué. Si nadie escribió el traspaso, dice exactamente eso en vez de rellenar.
//
// 3. ES BARATO O NO ES. El techo es ~2.000 caracteres (~550 tokens). Se paga en cada arranque de
//    sesión, y el objetivo del sistema entero es bajar ese arranque, no subirlo. Si el traspaso es
//    más largo, se corta y se dice dónde leerlo completo.

import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const PROY = process.env.CLAUDE_PROJECT_DIR || resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const TECHO = 2000

const git = (args, cwd) => {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000 }).trim()
  } catch { return '' }
}

/**
 * La base real de trabajo.
 *
 * NO alcanza con mirar si el cwd tiene `package.json`: en los worktrees de este repo la raíz del
 * worktree NO lo tiene —el proyecto cuelga un nivel más abajo, en `echegaray-os/`— y el hook de
 * cierre ya arrastra ese defecto: cae al proyecto principal y valida el árbol equivocado. Acá se
 * prueba el cwd y, si no sirve, su subdirectorio `echegaray-os/`.
 */
export function baseDeTrabajo(cwd, existe = existsSync) {
  for (const c of [cwd, cwd && join(cwd, 'echegaray-os')]) {
    if (c && existe(join(c, 'package.json'))) return c
  }
  return PROY
}

/** Recorta sin mentir: si cortó, lo dice y dice dónde está el resto. */
export function recortar(txt, techo = TECHO, donde = '.claude/estado/traspaso.md') {
  if (!txt) return ''
  if (txt.length <= techo) return txt
  return `${txt.slice(0, techo).trimEnd()}\n[…recortado — el traspaso completo está en ${donde}]`
}

/** Arma el bloque que se inyecta. Función pura sobre datos ya recolectados: por eso es testeable. */
export function armarInicio({ rama, sucios, commits, traspaso, fechaTraspaso }) {
  const l = ['[estado de sesión · calculado al arrancar]']
  if (rama) l.push(`rama: ${rama}`)
  if (commits) l.push(`últimos commits:\n${commits}`)
  if (sucios && sucios.length) {
    const muestra = sucios.slice(0, 12).join(', ')
    l.push(`sin commitear (${sucios.length}): ${muestra}${sucios.length > 12 ? ', …' : ''}`)
  } else {
    l.push('sin commitear: nada — el árbol está limpio')
  }
  if (traspaso) {
    l.push(`\n── traspaso de la sesión anterior${fechaTraspaso ? ` (${fechaTraspaso})` : ''} ──`)
    l.push(recortar(traspaso))
    l.push('(Puede estar vencido. Verificá contra el estado real de arriba antes de actuar sobre él.)')
  } else {
    l.push('\nNo hay traspaso escrito. Si esta sesión deja trabajo a medio hacer, cerrala con `/traspaso`.')
  }
  return l.join('\n')
}

function inicio(BASE) {
  const rama = git(['rev-parse', '--abbrev-ref', 'HEAD'], BASE)
  const commits = git(['log', '-3', '--format=%h %s'], BASE)
  const sucios = git(['status', '--porcelain', '--untracked-files=normal'], BASE)
    .split('\n').map((s) => s.slice(3).trim()).filter(Boolean)

  let traspaso = ''; let fecha = ''
  const ruta = join(BASE, '.claude', 'estado', 'traspaso.md')
  try {
    if (existsSync(ruta)) {
      traspaso = readFileSync(ruta, 'utf8').trim()
      const m = traspaso.match(/^fecha:\s*(.+)$/m)
      if (m) fecha = m[1].trim()
    }
  } catch { /* sin traspaso se sigue igual: el estado calculado ya vale */ }

  const ctx = armarInicio({ rama, sucios, commits, traspaso, fechaTraspaso: fecha })
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: ctx },
  }))
}

function fin(BASE) {
  // La marca mecánica: dónde quedó todo, aunque nadie haya escrito el traspaso semántico.
  // No pisa `traspaso.md` — ese es mío y lo escribo con criterio; éste es el rastro automático.
  try {
    const dir = join(BASE, '.claude', 'estado')
    mkdirSync(dir, { recursive: true })
    const rama = git(['rev-parse', '--abbrev-ref', 'HEAD'], BASE)
    const sucios = git(['status', '--porcelain'], BASE).split('\n').filter(Boolean).length
    const commit = git(['log', '-1', '--format=%h %s'], BASE)
    writeFileSync(join(dir, 'ultima-sesion.json'), JSON.stringify({
      cuando: new Date().toISOString(), rama, archivosSucios: sucios, ultimoCommit: commit,
    }, null, 2))
  } catch { /* dejar rastro es deseable, no obligatorio: jamás romper el cierre */ }
}

async function main() {
  // Se consume stdin para no dejar al proceso padre escribiendo en un caño cerrado.
  try {
    await new Promise((r) => {
      const t = setTimeout(r, 3000)
      process.stdin.on('data', () => {}).on('end', () => { clearTimeout(t); r() }).on('error', () => { clearTimeout(t); r() })
    })
  } catch { /* sin entrada se sigue igual */ }

  const BASE = baseDeTrabajo(process.cwd())
  if (process.argv.includes('--fin')) fin(BASE)
  else inicio(BASE)
  process.exit(0)
}

if (process.argv[1] && process.argv[1].endsWith('estado-sesion.mjs')) {
  main().catch(() => process.exit(0)) // un hook roto nunca puede impedir abrir o cerrar una sesión
}
