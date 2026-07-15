// PLAN 2 — PEDIDOS DE MATERIALES en el chat. Respuesta determinística (0 API) sobre el espejo
// public.pedidos_materiales (sincronizado del AppSheet). Dato operativo de obra: qué material
// se pidió, para qué obra, cuánto, y qué está PENDIENTE de entregar. Fuente de carga: la app
// en campo; el OS lo refleja para consultarlo y cruzarlo.
import { query } from './db.mjs'

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim()
const fecha = (d) => (d ? new Date(d).toLocaleDateString('es-AR') : '—')

/**
 * Resumen de pedidos de materiales. Si `obra` viene, filtra por obra_texto aproximado.
 * Si `soloPendientes`, muestra solo lo no entregado. Determinístico (0 API).
 */
export async function pedidosResumen({ obra = null, soloPendientes = false } = {}) {
  const { rows } = await query(
    `select id_pedido, obra_texto, fecha, material, cantidad, estado
       from public.pedidos_materiales order by fecha desc nulls last, id_pedido desc`,
  )
  if (!rows.length) return 'No hay pedidos de materiales sincronizados todavía. Se traen del AppSheet "Pedidos de Materiales".'

  let items = rows
  if (obra) {
    const o = norm(obra)
    items = items.filter((r) => { const t = norm(r.obra_texto); return t && (t.includes(o) || o.includes(t)) })
  }
  const pendientes = items.filter((r) => norm(r.estado) === 'pendiente')
  if (soloPendientes) items = pendientes

  if (!items.length) return obra ? `No encontré pedidos para "${obra}".` : 'No hay pedidos que coincidan.'

  const titulo = soloPendientes ? 'Pedidos de materiales PENDIENTES' : 'Pedidos de materiales'
  const out = [`## ${titulo}${obra ? ` — ${obra}` : ''}`]
  out.push(`${items.length} pedido(s)${!soloPendientes && pendientes.length ? `, ${pendientes.length} pendiente(s)` : ''}.`)
  out.push('')
  for (const r of items.slice(0, 25)) {
    const est = norm(r.estado) === 'pendiente' ? '🟡 PENDIENTE' : `✅ ${r.estado || '—'}`
    out.push(`- **${r.material || '—'}** ×${r.cantidad ?? '—'} · ${r.obra_texto || 'sin obra'} · ${fecha(r.fecha)} · ${est}`)
  }
  if (items.length > 25) out.push(`_…y ${items.length - 25} más._`)
  out.push('', '_Fuente: AppSheet "Pedidos de Materiales" (espejo en el OS, se sincroniza cada 6h)._')
  return out.join('\n')
}
