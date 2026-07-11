// Adaptador Claude Code CLI headless (`claude -p`). Un motor detrás del port.
// Reutiliza NATIVAMENTE el cerebro del repo (CLAUDE.md, skills, memoria) porque
// corre con cwd dentro del worktree del repo — sin re-cablear nada (D3).
//
// Guardarraíl de la política de autonomía EN EL BORDE del motor: por defecto solo
// se permiten herramientas de edición de archivos (sin Bash/red/MCP). El motor NO
// puede pushear, correr comandos ni salir a la red. El commit local lo hace el
// Fabric, no el motor.
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'

const DEFAULT_ALLOWED = 'Read,Edit,Write,Glob,Grep'
const DEFAULT_DISALLOWED = 'Bash,WebFetch,WebSearch,Task,NotebookEdit'
const DEFAULT_MODEL = process.env.ORQ_CLAUDE_MODEL || 'sonnet'

export const claudeCliEngine = {
  async run(job, ctx) {
    const sessionId = randomUUID()
    const model = job.model || DEFAULT_MODEL
    const allowed = job.allowedTools || DEFAULT_ALLOWED
    const timeoutMs = job.timeoutMs || ctx.config.ENGINE_TIMEOUT_MS

    const args = [
      '-p', job.prompt,
      '--output-format', 'json',
      '--permission-mode', 'acceptEdits',
      '--model', model,
      '--add-dir', job.worktreePath,
      '--allowedTools', allowed,
      '--disallowedTools', DEFAULT_DISALLOWED,
      '--session-id', sessionId,
    ]

    ctx.logger.info('claude-cli: lanzando', { model, sessionId, cwd: job.worktreePath, allowed })

    // hereda el entorno (auth del CLI ya presente en la VM) pero NUNCA filtra los
    // secretos del Fabric al subproceso del motor.
    const childEnv = { ...process.env }
    delete childEnv.DATABASE_URL
    delete childEnv.SUPABASE_SERVICE_ROLE_KEY

    const { stdout, stderr, code, timedOut } = await runProcess('claude', args, {
      cwd: job.worktreePath,
      timeoutMs,
      env: childEnv,
    })

    if (timedOut) throw new Error(`claude-cli: timeout tras ${timeoutMs}ms (sesión ${sessionId})`)
    if (code !== 0) throw new Error(`claude-cli: exit ${code}. stderr: ${String(stderr).slice(0, 500)}`)

    let parsed
    try {
      parsed = JSON.parse(stdout)
    } catch {
      throw new Error(`claude-cli: salida no-JSON. stdout: ${String(stdout).slice(0, 500)}`)
    }

    return {
      sessionId: parsed.session_id || sessionId,
      result: parsed.result ?? '',
      exitCode: code,
      cost: { usd: parsed.total_cost_usd ?? null },
      tokens: parsed.usage ?? null,
      raw: { subtype: parsed.subtype, num_turns: parsed.num_turns, is_error: parsed.is_error },
    }
  },
}

function runProcess(cmd, args, { cwd, timeoutMs, env }) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGTERM')
      setTimeout(() => child.kill('SIGKILL'), 5000)
    }, timeoutMs)
    child.stdout.on('data', (d) => (stdout += d))
    child.stderr.on('data', (d) => (stderr += d))
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ stdout, stderr, code, timedOut })
    })
    child.on('error', (err) => {
      clearTimeout(timer)
      resolve({ stdout, stderr: String(err), code: -1, timedOut })
    })
  })
}
