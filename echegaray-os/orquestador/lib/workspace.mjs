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

  // nombre único POR INTENTO: los reintentos no colisionan con la branch/worktree
  // que dejó el intento anterior (fallido o crasheado).
  const short = String(task.id).slice(0, 8)
  const attempt = task.attempt ?? 1
  const branch = `orq/${(task.type || 'task').replace(/[^a-z0-9_-]/gi, '-')}/${short}-a${attempt}`
  const wtPath = path.join(cfg.WORKSPACES_DIR, `${task.id}-a${attempt}`)

  await mkdir(cfg.WORKSPACES_DIR, { recursive: true })
  const { stdout: head } = await git(repoRoot, ['rev-parse', 'HEAD'])
  await git(repoRoot, ['worktree', 'add', '--quiet', '-b', branch, wtPath, head.trim()])

  ctx.logger.info('worktree creado', { task_id: task.id, branch, path: wtPath })
  return { repoRoot, path: wtPath, branch }
}

/** Lista de archivos cambiados en el worktree. `-uall` lista los untracked de
 *  forma INDIVIDUAL (sin colapsar directorios nuevos), para que el reviewer vea
 *  cada archivo — clave para detectar rutas protegidas/prohibidas con precisión. */
export async function changedFiles(ws) {
  const { stdout } = await git(ws.path, ['status', '--porcelain', '-uall'])
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

/** Remueve el worktree. Con keepBranch=true la branch persiste (para inspección
 *  del commit); con keepBranch=false borra la branch (intento fallido sin commit,
 *  para no acumular ramas vacías). Seguro e idempotente. */
export async function releaseWorktree(ws, ctx, { keepBranch = true } = {}) {
  const cfg = loadConfig()
  if (!ws?.path?.startsWith(cfg.WORKSPACES_DIR)) {
    ctx?.logger?.warn('releaseWorktree: path fuera de WORKSPACES_DIR, no se toca', { path: ws?.path })
    return
  }
  try {
    await git(ws.repoRoot, ['worktree', 'remove', '--force', ws.path])
    if (!keepBranch) await git(ws.repoRoot, ['branch', '-D', ws.branch]).catch(() => {})
    ctx?.logger?.info('worktree removido', { path: ws.path, branch: ws.branch, keepBranch })
  } catch (err) {
    ctx?.logger?.warn('releaseWorktree falló (se reintentará por limpieza periódica)', { error: err.message })
  }
}
