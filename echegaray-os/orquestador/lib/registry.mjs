// Agent Registry + Capability Registry (lectura). Fase 3.
// La identidad/clearance vive en orq.principals; los atributos operativos en
// orq.agents; el enrutamiento capacidad->rol en orq.capabilities.agent_role.
// Este módulo solo LEE el registro (fuente de verdad = la base).
import { query } from './db.mjs'

/** Capacidad tipada por slug (incluye clearance, blast_radius, agent_role). */
export async function getCapability(slug) {
  if (!slug) return null
  const { rows } = await query('select * from orq.capabilities where slug = $1 and enabled', [slug])
  return rows[0] ?? null
}

/** Agente por slug (join con su principal para clearance/identidad). */
export async function getAgentBySlug(slug) {
  if (!slug) return null
  const { rows } = await query(
    `select a.*, p.clearance, p.slug as principal_slug, p.display_name
       from orq.agents a join orq.principals p on p.id = a.principal_id
      where a.slug = $1 and a.enabled`,
    [slug],
  )
  return rows[0] ?? null
}

/** Agente que atiende por defecto una capacidad (via capabilities.agent_role). */
export async function getAgentForCapability(capabilitySlug) {
  const cap = await getCapability(capabilitySlug)
  if (!cap?.agent_role) return null
  const agent = await getAgentBySlug(cap.agent_role)
  return agent
}

/** ¿El agente tiene declarada esta capacidad? (además del clearance). */
export async function agentHasCapability(agentId, capabilitySlug) {
  const { rows } = await query(
    'select 1 from orq.agent_capabilities where agent_id = $1 and capability_slug = $2',
    [agentId, capabilitySlug],
  )
  return rows.length > 0
}

/** Todos los agentes activos (para observabilidad). */
export async function listAgents() {
  const { rows } = await query(
    `select a.slug, a.role, p.clearance, a.default_model, a.max_cost_usd_per_task, a.enabled
       from orq.agents a join orq.principals p on p.id = a.principal_id
      order by a.slug`,
  )
  return rows
}
