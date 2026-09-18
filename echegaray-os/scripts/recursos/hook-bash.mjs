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
// `xargs` también es un envoltorio: `find … | xargs npx tsc` corre tsc, y sin quitarlo el tramo
// empezaba con `xargs` y la expresión anclada no lo veía.
const ENVOLTORIOS = /^(?:[A-Z_][A-Z0-9_]*=(?:"[^"]*"|'[^']*'|\S*)\s+|timeout\s+(?:-\S+\s+)*\d+[smh]?\s+|nohup\s+|env\s+|time\s+|nice\s+(?:-n\s*\d+\s+)?|ionice\s+\S+\s+|exec\s+|xargs\s+(?:-{1,2}\S+\s+)*)+/

// Sin heredocs: su cuerpo es contenido de un archivo, no comandos.
function sinHeredocs(texto) {
  return texto.replace(/<<-?\s*['"]?([A-Za-z_][A-Za-z0-9_]*)['"]?[^\n]*\n[\s\S]*?\n\s*\1\s*(?=\n|$)/g, '')
}

/**
 * Parte el comando en tramos por los separadores de shell que están FUERA DE COMILLAS.
 *
 * ANTES SE PARTÍA CON UN `split` A SECAS. `grep -n "eslintConfig\|eslint" package.json` quedaba partido
 * por el `|` de adentro de las comillas y el segundo pedazo empezaba con `eslint"`: el hook frenaba una
 * lectura inofensiva. Lo que está entre comillas es UN ARGUMENTO, no un tramo de tubería.
 *
 * ═══ LA COMILLA SIN CERRAR (auditoría del 18/09/2026, primera versión NO INSTALABLE) ═══
 *
 * La primera versión de este partidor decía acá que «una comilla sin cerrar no rompe nada: el resto
 * queda como un solo tramo y se evalúa igual». ERA FALSO, y la auditoría lo ejecutó:
 *
 *     echo hola  # no anduvo, don't
 *     npx tsc --noEmit
 *
 * El apóstrofo de «don't» —en un comentario, que el shell ni mira— abría una comilla que nunca cerraba,
 * se tragaba el salto de línea, y el resto quedaba como un tramo que EMPIEZA con texto inofensivo. Como
 * las expresiones de PESADOS están ancladas con `^`, nada de lo que venía después se evaluaba nunca.
 * Bash corría las dos líneas. Lo mismo con `$'no\'anduvo'; npx tsc` (la barra sí escapa en `$'…'`).
 *
 * POR ESO EL ANÁLISIS ES UNA ESCALERA, y cada escalón parte MÁS que el anterior — nunca menos:
 *   1. comillas simples y dobles. Si todas cierran, vale: es el caso del falso positivo de grep.
 *   2. si quedó una abierta, se reintenta tomando `'` como texto (el apóstrofo de prosa es la causa
 *      habitual). Si así cierra todo, vale. Honra más separadores que el 1: es más estricto.
 *   3. si ni así cierra, el análisis fino no es confiable para ESTE comando y se cae al particionado
 *      ingenuo de siempre, que parte por todo separador sin mirar comillas.
 * NO se usa la unión del ingenuo con el fino: el ingenuo es justamente el que fabrica el falso positivo
 * de grep, y la unión lo devolvería. Sólo se cae al ingenuo cuando el fino no pudo cerrar sus comillas.
 */
function escanear(texto, cuentaComillaSimple) {
  const partes = []
  let actual = '', comilla = ''
  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i]
    if (comilla) {
      // Dentro de comillas dobles la barra escapa; dentro de simples, el shell la toma literal.
      if (ch === '\\' && comilla === '"' && i + 1 < texto.length) { actual += ch + texto[++i]; continue }
      if (ch === comilla) comilla = ''
      actual += ch; continue
    }
    if (ch === '"' || (ch === "'" && cuentaComillaSimple)) { comilla = ch; actual += ch; continue }
    if (ch === '\\' && i + 1 < texto.length) { actual += ch + texto[++i]; continue }  // `\|` escapado no parte
    if ((ch === '&' && texto[i + 1] === '&') || (ch === '|' && texto[i + 1] === '|')) { partes.push(actual); actual = ''; i++; continue }
    if (ch === '|' || ch === ';' || ch === '\n' || ch === '(') { partes.push(actual); actual = ''; continue }
    actual += ch
  }
  partes.push(actual)
  return { partes, abierta: comilla !== '' }
}
function partir(texto) {
  let r = escanear(texto, true)
  if (!r.abierta) return r.partes
  r = escanear(texto, false)
  if (!r.abierta) return r.partes
  return texto.split(/&&|\|\||;|\||\n|\(/)
}

/**
 * Sustitución de comandos: `$(…)` y `` `…` `` se EJECUTAN aunque estén entre comillas dobles, así que
 * `echo "$(npx tsc --noEmit)"` corre tsc. Se extrae su interior y se analiza como otro comando.
 * `$((…))` es aritmética y se saltea. Entre comillas SIMPLES no hay sustitución (`grep 'usar `npx tsc`'`
 * es texto) — pero sólo si las simples cierran: con un apóstrofo suelto se miran todas, que es lo
 * conservador.
 */
function sustituciones(texto) {
  const out = []
  const simplesCierran = !escanear(texto, true).abierta
  let doble = false
  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i]
    if (ch === '\\') { i++; continue }
    if (ch === '"') { doble = !doble; continue }
    if (ch === "'" && !doble && simplesCierran) {
      const fin = texto.indexOf("'", i + 1)
      if (fin < 0) break
      i = fin; continue
    }
    if (ch === '`') {
      const fin = texto.indexOf('`', i + 1)
      if (fin < 0) break
      out.push(texto.slice(i + 1, fin)); i = fin; continue
    }
    if (ch === '$' && texto[i + 1] === '(' && texto[i + 2] !== '(') {
      let prof = 1, j = i + 2
      while (j < texto.length && prof > 0) {
        if (texto[j] === '\\') { j += 2; continue }
        if (texto[j] === '(') prof++
        else if (texto[j] === ')') prof--
        j++
      }
      if (prof === 0) { out.push(texto.slice(i + 2, j - 1)); i = j - 1 }
    }
  }
  return out
}

/**
 * Comandos que llevan OTRO comando adentro como argumento, y se re-analizan:
 *   `bash -c "…"`, `sh -c '…'`, `zsh -c …`   y   `eval "…"` / `eval …`.
 * La comilla doble tolera comillas escapadas: `bash -c "echo \"corriendo\" && npm run typecheck"`
 * se cortaba en la primera `\"` y el interior nunca se miraba.
 *
 * `ssh maquina "…"` NO se re-analiza, A PROPÓSITO: eso corre en otra máquina y no gasta los recursos
 * de esta VM, que es lo único que este portero gobierna.
 */
const CON_INTERIOR = /^(?:(?:bash|sh|zsh)\s+(?:-\S+\s+)*-c|eval)\s+(?:"((?:[^"\\]|\\[\s\S])*)"|'([^']*)'|(\S[\s\S]*))$/

// Los tramos: cada comando simple, más lo que va adentro de `bash -c`, `eval`, `$(…)` y backticks.
//
// AGUJEROS CONOCIDOS, que nadie debe leer como cubiertos: un comando guardado en una variable y
// expandido (`C="npx tsc"; $C`), un here-string (`sh <<< "npx tsc"`), alias y funciones de shell,
// `npx --yes tsc` y el binario llamado por ruta (`./node_modules/.bin/tsc`), y un script propio que
// adentro lance lo pesado. El hook es la primera barrera, no la única: lo que se le escapa sigue sin
// cupo, y lo ve `ecos estado` y lo limpia `barrer.mjs` si queda huérfano.
function tramos(texto) {
  const out = []
  const sinDocs = sinHeredocs(texto)
  for (const t of partir(sinDocs)) {
    const limpio = t.trim().replace(ENVOLTORIOS, '')
    if (!limpio) continue
    out.push(limpio)
    const c = limpio.match(CON_INTERIOR)
    if (c) {
      const dentro = c[1] !== undefined ? c[1].replace(/\\(["\\$`])/g, '$1') : (c[2] ?? c[3] ?? '')
      out.push(...tramos(dentro))
    }
  }
  for (const s of sustituciones(sinDocs)) out.push(...tramos(s))
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

// LA FORMA DE UNA PRUEBA DE NAVEGADOR SE DICE ACÁ, NO SE SUPONE. El 18/09/2026 un agente dejó abierto
// un `ecos next` (servidor de desarrollo) y pidió el navegador por separado: el servidor no soltaba su
// cupo hasta correr la prueba, y la prueba esperaba detrás de un `e2e` ajeno que necesitaba ese mismo
// servidor. Se pide UNA sola reserva: `e2e` toma `next` y `browser` juntos y Playwright levanta y
// apaga su propio servidor con E2E_PORT.
const forma = hallazgo.clase === 'e2e'
  ? `E2E_PORT=3xxx ecos e2e -- ${hallazgo.tramo}`
  : `ecos ${hallazgo.clase} -- ${hallazgo.tramo}`
const razon =
  `Recursos: este comando es trabajo pesado (${hallazgo.clase}) y en esta VM sólo puede correr por el portero. `
  + `Lanzalo así:  ${forma}   `
  + (hallazgo.clase === 'e2e'
    ? 'Una sola reserva: e2e toma `next` y `browser` juntos y Playwright levanta y apaga SU propio servidor con E2E_PORT. '
      + 'NO dejes un `ecos next` abierto mientras esperás el navegador: el servidor retiene el cupo que el otro necesita y se traban. '
    : '')
  + `(si no hay recursos, ecos espera en cola y avisa; nunca lanza encima de lo que ya corre). Ver: ecos estado`
process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: razon } }))
