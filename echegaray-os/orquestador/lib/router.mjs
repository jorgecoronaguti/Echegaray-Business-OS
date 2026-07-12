// Model Router (Fase 3). Dada una tarea (su capacidad y/o agente asignado),
// resuelve una lista ORDENADA de candidatos {engine, model, maxCostUsd}. El
// primero es el preferido; los siguientes son el FALLBACK ante fallo/timeout.
// El techo de costo efectivo por candidato = min(route.max_cost_usd, límite del
// agente por tarea). Resolución por especificidad: capability > agent > default.
import { query } from './db.mjs'
import { getCapability, getAgentBySlug, getAgentForCapability } from './registry.mjs'

async function routesFor(tenantId, scope, matchKey) {
  const { rows } = await query(
    `select engine, model, max_cost_usd, priority
       from orq.model_routes
      where tenant_id = $1 and scope = $2 and match_key = $3 and enabled
      order by priority asc`,
    [tenantId, scope, matchKey],
  )
  return rows
}

/**
 * @param {object} p
 * @param {string} p.tenantId
 * @param {string} [p.capabilitySlug]
 * @param {string} [p.agentSlug]        agente explícito en la tarea (override)
 * @param {string} [p.preferredModel]   modelo pedido en inputs (override suave)
 * @returns {Promise<{agent:object|null, capability:object|null, candidates:Array<{engine,model,maxCostUsd}>}>}
 */
export async function route({ tenantId, capabilitySlug, agentSlug, preferredModel }) {
  const capability = capabilitySlug ? await getCapability(capabilitySlug) : null
  const agent = agentSlug
    ? await getAgentBySlug(agentSlug)
    : capabilitySlug
      ? await getAgentForCapability(capabilitySlug)
      : null

  // candidatos por especificidad
  let raw = []
  if (capabilitySlug) raw = await routesFor(tenantId, 'capability', capabilitySlug)
  if (!raw.length && agent) raw = await routesFor(tenantId, 'agent', agent.slug)
  if (!raw.length) raw = await routesFor(tenantId, 'default', '*')

  // fallback duro si no hay rutas configuradas
  if (!raw.length) {
    raw = [{ engine: agent?.default_engine || 'claude-cli', model: agent?.default_model || 'sonnet', max_cost_usd: 0.75 }]
  }

  const agentCeiling = agent?.max_cost_usd_per_task != null ? Number(agent.max_cost_usd_per_task) : Infinity
  let candidates = raw.map((r) => ({
    engine: r.engine,
    model: r.model,
    maxCostUsd: Math.min(Number(r.max_cost_usd), agentCeiling),
  }))

  // override suave de modelo pedido explícitamente: se antepone respetando el techo
  if (preferredModel && !candidates.some((c) => c.model === preferredModel)) {
    const ceiling = candidates[0]?.maxCostUsd ?? agentCeiling
    candidates = [{ engine: candidates[0]?.engine || 'claude-cli', model: preferredModel, maxCostUsd: ceiling }, ...candidates]
  }

  return { agent, capability, candidates }
}
