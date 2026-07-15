// Watcher determinístico de CAJA para la vigilancia autónoma (0 API). Detecta lo que
// el CLAUDE.md marca como palanca inmediata: cobranzas vencidas (ingreso proyectado con
// fecha pasada, sin marcarse real) y pagos vencidos/pendientes. Le da al Director los
// NÚMEROS concretos en vez de "revisá la caja". Fuente: public.movimientos_caja
// (estados 'proyectado'/'real'). No decide ni ejecuta: solo lee y resume.
import { query } from './db.mjs'

const ars = (n) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(Number(n || 0))

/** Cobros y pagos vencidos (proyectados con fecha_esperada pasada). Devuelve [] si no hay. */
export async function alertasCaja({ maxItems = 4 } = {}) {
  const { rows } = await query(`
    select tipo,
           count(*)::int n,
           coalesce(sum(monto),0) as total,
           min(fecha_esperada) as mas_vieja
      from public.movimientos_caja
     where estado = 'proyectado' and fecha_esperada is not null and fecha_esperada < now()
     group by tipo`)
  if (!rows.length) return []
  const out = []
  for (const r of rows) {
    const dias = r.mas_vieja ? Math.floor((Date.now() - new Date(r.mas_vieja).getTime()) / 86400000) : null
    const label = r.tipo === 'cobro' ? 'COBRANZAS vencidas' : r.tipo === 'pago' ? 'PAGOS vencidos/pendientes' : `${r.tipo} vencidos`
    // Top ítems concretos de ese tipo (los de mayor monto).
    const { rows: items } = await query(
      `select monto, concepto, fecha_esperada from public.movimientos_caja
        where estado = 'proyectado' and fecha_esperada < now() and tipo = $1
        order by monto desc limit $2`,
      [r.tipo, maxItems],
    )
    const detalle = items
      .map((i) => `${ars(i.monto)} ${(i.concepto || '').slice(0, 40)} (venc. ${String(i.fecha_esperada).slice(0, 10)})`)
      .join('; ')
    out.push(`${label}: ${r.n} por ${ars(r.total)}${dias != null ? `, la más vieja hace ${dias} días` : ''} — ${detalle}`)
  }
  return out
}
