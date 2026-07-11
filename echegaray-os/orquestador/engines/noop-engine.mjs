// Engine no-op determinista: hace un cambio controlado en el worktree SIN usar
// IA ni gastar tokens. Sirve para validar todo el pipeline de ejecución
// (worktree -> cambio -> review -> commit -> release) de forma reproducible.
import { writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'

export const noopEngine = {
  async run(job) {
    const rel = job.task?.inputs?.target_file ?? 'echegaray-os/orquestador/.orq-sandbox/PRUEBA.md'
    const abs = path.join(job.worktreePath, rel)
    await mkdir(path.dirname(abs), { recursive: true })
    const content =
      `# Prueba controlada del Work Fabric\n\n` +
      `- tarea: ${job.task?.id ?? '(n/a)'}\n` +
      `- correlation_id: ${job.task?.correlation_id ?? '(n/a)'}\n` +
      `- generado: ${new Date().toISOString()}\n` +
      `- engine: noop-engine (sin IA)\n`
    await writeFile(abs, content, 'utf8')
    return {
      sessionId: null,
      result: `Escribí ${rel} (engine noop)`,
      exitCode: 0,
      cost: { usd: 0 },
      raw: { changedFile: rel },
    }
  },
}
