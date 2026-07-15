// PRP-023 — MEMORIA TOTAL (F1 recuperación unificada + F4 consultable). Reúne lo que el
// OS sabe desde sus fuentes reales — conocimiento_empresa (hechos, owner-taught + vigilancia)
// y backlog_autonomo (hallazgos/propuestas con evidencia) — y lo recupera por RELEVANCIA a
// un tema/obra/dominio, con su fuente y confianza. Determinístico (0 API): filtra en DB.
// Extiende learnedSummary (que solo mira owner-taught) a TODA la memoria. No duplica el
// dato: lee las tablas que ya son fuente de verdad.
import { query } from './db.mjs'

/** Recupera lo que el OS sabe sobre un tema (texto libre). Sin tema → lo más confirmado.
 *  Devuelve { hechos:[{afirmacion,area,confianza,veces,origen}], hallazgos:[{titulo,tipo,evidencia}] }. */
export async function recallMemory(topic, { limit = 12 } = {}) {
  const t = String(topic || '').trim()
  const like = t ? `%${t.replace(/\s+/g, '%')}%` : null
  const safe = async (sql, p) => { try { return (await query(sql, p)).rows } catch { return [] } }

  const hechos = await safe(
    `select afirmacion, area, confianza, veces_confirmado,
            case when origen_task_id is null then 'te lo enseñé vos' else 'lo dedujo el OS' end as origen
       from public.conocimiento_empresa
      where vigente = true ${like ? 'and (afirmacion ilike $2 or area ilike $2)' : ''}
      order by veces_confirmado desc, updated_at desc
      limit $1`,
    like ? [limit, like] : [limit],
  )
  const hallazgos = await safe(
    `select titulo, tipo, impacto, evidencia
       from public.backlog_autonomo
      where estado = 'abierto' ${like ? 'and (titulo ilike $2 or evidencia ilike $2)' : ''}
      order by (impacto='alta') desc, updated_at desc
      limit $1`,
    like ? [Math.ceil(limit / 2), like] : [Math.ceil(limit / 2)],
  )
  return { topic: t, hechos, hallazgos }
}

/** Respuesta lista para el chat (0 API) a "¿qué sabemos de X?". */
export async function recallResumen(topic) {
  const { topic: t, hechos, hallazgos } = await recallMemory(topic)
  if (!hechos.length && !hallazgos.length) {
    return t
      ? `No tengo nada guardado sobre "${t}" todavía. Si me lo enseñás ("recordá que…") o el OS lo detecta, lo voy a recordar.`
      : 'Todavía no tengo memoria acumulada.'
  }
  const L = [t ? `**Lo que sé sobre "${t}"**  _(memoria del OS; 0 API)_` : '**Lo que sé**', '']
  if (hechos.length) {
    L.push('📌 **Hechos** (más confirmados primero):')
    for (const h of hechos) {
      const conf = h.veces_confirmado > 1 ? ` · confirmado ${h.veces_confirmado}×` : ''
      L.push(`  - ${String(h.afirmacion).slice(0, 220)} _(${h.area || 'general'} · ${h.confianza || 's/d'} · ${h.origen}${conf})_`)
    }
  }
  if (hallazgos.length) {
    L.push('', '🔎 **Detectado/abierto por el OS:**')
    for (const g of hallazgos) L.push(`  - [${g.impacto || '?'}/${g.tipo}] ${g.titulo}`)
  }
  L.push('', '_Distingo lo que me enseñaste vos de lo que dedujo el OS. Si algo cambió, corregime y lo actualizo._')
  return L.join('\n')
}
