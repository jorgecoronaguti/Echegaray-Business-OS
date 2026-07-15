// PRP-020 — MACRO DE CARTERA DE OBRAS (0 API). La foto de todas las obras como sistema
// económico: contratado total, backlog, margen esperado vs real, concentración por cliente,
// y semáforo de riesgo por obra. Para decidir SELECCIÓN y ASIGNACIÓN (CLAUDE.md), no obra
// por obra. Reúne desde Supabase; mismos números que la ficha/cuadro (no recalcula distinto).
import { query } from './db.mjs'

const ars = (n) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(Number(n || 0))
const pct = (n) => (n == null ? 's/d' : `${(Number(n) * 100).toFixed(1)}%`)
const num = (v) => (v == null ? null : Number(v))

export async function carteraObras() {
  const { rows } = await query(`
    select o.id, o.nombre, o.estado, o.monto_contratado, c.nombre as cliente,
      p.monto_presupuestado, p.margen_esperado,
      coalesce(p.costo_directo_presupuestado,0)+coalesce(p.costo_indirecto_presupuestado,0) as costo_presup,
      (select coalesce(sum(cr.monto),0) from public.costos_reales cr where cr.obra_id=o.id) as costo_real,
      (select count(*) from public.costos_reales cr where cr.obra_id=o.id) as n_costos
    from public.obras o
    left join public.clientes c on c.id=o.cliente_id
    left join lateral (
      select monto_presupuestado, margen_esperado, costo_directo_presupuestado, costo_indirecto_presupuestado
        from public.presupuestos where obra_id=o.id order by version desc nulls last, fecha_presupuesto desc nulls last limit 1
    ) p on true
    order by o.monto_contratado desc nulls last`)
  return rows.map((r) => {
    const contratado = num(r.monto_contratado)
    const costoReal = Number(r.n_costos) ? num(r.costo_real) : null
    const enCurso = !['cerrada', 'terminada', 'finalizada'].includes(String(r.estado || '').toLowerCase())
    const margenReal = contratado != null && costoReal != null ? contratado - costoReal : null
    const margenRealPct = margenReal != null && contratado ? margenReal / contratado : null
    const margenEspPct = num(r.margen_esperado) != null && num(r.monto_presupuestado) ? num(r.margen_esperado) / num(r.monto_presupuestado) : null
    return { ...r, contratado, costoReal, enCurso, margenReal, margenRealPct, margenEspPct }
  })
}

export async function carteraResumen() {
  const obras = await carteraObras()
  if (!obras.length) return 'No hay obras cargadas.'
  const totalContratado = obras.reduce((s, o) => s + (o.contratado || 0), 0)
  const totalCostoReal = obras.reduce((s, o) => s + (o.costoReal || 0), 0)
  const conMargen = obras.filter((o) => o.margenReal != null)
  const margenAgregado = conMargen.reduce((s, o) => s + o.margenReal, 0)

  // Concentración por cliente (% del contratado total).
  const porCliente = {}
  for (const o of obras) porCliente[o.cliente || '(sin cliente)'] = (porCliente[o.cliente || '(sin cliente)'] || 0) + (o.contratado || 0)
  const clientesOrd = Object.entries(porCliente).sort((a, b) => b[1] - a[1])
  const topCliente = clientesOrd[0]

  // Estado.
  const porEstado = {}
  for (const o of obras) porEstado[o.estado || '?'] = (porEstado[o.estado || '?'] || 0) + 1
  const pausadas = obras.filter((o) => /pausad/i.test(o.estado || '')).length

  const L = ['**Cartera de obras — macro**  _(0 API; cifras cargadas, parcial donde falta dato)_', '']
  L.push(`• Obras: **${obras.length}** · Contratado total: **${ars(totalContratado)}**`)
  L.push(`• Costo real acumulado: ${ars(totalCostoReal)} · Margen agregado (obras con dato): **${ars(margenAgregado)}**`)
  L.push(`• Estados: ${Object.entries(porEstado).map(([e, n]) => `${e} ${n}`).join(' · ')}`)
  if (topCliente) L.push(`• Cliente principal: **${topCliente[0]}** = ${pct(topCliente[1] / totalContratado)} del contratado ${topCliente[1] / totalContratado > 0.5 ? '⚠️ concentración alta' : ''}`)
  L.push('', 'Obra | Estado | Contratado | Margen (a la fecha) | Riesgo')
  L.push('---|---|---|---|---')
  for (const o of obras) {
    let sem = '🟢'
    if (o.margenRealPct != null && o.margenEspPct != null && o.margenRealPct < o.margenEspPct - 0.03) sem = '🔴 margen<esperado'
    else if (o.margenRealPct != null && o.margenRealPct < 0.1) sem = '🟠 margen bajo'
    else if (o.costoReal == null) sem = '⚪ sin costo cargado'
    const m = o.margenReal != null ? `${ars(o.margenReal)} (${pct(o.margenRealPct)})${o.enCurso ? ' parc.' : ''}` : 's/d'
    L.push(`${o.nombre} | ${o.estado || '?'} | ${ars(o.contratado)} | ${m} | ${sem}`)
  }
  L.push('')
  if (pausadas >= 2) L.push(`⚠️ **${pausadas} obras pausadas** — capital de trabajo y margen atados. Confirmar la causa real (conflicto con cliente vs pausa técnica) cambia la proyección.`)
  L.push('_Pedime "ficha de la obra X" para el detalle de cualquiera._')
  return L.join('\n')
}
