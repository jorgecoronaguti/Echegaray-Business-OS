// Handler de cambio de código (Fase 2): orquesta el Executor real.
//   worktree aislado -> engine (IA neutral) -> review -> commit LOCAL -> release.
// Nunca push/PR/merge (eso es Nivel E, requiere aprobación — Fase 5).
import { acquireWorktree, commitLocal, releaseWorktree } from '../lib/workspace.mjs'
import { resolveEngine } from '../engines/index.mjs'
import { runReview } from '../lib/review.mjs'
import { decide } from '../lib/policy.mjs'

function buildPrompt(task) {
  const target = task.inputs?.target_file ? `\nArchivo objetivo: ${task.inputs.target_file}` : ''
  return (
    `${task.goal || task.title}\n${target}\n\n` +
    `REGLAS ESTRICTAS:\n` +
    `- Trabajá SOLO dentro de este repositorio (el directorio actual es un worktree aislado).\n` +
    `- Modificá únicamente lo necesario para el objetivo. No toques secretos ni archivos .env.\n` +
    `- NO ejecutes git, NO hagas push, NO abras PRs. El sistema hará el commit local.\n` +
    (task.success_criteria ? `\nCriterio de éxito: ${task.success_criteria}\n` : '')
  )
}

function commitMessage(task, eng, engineName) {
  return (
    `orq(${task.type}): ${task.title}\n\n` +
    `Tarea ${task.id} ejecutada por el Work Fabric (engine ${engineName}).\n` +
    `Automático (Nivel C), sin revisión humana, sin push.\n` +
    (eng.sessionId ? `Engine session: ${eng.sessionId}\n` : '') +
    `\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`
  )
}

export async function codeChangeHandler(task, ctx) {
  const engineName = task.engine || task.inputs?.engine || 'claude-cli'
  const engine = resolveEngine(engineName)
  const ws = await acquireWorktree(task, ctx)
  let committed = false
  try {
    const eng = await engine.run(
      { prompt: buildPrompt(task), worktreePath: ws.path, model: task.inputs?.model, task, timeoutMs: ctx.config.ENGINE_TIMEOUT_MS },
      ctx,
    )

    const review = await runReview(task, ws, ctx)
    if (!review.passed) {
      const failed = review.gates.filter((g) => !g.passed).map((g) => g.gate).join(', ')
      throw new Error(`review no pasó (${failed})`)
    }

    // Policy gate antes del commit local (capacidad tipada git.commit_local).
    const dispo = await decide('git.commit_local', ctx.context.systemPrincipalId, task.blast_override)
    if (dispo !== 'auto') throw new Error(`commit local no autorizado por policy: ${dispo}`)

    const sha = await commitLocal(ws, commitMessage(task, eng, engineName))
    committed = true
    ctx.logger.info('commit local creado', { task_id: task.id, sha, branch: ws.branch })

    return {
      result: {
        engine: engineName,
        session_id: eng.sessionId,
        commit_sha: sha,
        branch: ws.branch,
        changed_files: review.files,
        cost: eng.cost,
      },
      evidence: {
        engine_summary: typeof eng.result === 'string' ? eng.result.slice(0, 2000) : eng.result,
        gates: review.gates,
        worktree: ws.path,
      },
    }
  } finally {
    await releaseWorktree(ws, ctx, { keepBranch: committed })
  }
}
