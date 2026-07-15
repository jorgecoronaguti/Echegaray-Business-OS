// PLAN 2 — ESTADO OPERATIVO de una obra ACTIVA, sin depender del maestro económico
// public.obras (decisión del dueño 2026-07-15: registrar las obras activas "solo operativo"
// por ahora). Combina, por NOMBRE, dos fuentes que ya usan los mismos nombres de obra:
//   • Avance físico (tracker "Avances de Obra" en Drive)   → avance-fisico.mjs
//   • Pedidos de materiales (espejo del AppSheet)          → pedidos-materiales.mjs
// 0 API del modelo. No toca public.obras ni fabrica economía.
import { avanceResumen } from './avance-fisico.mjs'
import { pedidosResumen } from './pedidos-materiales.mjs'
import { query } from './db.mjs'

/** ¿El nombre coincide con una obra que el OS trackea operativamente (pedidos)? */
export async function esObraOperativa(nombre) {
  const n = String(nombre || '').trim()
  if (!n) return false
  const { rows } = await query(
    `select 1 from public.pedidos_materiales where obra_texto ilike $1 limit 1`,
    [`%${n.replace(/\s+/g, '%')}%`],
  )
  return rows.length > 0
}

/** Vista operativa combinada de una obra activa: avance físico + pedidos de materiales. */
export async function estadoOperativoObra(nombre) {
  const [avance, pedidos] = await Promise.all([
    avanceResumen(nombre).catch((e) => `Avance: no disponible (${String(e?.message ?? e).slice(0, 80)})`),
    pedidosResumen({ obra: nombre }).catch(() => 'Pedidos: no disponibles'),
  ])
  return [
    `## ${nombre} — estado operativo`,
    '_Obra activa seguida por el OS a nivel operativo (avance + materiales). La economía (contrato, costo, margen) se carga cuando esté el contrato._',
    '',
    avance,
    '',
    '---',
    '',
    pedidos,
  ].join('\n')
}
