#!/usr/bin/env node
// Self-check de la fundación (Fase 0): config validada + logger con redacción +
// conexión Postgres + resolución de contexto (ejes reservados) + emisión de un
// evento dentro de una transacción (Transactional Outbox). No usa IA.
//
// Uso:  DATABASE_URL=... ORQ_DB_SSL=false node orquestador/scripts/selfcheck-f0.mjs
import { loadConfig } from '../lib/config.mjs'
import { createLogger } from '../lib/logger.mjs'
import { ping, withTx, query, closePool } from '../lib/db.mjs'
import { resolveContext } from '../lib/identity.mjs'
import { emitEvent } from '../lib/events.mjs'

const log = createLogger({ component: 'selfcheck-f0' })

async function main() {
  const cfg = loadConfig()
  log.info('config OK', { tenant: cfg.TENANT, project: cfg.PROJECT, engine: cfg.ENGINE, database_url: cfg.DATABASE_URL })

  const health = await ping()
  log.info('db OK', { db: health.db })

  const ctx = await resolveContext()
  log.info('contexto resuelto', {
    tenantId: ctx.tenantId,
    projectId: ctx.projectId,
    repo: ctx.repository?.rootPath,
    systemPrincipalId: ctx.systemPrincipalId,
  })

  // Policy Engine desde el código (misma decisión que la función SQL pura).
  const dispo = await query(
    `select orq.policy_decide('git.commit_local', $1) auto, orq.policy_decide('git.push', $1) approval,
            orq.policy_decide('finance.payment', $1) forbidden`,
    [ctx.systemPrincipalId],
  )
  log.info('policy_decide', dispo.rows[0])
  if (dispo.rows[0].auto !== 'auto' || dispo.rows[0].approval !== 'requires_approval' || dispo.rows[0].forbidden !== 'forbidden') {
    throw new Error('Policy Engine devolvió disposiciones inesperadas')
  }

  const eventId = await withTx((client) =>
    emitEvent(client, {
      tenantId: ctx.tenantId,
      projectId: ctx.projectId,
      subjectType: 'selfcheck',
      subjectId: null,
      type: 'selfcheck.f0.ok',
      actorId: ctx.systemPrincipalId,
      payload: { note: 'fundación validada' },
    }),
  )
  log.info('evento emitido (outbox)', { eventId })

  await closePool()
  log.info('SELFCHECK F0 OK ✅')
}

main().catch((err) => {
  log.error('SELFCHECK F0 FALLÓ', { error: err.message })
  process.exitCode = 1
})
