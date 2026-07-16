// AUTO-MEJORA $0 (modelo elegido por el dueño: propone→aprobás). El OS ya viene registrando
// solo, SIN gastar API, sus propios huecos/errores/oportunidades en public.backlog_autonomo
// (emergence.mjs cuando un pedido del chat no lo cubre nadie; skill-proposals.mjs ante
// recurrencia; y otras fuentes del OS). Esta capa SURFACE lo acumulado como una lista rankeada
// para que Dirección apruebe. 0 API: es solo leer y ordenar lo que ya existe.
import { query } from './db.mjs'

const ORD_IMPACTO = { alta: 3, media: 2, baja: 1 }
const ORD_URGENCIA = { alta: 3, media: 2, por_confirmar: 1, baja: 0 }
const ICONO = {
  gap_skill: '🛠️', gap_dato: '📊', gap_proceso: '⚙️', mejora_potencial: '💡',
  integracion_faltante: '🔌', deuda_tecnica: '🧹', anomalia: '⚠️', riesgo: '🚨',
  oportunidad: '🌱', respuesta_fallida: '💬',
}

// Tipos que son MEJORA DEL OS/sistema/proceso (no alertas de negocio puro como cobranzas/
// pagos/margen, que ya están en el briefing ejecutivo). Este es el foco de "mejorar el OS".
const TIPOS_OS = new Set(['gap_skill', 'gap_dato', 'gap_proceso', 'mejora_potencial', 'integracion_faltante', 'deuda_tecnica', 'anomalia', 'respuesta_fallida'])

/** Lista rankeada de propuestas de mejora del OS ABIERTAS. 0 API. Devuelve texto para el chat.
 *  Ranking: impacto → urgencia → recencia. Excluye alertas de negocio puro (van al briefing). */
export async function propuestasMejoraResumen({ limit = 15, soloOs = true } = {}) {
  let rows
  try {
    const r = await query(
      `select tipo, titulo, impacto, urgencia, confianza, esfuerzo, recomendacion, evidencia, updated_at
         from public.backlog_autonomo where estado = 'abierto'`,
    )
    rows = soloOs ? r.rows.filter((x) => TIPOS_OS.has(x.tipo)) : r.rows
  } catch (e) {
    return `No pude leer el backlog de mejoras: ${String(e?.message ?? e).slice(0, 120)}`
  }
  if (!rows.length) return 'No tengo propuestas de mejora del OS abiertas ahora mismo. El OS las va registrando solo a medida que detecta huecos, errores o procesos mejorables — volvé a preguntarme más adelante. _(Las alertas de negocio —cobranzas, pagos, márgenes— están en el briefing: pedime "cómo estamos".)_'

  rows.sort((a, b) =>
    (ORD_IMPACTO[b.impacto] || 0) - (ORD_IMPACTO[a.impacto] || 0) ||
    (ORD_URGENCIA[b.urgencia] || 0) - (ORD_URGENCIA[a.urgencia] || 0) ||
    new Date(b.updated_at) - new Date(a.updated_at))

  const total = rows.length
  const sel = rows.slice(0, limit)
  const L = ['**En qué puede mejorar el OS** _(lo detecté solo, 0 API — vos aprobás qué se hace)_', '']
  for (const p of sel) {
    const ic = ICONO[p.tipo] || '•'
    const meta = [p.impacto ? `impacto ${p.impacto}` : '', p.urgencia && p.urgencia !== 'por_confirmar' ? `urgencia ${p.urgencia}` : '', p.esfuerzo ? `esfuerzo ${p.esfuerzo}` : '']
      .filter(Boolean).join(' · ')
    L.push(`${ic} **${String(p.titulo).slice(0, 90)}**${meta ? `  _(${meta})_` : ''}`)
    if (p.recomendacion) L.push(`   → ${String(p.recomendacion).slice(0, 180)}`)
  }
  if (total > sel.length) L.push('', `_… y ${total - sel.length} más. Decime "mejorá <tema>" o "aprobá <título>" y lo trabajo (nada se aplica sin tu OK)._`)
  else L.push('', '_Decime "mejorá <tema>" y lo trabajo. Nada se aplica sin tu OK._')
  return L.join('\n')
}
