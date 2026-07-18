// PLAN 2 — ESTADO OPERATIVO de una obra ACTIVA, sin depender del maestro económico
// public.obras (decisión del dueño 2026-07-15: registrar las obras activas "solo operativo"
// por ahora). Combina, por NOMBRE, dos fuentes que ya usan los mismos nombres de obra:
//   • Avance físico (tracker "Avances de Obra" en Drive)   → avance-fisico.mjs
//   • Pedidos de materiales (espejo del AppSheet)          → pedidos-materiales.mjs
// 0 API del modelo. No toca public.obras ni fabrica economía.
import { avanceResumen } from './avance-fisico.mjs'
import { pedidosResumen } from './pedidos-materiales.mjs'
import { saludObra } from './salud-obra.mjs'
import { query } from './db.mjs'

const money = (n) => '$' + Math.round(Number(n || 0)).toLocaleString('es-AR')

/** Bloque económico REAL desde el eje (costo real + honestidad sobre el margen). Reemplaza el
 *  viejo "la economía se carga cuando esté el contrato" (que ya no es cierto: el costo real existe). */
async function bloqueEconomico(nombre) {
  try {
    const s = await saludObra(nombre)
    if (s?.error || !s?.costo_real) return '_Economía: costo real todavía no disponible para esta obra._'
    const cat = s.costo_real.por_categoria?.[0]
    let out = `**Economía (costo real, del eje canónico · 0 API)**\n\n• Costo real acumulado: **${money(s.costo_real.total)}** en ${s.costo_real.comprobantes} comprobantes`
    if (cat) out += `\n• Mayor rubro: ${cat.nombre} ${money(cat.total)}`
    if (s.margen?.calculable) out += `\n• Margen real: **${money(s.margen.valor)}**`
    else out += `\n• _Margen: no se puede cerrar todavía — falta ${s.faltantes.join(' y ')}. Se ve el costo, no el margen (no se inventa)._`
    return out
  } catch { return '_Economía: costo real todavía no disponible._' }
}

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
  const [avance, pedidos, economia] = await Promise.all([
    avanceResumen(nombre).catch((e) => `Avance: no disponible (${String(e?.message ?? e).slice(0, 80)})`),
    pedidosResumen({ obra: nombre }).catch(() => 'Pedidos: no disponibles'),
    bloqueEconomico(nombre),
  ])
  return [
    `## ${nombre} — estado de obra`,
    '_Obra activa seguida por el OS: avance físico + materiales + costo real (del eje). El margen se cierra cuando entre la certificación._',
    '',
    economia,
    '',
    '---',
    '',
    avance,
    '',
    '---',
    '',
    pedidos,
  ].join('\n')
}
