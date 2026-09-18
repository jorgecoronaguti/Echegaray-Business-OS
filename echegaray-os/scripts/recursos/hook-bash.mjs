#!/usr/bin/env node
// PORTERO DE BASH (hook PreToolUse) — ningún comando pesado sale sin pasar por `ecos`.
//
// Es la pieza que hace que la política no dependa de que alguien se acuerde. Claude Code, sus agentes
// y los worktrees ejecutan todo por la herramienta Bash; este hook mira cada comando ANTES de que
// corra. Si es trabajo pesado (servidor Next, Playwright/Chromium, tsc, eslint, suite, build) y no
// está gobernado, lo rechaza y dice exactamente cómo lanzarlo. Nada más: no reescribe, no ejecuta.
//
// Un comando está gobernado si:
//   - ya viene envuelto en `ecos …` (o corre adentro de una tarea de ecos: ECOS_ACTIVO en el entorno);
//   - es un `npm run <script>` cuyo script en el package.json de ESE directorio ya pasa por ecos.
//     Esto importa porque hay más de cien worktrees viejos: en ellos `npm run typecheck` sigue siendo
//     un `tsc` pelado, y ahí el hook lo frena y pide la forma gobernada.
//
// Entra por stdin el JSON del evento. Sale JSON con permissionDecision=deny si hay que frenar; en
// cualquier otro caso (incluido cualquier error propio) no dice nada y el comando sigue. Un hook roto
// NUNCA traba una sesión.

import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const entrada = await new Promise((r) => { let s = ''; process.stdin.on('data', (d) => (s += d)).on('end', () => r(s)) })
let ev = {}
try { ev = JSON.parse(entrada || '{}') } catch { process.exit(0) }
if (ev.tool_name !== 'Bash') process.exit(0)
const cmd = String(ev.tool_input?.command || '')
if (!cmd.trim()) process.exit(0)

// Ya gobernado: envuelto en ecos, o corriendo adentro de una tarea de ecos.
if (process.env.ECOS_ACTIVO || /(^|[\s;&|(])(ecos|scripts\/recursos\/ecos|[^\s]*\/bin\/ecos)\s+(next|browser|validacion|e2e)\b/.test(cmd)) process.exit(0)
// Consultas del propio portero: nunca se frenan.
if (/\becos\s+(estado|barrer|hay-recursos)\b/.test(cmd)) process.exit(0)

/**
 * Formas pesadas y la clase de ecos que les corresponde. Se evalúan ANCLADAS AL INICIO de cada tramo
 * del comando (lo que va entre `;`, `&&`, `||`, `|`, `(` o saltos de línea), después de quitarle
 * variables de entorno y envoltorios (`timeout 60`, `nohup`, `env`, `nice`). Un `next dev` adentro de
 * un `sed`, de un `echo` o de un heredoc que escribe un README NO es un servidor: es texto.
 */
const PESADOS = [
  { clase: 'next',       re: /^(npx\s+)?next\s+(dev|build)\b|^npm\s+run\s+(dev|build)\b|^(pnpm|yarn)\s+(dev|build)\b/ },
  { clase: 'e2e',        re: /^(npx\s+)?playwright\s+(test|screenshot|codegen)\b|^npm\s+run\s+(e2e|test:e2e)\b/ },
  { clase: 'validacion', re: /^(npx\s+)?tsc\b|^npm\s+run\s+(typecheck|lint|orq:test|test)\b|^(npx\s+)?eslint\b|^node\s+--test\b|^(npx\s+)?(vitest|jest)\b/ },
]
const ENVOLTORIOS = /^(?:[A-Z_][A-Z0-9_]*=(?:"[^"]*"|'[^']*'|\S*)\s+|timeout\s+(?:-\S+\s+)*\d+[smh]?\s+|nohup\s+|env\s+|time\s+|nice\s+(?:-n\s*\d+\s+)?|ionice\s+\S+\s+|exec\s+)+/

// Sin heredocs: su cuerpo es contenido de un archivo, no comandos.
function sinHeredocs(texto) {
  return texto.replace(/<<-?\s*['"]?([A-Za-z_][A-Za-z0-9_]*)['"]?[^\n]*\n[\s\S]*?\n\s*\1\s*(?=\n|$)/g, '')
}
// Los tramos: cada comando simple, más el interior de `bash -c "…"` / `sh -c '…'`.
function tramos(texto) {
  const out = []
  for (const t of sinHeredocs(texto).split(/&&|\|\||;|\||\n|\(/)) {
    const limpio = t.trim().replace(ENVOLTORIOS, '')
    if (!limpio) continue
    out.push(limpio)
    const c = limpio.match(/^(?:bash|sh|zsh)\s+(?:-\S+\s+)*-c\s+(?:"([^"]*)"|'([^']*)')/)
    if (c) out.push(...tramos(c[1] ?? c[2] ?? ''))
  }
  return out
}

// ¿El `npm run X` de este directorio ya está gobernado adentro del package.json?
function scriptGobernado(nombre, cwd) {
  for (const dir of [cwd, join(cwd, 'echegaray-os')]) {
    const p = join(dir, 'package.json'); if (!existsSync(p)) continue
    try {
      const sc = JSON.parse(readFileSync(p, 'utf8')).scripts?.[nombre]
      if (typeof sc === 'string') return /recursos\/ecos\b/.test(sc)
    } catch { /* package.json roto: se trata como no gobernado */ }
  }
  return false
}

const cwd = ev.cwd || process.cwd()
// Los `cd X && …` cambian dónde se resuelve el package.json: se toma el último `cd` explícito.
const cdm = [...cmd.matchAll(/(?:^|[;&|]\s*)cd\s+([^\s;&|]+)/g)].pop()
const dirEfectivo = cdm ? (cdm[1].startsWith('/') ? cdm[1] : join(cwd, cdm[1])) : cwd

let hallazgo = null
for (const t of tramos(cmd)) {
  for (const { clase, re } of PESADOS) {
    if (!re.test(t)) continue
    const npm = t.match(/^npm\s+run\s+([\w:.-]+)/)
    if (npm && scriptGobernado(npm[1], dirEfectivo)) continue
    // `node --test archivo.mjs` de UN archivo es liviano y se deja pasar; la suite entera no.
    if (/^node\s+--test\s+\S+\.test\.mjs\s*$/.test(t) && !/\*/.test(t)) continue
    hallazgo = { clase, tramo: t }
    break
  }
  if (hallazgo) break
}
if (!hallazgo) process.exit(0)

const razon =
  `Recursos: este comando es trabajo pesado (${hallazgo.clase}) y en esta VM sólo puede correr por el portero. `
  + `Lanzalo así:  ecos ${hallazgo.clase} -- ${hallazgo.tramo}   `
  + `(si no hay recursos, ecos espera en cola y avisa; nunca lanza encima de lo que ya corre). Ver: ecos estado`
process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: razon } }))
