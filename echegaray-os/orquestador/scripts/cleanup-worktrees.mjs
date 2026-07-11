#!/usr/bin/env node
// Limpieza de worktrees huérfanos (crashes): poda registros muertos de git y
// borra directorios bajo WORKSPACES_DIR que ya no son worktrees vivos y llevan
// más de 1 hora sin tocarse (para no pisar una tarea en curso). Idempotente.
import { execFile } from 'node:child_process'
import { readdir, stat, rm } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { loadConfig } from '../lib/config.mjs'
import { resolveContext } from '../lib/identity.mjs'
import { createLogger } from '../lib/logger.mjs'
import { closePool } from '../lib/db.mjs'

const exec = promisify(execFile)
const log = createLogger({ component: 'cleanup-worktrees' })
const HOUR = 3600 * 1000

async function main() {
  const cfg = loadConfig()
  const ctx = { context: await resolveContext() }
  const repoRoot = ctx.context.repository?.rootPath
  if (repoRoot) await exec('git', ['-C', repoRoot, 'worktree', 'prune'])

  const live = new Set()
  if (repoRoot) {
    const { stdout } = await exec('git', ['-C', repoRoot, 'worktree', 'list', '--porcelain'])
    for (const line of stdout.split('\n')) if (line.startsWith('worktree ')) live.add(line.slice(9).trim())
  }

  let removed = 0
  let dirs = []
  try { dirs = await readdir(cfg.WORKSPACES_DIR) } catch { dirs = [] }
  for (const d of dirs) {
    const p = path.join(cfg.WORKSPACES_DIR, d)
    if (live.has(p)) continue
    const age = Date.now() - (await stat(p)).mtimeMs
    if (age < HOUR) continue // podría ser una tarea recién arrancada
    await rm(p, { recursive: true, force: true })
    removed++
    log.info('worktree huérfano removido', { path: p })
  }
  log.info('cleanup completo', { orphans_removed: removed, live_worktrees: live.size })
  await closePool()
}

main().catch((err) => { log.error('cleanup falló', { error: err.message }); process.exitCode = 1 })
