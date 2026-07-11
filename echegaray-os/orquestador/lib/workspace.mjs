// Workspace Manager: aísla cada tarea en su propio git worktree + branch. Nunca
// toca el working tree principal ni pushea. Limpieza segura (solo remueve
// worktrees que creó, bajo WORKSPACES_DIR).
import { execFile } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { loadConfig } from './config.mjs'

const exec = promisify(execFile)
const git = (repoRoot, args, opts = {}) => exec('git', ['-C', repoRoot, ...args], { maxBuffer: 10 * 1024 * 1024, ...opts })

/** Crea un worktree aislado sobre una branch nueva basada en HEAD del repo. */
export async function acquireWorktree(task, ctx) {
  const cfg = loadConfig()
  const repoRoot = ctx.context.repository?.rootPath
  if (!repoRoot) throw new Error('Repositorio sin root_path en orq.repositories')

  const short = String(task.id).slice(0, 8)
  const branch = `orq/${(task.type || 'task').replace(/[^a-z0-9_-]/gi, '-')}/${short}`
  const wtPath = path.join(cfg.WORKSPACES_DIR, String(task.id))

  await mkdir(cfg.WORKSPACES_DIR, { recursive: true })
  const { stdout: head } = await git(repoRoot, ['rev-parse', 'HEAD'])
  await git(repoRoot, ['worktree', 'add', '--quiet', '-b', branch, wtPath, head.trim()])

  ctx.logger.info('worktree creado', { task_id: task.id, branch, path: wtPath })
  return { repoRoot, path: wtPath, branch }
}

/** Lista de archivos cambiados (porcelain) en el worktree. */
export async function changedFiles(ws) {
  const { stdout } = await git(ws.path, ['status', '--porcelain'])
  return stdout
    .split('\n')
    .map((l) => l.slice(3).trim())
    .filter(Boolean)
}

/** Commit LOCAL en la branch del worktree. NUNCA push. Devuelve el sha. */
export async function commitLocal(ws, message) {
  await git(ws.path, ['add', '-A'])
  await git(ws.path, ['commit', '--quiet', '-m', message])
  const { stdout: sha } = await git(ws.path, ['rev-parse', 'HEAD'])
  return sha.trim()
}

/** Remueve el worktree (la branch persiste, para inspección). Seguro e idempotente. */
export async function releaseWorktree(ws, ctx) {
  const cfg = loadConfig()
  if (!ws?.path?.startsWith(cfg.WORKSPACES_DIR)) {
    ctx?.logger?.warn('releaseWorktree: path fuera de WORKSPACES_DIR, no se toca', { path: ws?.path })
    return
  }
  try {
    await git(ws.repoRoot, ['worktree', 'remove', '--force', ws.path])
    ctx?.logger?.info('worktree removido', { path: ws.path, branch: ws.branch })
  } catch (err) {
    ctx?.logger?.warn('releaseWorktree falló (se reintentará por limpieza periódica)', { error: err.message })
  }
}
