// Reviewer básico (Fase 2). Quality gate mínimo antes de aceptar un cambio. El
// Reviewer completo (typecheck+lint+build+tests+code-review+definition of done)
// llega en Fase 4; acá se establece el contrato y los gates de seguridad.
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { changedFiles } from './workspace.mjs'

const exec = promisify(execFile)

// rutas que un cambio autónomo NUNCA debe tocar sin aprobación (defensa en profundidad)
const FORBIDDEN = [/^\.env/, /(^|\/)\.env(\.|$)/, /credentials\//, /\.pem$/, /service-account/]

export async function runReview(task, ws, ctx) {
  const files = await changedFiles(ws)
  const gates = []

  // Gate 1: el cambio existe (una tarea de código debe producir un diff)
  const changed = files.length > 0
  gates.push({ gate: 'cambio_presente', passed: changed, detail: `${files.length} archivo(s)` })

  // Gate 2: no se tocaron rutas prohibidas
  const violations = files.filter((f) => FORBIDDEN.some((re) => re.test(f)))
  gates.push({ gate: 'sin_rutas_prohibidas', passed: violations.length === 0, detail: violations.join(', ') || 'ok' })

  // Gate 3: si cambió código TS/TSX, typecheck debe pasar
  const codeChanged = files.some((f) => /\.(ts|tsx)$/.test(f))
  if (codeChanged) {
    const tc = await runGate(ws.path, 'npm', ['run', 'typecheck'])
    gates.push({ gate: 'typecheck', passed: tc.ok, detail: tc.ok ? 'ok' : tc.output.slice(-500) })
  }

  const passed = gates.every((g) => g.passed)
  ctx.logger.info('review', { task_id: task.id, passed, gates: gates.map((g) => `${g.gate}:${g.passed}`) })
  return { passed, gates, files }
}

async function runGate(cwd, cmd, args) {
  try {
    const { stdout, stderr } = await exec(cmd, args, { cwd, maxBuffer: 10 * 1024 * 1024 })
    return { ok: true, output: stdout + stderr }
  } catch (err) {
    return { ok: false, output: String(err.stdout || '') + String(err.stderr || err.message) }
  }
}
