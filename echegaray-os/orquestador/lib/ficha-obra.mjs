// PRP-019 — FICHA DE OBRA unificada en el chat (0 API): la realidad completa de UNA obra
// en una sola respuesta — económico (contratado↔presup↔real↔margen/desvío) + caja de la
// obra + avance físico + alertas del backlog que la mencionan. Reúne, NO recalcula: usa
// los módulos que ya son fuente de verdad (obra-economics, avance-fisico) para que los
// números coincidan EXACTO con el resto del chat (regla de REALIDAD ÚNICA del CLAUDE.md).
import { query } from './db.mjs'
import { findObras, cuadroEconomico } from './obra-economics.mjs'
import { avanceResumen } from './avance-fisico.mjs'

const ars = (n) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(Number(n || 0))

export async function fichaObra(nombre) {
  const obras = await findObras(nombre)
  if (!obras.length) return `No encontré la obra "${nombre}". Pedime "lista de obras" para ver las que hay.`
  // Resolver a una: match exacto, o la única, o desambiguar.
  const exacta = obras.find((o) => o.nombre.trim().toLowerCase() === String(nombre).trim().toLowerCase())
  const obra = exacta || (obras.length === 1 ? obras[0] : null)
  if (!obra) return `Hay varias obras que coinciden con "${nombre}": ${obras.map((o) => `"${o.nombre}"`).join(', ')}. ¿Cuál?`

  const L = [`# Ficha de obra — ${obra.nombre}`, '']
  // 1) Económico (reusa el cuadro, misma fuente que "cuadro económico de X").
  L.push(await cuadroEconomico(obra.nombre))

  // 2) Caja de la obra (movimientos ligados a obra_id).
  const { rows: caja } = await query(
    `select coalesce(sum(case when tipo='cobro' and estado='real' then monto else 0 end),0) cobrado,
            coalesce(sum(case when tipo='cobro' and estado='proyectado' then monto else 0 end),0) por_cobrar,
            coalesce(sum(case when tipo='pago' and estado='real' then monto else 0 end),0) pagado,
            coalesce(sum(case when tipo='pago' and estado='proyectado' then monto else 0 end),0) por_pagar,
            count(*)::int n
       from public.movimientos_caja where obra_id = $1`, [obra.id])
  const c = caja[0]
  if (Number(c.n)) {
    L.push('', '## Caja de la obra')
    L.push(`• Cobrado: ${ars(c.cobrado)} · Por cobrar: ${ars(c.por_cobrar)} · Pagado: ${ars(c.pagado)} · Por pagar: ${ars(c.por_pagar)}  _(DATO)_`)
  }

  // 3) Avance físico (del archivo real; distinto origen, puede no matchear el nombre).
  try {
    const av = await avanceResumen(obra.nombre)
    if (av && !/no encontr/i.test(av)) { L.push('', '## Avance físico'); L.push(av.split('\n').filter((l) => l.startsWith('•')).join('\n') || av) }
  } catch { /* sin avance, se omite */ }

  // 4) Alertas/hallazgos del backlog que mencionan la obra.
  const { rows: al } = await query(
    `select tipo, impacto, titulo from public.backlog_autonomo where estado='abierto' and titulo ilike $1 order by (impacto='alta') desc limit 5`,
    [`%${obra.nombre}%`])
  if (al.length) { L.push('', '## Alertas abiertas'); for (const a of al) L.push(`• [${a.impacto}/${a.tipo}] ${a.titulo}`) }

  L.push('', '_Ficha unificada, 0 API. Pedime el detalle de cualquier bloque para profundizar._')
  return L.join('\n')
}
