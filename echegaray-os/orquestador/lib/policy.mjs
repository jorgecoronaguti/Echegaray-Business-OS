// Port del Policy Engine (C5): decisión pura delegada a orq.policy_decide (SQL).
// El Fabric consulta acá antes de todo efecto con capacidad tipada.
import { query } from './db.mjs'

/** @returns {Promise<'auto'|'requires_approval'|'forbidden'>} */
export async function decide(capabilitySlug, principalId, blastOverride = null) {
  const { rows } = await query('select orq.policy_decide($1, $2, $3) as d', [capabilitySlug, principalId, blastOverride])
  return rows[0].d
}
