// Resuelve los ejes reservados (tenant / project / repository / principal) desde
// sus slugs a sus ids reales, una sola vez por proceso. Reservados desde el día 1
// aunque hoy haya un solo valor de cada uno (D4).
import { query } from './db.mjs'
import { loadConfig } from './config.mjs'

let cached = null

export async function resolveContext() {
  if (cached) return cached
  const cfg = loadConfig()

  const { rows: t } = await query('select id from orq.tenants where slug = $1 and activo', [cfg.TENANT])
  if (!t.length) throw new Error(`Tenant '${cfg.TENANT}' no existe en orq.tenants (¿corriste la migración F0?)`)
  const tenantId = t[0].id

  const { rows: p } = await query(
    'select id from orq.projects where tenant_id = $1 and slug = $2 and activo',
    [tenantId, cfg.PROJECT],
  )
  if (!p.length) throw new Error(`Project '${cfg.PROJECT}' no existe para el tenant '${cfg.TENANT}'`)
  const projectId = p[0].id

  const { rows: r } = await query(
    'select id, root_path, default_branch from orq.repositories where tenant_id = $1 and slug = $2 and activo',
    [tenantId, cfg.REPO],
  )
  const repository = r.length ? { id: r[0].id, rootPath: r[0].root_path, defaultBranch: r[0].default_branch } : null

  const { rows: sys } = await query(
    "select id from orq.principals where tenant_id = $1 and slug = 'system'",
    [tenantId],
  )
  if (!sys.length) throw new Error(`Principal 'system' no existe para el tenant '${cfg.TENANT}'`)

  cached = { tenantId, projectId, repository, systemPrincipalId: sys[0].id }
  return cached
}
