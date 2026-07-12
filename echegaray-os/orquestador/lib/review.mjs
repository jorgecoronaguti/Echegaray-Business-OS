// Reviewer (Fase 4). Quality gate antes de aceptar un cambio. Contrato:
//   runReview(task, ws, ctx) -> { passed, gates:[{gate,passed,detail}], files }
//
// Gates SIEMPRE activos:
//   - cambio_presente      : una tarea de código produce un diff
//   - sin_rutas_prohibidas : nunca toca secretos/.env/credenciales
//   - policy_rutas_protegidas : NO escribe autónomamente el "cerebro" del OS
//     (CLAUDE.md, .claude/skills, .claude/memory, migraciones) — invariante D5.
//     Editar esas áreas es Nivel E (requiere aprobación humana): el gate falla
//     salvo autorización explícita cuya disposición de policy resuelva 'auto'.
//   - typecheck            : si cambió TS/TSX
// Gates OPCIONALES (task.inputs.review = { lint, build, dod }):
//   - lint / build         : corren npm run lint|build
//   - definition_of_done   : verifica que aparezcan las señales esperadas
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { changedFiles } from './workspace.mjs'
import { decide } from './policy.mjs'

const exec = promisify(execFile)

// rutas que un cambio autónomo NUNCA debe tocar sin aprobación (secretos)
const FORBIDDEN = [/^\.env/, /(^|\/)\.env(\.|$)/, /credentials\//, /\.pem$/, /service-account/]
// "cerebro" del OS: invariantes protegidos — escritura autónoma bloqueada (D5).
// Todo .claude/ (skills, memoria, config), los CLAUDE.md y las migraciones.
const PROTECTED = [/(^|\/)CLAUDE\.md$/, /(^|\/)\.claude\//, /(^|\/)supabase\/migrations\//]

export async function runReview(task, ws, ctx) {
  const files = await changedFiles(ws)
  const cfg = task.inputs?.review ?? {}
  const gates = []

  // Gate: el cambio existe
  gates.push({ gate: 'cambio_presente', passed: files.length > 0, detail: `${files.length} archivo(s)` })

  // Gate: no se tocaron rutas de secretos
  const forbidden = files.filter((f) => FORBIDDEN.some((re) => re.test(f)))
  gates.push({ gate: 'sin_rutas_prohibidas', passed: forbidden.length === 0, detail: forbidden.join(', ') || 'ok' })

  // Gate: rutas protegidas (invariante del cerebro del OS) — Policy Gate
  const protectedHits = files.filter((f) => PROTECTED.some((re) => re.test(f)))
  if (protectedHits.length) {
    // Solo pasa si hay autorización explícita Y la policy la resuelve 'auto'
    // (por defecto policy.raise_limits/domain son requires_approval -> NO auto).
    let allowed = false
    if (task.inputs?.allow_protected_paths) {
      const dispo = await decide(task.inputs.protected_capability || 'policy.raise_limits', ctx.context.systemPrincipalId, task.blast_override)
      allowed = dispo === 'auto'
    }
    gates.push({
      gate: 'policy_rutas_protegidas',
      passed: allowed,
      detail: allowed ? 'autorizado' : `bloqueado (requiere aprobación humana): ${protectedHits.join(', ')}`,
    })
  }

  // Gate: typecheck si cambió TS/TSX
  if (files.some((f) => /\.(ts|tsx)$/.test(f))) {
    const tc = await runGate(ws.path, 'npm', ['run', 'typecheck'])
    gates.push({ gate: 'typecheck', passed: tc.ok, detail: tc.ok ? 'ok' : tc.output.slice(-500) })
  }

  // Gate opcional: lint
  if (cfg.lint) {
    const r = await runGate(ws.path, 'npm', ['run', 'lint'])
    gates.push({ gate: 'lint', passed: r.ok, detail: r.ok ? 'ok' : r.output.slice(-500) })
  }
  // Gate opcional: build
  if (cfg.build) {
    const r = await runGate(ws.path, 'npm', ['run', 'build'])
    gates.push({ gate: 'build', passed: r.ok, detail: r.ok ? 'ok' : r.output.slice(-500) })
  }
  // Gate opcional: definition of done (señales esperadas en archivos cambiados/su contenido)
  if (Array.isArray(cfg.dod) && cfg.dod.length) {
    const dod = await definitionOfDone(ws, files, cfg.dod)
    gates.push({ gate: 'definition_of_done', passed: dod.ok, detail: dod.detail })
  }

  const passed = gates.every((g) => g.passed)
  ctx.logger.info('review', { task_id: task.id, passed, gates: gates.map((g) => `${g.gate}:${g.passed}`) })
  return { passed, gates, files }
}

/** Verifica que cada señal esperada aparezca como path cambiado o como substring
 *  dentro de algún archivo cambiado. Heurística de "hecho", explícita y auditable. */
async function definitionOfDone(ws, files, expected) {
  const missing = []
  for (const sig of expected) {
    if (files.some((f) => f.includes(sig))) continue
    let found = false
    for (const f of files) {
      try {
        const content = await readFile(path.join(ws.path, f), 'utf8')
        if (content.includes(sig)) { found = true; break }
      } catch { /* archivo borrado u ilegible */ }
    }
    if (!found) missing.push(sig)
  }
  return { ok: missing.length === 0, detail: missing.length ? `faltan señales: ${missing.join(', ')}` : 'ok' }
}

async function runGate(cwd, cmd, args) {
  try {
    const { stdout, stderr } = await exec(cmd, args, { cwd, maxBuffer: 10 * 1024 * 1024 })
    return { ok: true, output: stdout + stderr }
  } catch (err) {
    return { ok: false, output: String(err.stdout || '') + String(err.stderr || err.message) }
  }
}
