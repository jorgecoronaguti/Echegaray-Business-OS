#!/usr/bin/env node
// CLI mínimo de Intake para encolar una tarea (uso operativo/pruebas; el Intake
// por API/webhook llega en Fase 7). Acepta un JSON por argumento o campos sueltos.
//
// Ej:  node orquestador/scripts/enqueue.mjs '{"type":"noop","title":"hola","dedupe_key":"x1"}'
//      node orquestador/scripts/enqueue.mjs --type noop --title "hola" --dedupe x1
import { enqueueTask } from '../lib/ledger.mjs'
import { closePool } from '../lib/db.mjs'
import { createLogger } from '../lib/logger.mjs'

const log = createLogger({ component: 'enqueue' })

function parseArgs(argv) {
  if (argv[0] && argv[0].startsWith('{')) return JSON.parse(argv[0])
  const t = {}
  for (let i = 0; i < argv.length; i += 2) {
    const k = argv[i].replace(/^--/, '')
    t[k === 'dedupe' ? 'dedupe_key' : k] = argv[i + 1]
  }
  return t
}

async function main() {
  const task = parseArgs(process.argv.slice(2))
  if (!task.type) task.type = 'noop'
  if (!task.title) task.title = `tarea ${new Date().toISOString()}`
  const id = await enqueueTask(task)
  log.info('tarea encolada', { id, type: task.type, title: task.title, dedupe_key: task.dedupe_key ?? null })
  await closePool()
}

main().catch((err) => { log.error('enqueue falló', { error: err.message }); process.exitCode = 1 })
