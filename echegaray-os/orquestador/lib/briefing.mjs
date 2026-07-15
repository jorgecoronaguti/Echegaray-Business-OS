// BRIEFING EJECUTIVO on-demand (0 API): la foto que el dueño pide con "¿cómo estamos?" /
// "resumen" / "qué hay hoy". Unifica lo que el OS ya calcula solo — caja vencida, desvíos
// de obra, y lo que propuso en el Backlog Autónomo (incluidas las mejoras de skill) — en
// UNA lectura accionable, en el orden de palancas del CLAUDE.md (caja → obra → resto).
// No llama a la API ni ejecuta nada: lee y ordena. Reusa los mismos módulos que la
// vigilancia, así el briefing y la ronda autónoma nunca se contradicen.
import { query } from './db.mjs'
import { desviosObras } from './obra-economics.mjs'
import { alertasCaja } from './caja-alertas.mjs'

export async function briefingEjecutivo() {
  const safe = async (fn, def) => { try { return await fn() } catch { return def } }
  const [caja, desvios, backlog] = await Promise.all([
    safe(() => alertasCaja(), []),
    safe(() => desviosObras(), []),
    safe(async () => (await query(
      `select tipo, titulo, impacto from public.backlog_autonomo
        where estado = 'abierto' order by (impacto='alta') desc, updated_at desc limit 8`)).rows, []),
  ])
  const L = [`**Briefing ejecutivo** — ${new Date().toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })}  _(dato real; 0 API)_`, '']

  L.push('💵 **Caja (palanca #1)**')
  if (caja.length) caja.forEach((c) => L.push(`  - ${c}`))
  else L.push('  - Sin cobranzas ni pagos vencidos cargados.')

  L.push('', '🏗️ **Obras — desvíos**')
  if (desvios.length) desvios.forEach((d) => L.push(`  - ${d}`))
  else L.push('  - Sin desvíos materiales calculables con el dato de hoy.')

  L.push('', '🧠 **Lo que el OS detectó/propuso solo (Backlog Autónomo)**')
  if (backlog.length) {
    for (const b of backlog) {
      const icono = b.tipo === 'gap_skill' ? '🛠️' : b.tipo === 'riesgo' ? '⚠️' : b.tipo === 'oportunidad' ? '💡' : '•'
      L.push(`  ${icono} [${b.impacto || '?'}] ${b.titulo}`)
    }
    L.push('  _(pedime el detalle de cualquiera, o "aprobá/rechazá" las que tengan tu visto bueno pendiente)_')
  } else {
    L.push('  - Nada abierto en el backlog.')
  }

  L.push('', 'Pedime el cuadro económico de una obra, o el detalle de un ítem, para profundizar.')
  return L.join('\n')
}
