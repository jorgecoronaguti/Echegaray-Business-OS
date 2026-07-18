// Capacidad determinística: costo real por obra canónica (0 API). Compone el eje F0.2
// (resolverObra) sobre public.costos_obra. Una-capacidad-una-fuente: este es el ÚNICO lugar
// donde se calcula el costo real por obra; web, chat y salud_obra lo consultan, no lo recalculan.
import { query } from './db.mjs'
import { cargarAliasMap, resolverObraCon } from './obras.mjs'

/** Agregación PURA (testeable, sin DB): filas [{obra_texto, categoria, proveedor, total}] +
 *  aliasMap → costo por obra canónica + breakdowns + buckets (indirecto/excluido/desconocido). */
export function agregarCostos(aliasMap, filas) {
  const porObra = new Map()
  const buckets = { indirecto: 0, excluido: 0, desconocido: 0, mantenimiento: 0 }
  for (const f of filas) {
    const r = resolverObraCon(aliasMap, f.obra_texto)
    const t = Number(f.total || 0)
    if (r.obra_id && r.clasificacion === 'obra') {
      if (!porObra.has(r.obra_id)) porObra.set(r.obra_id, { total: 0, n: 0, categorias: new Map(), proveedores: new Map() })
      const o = porObra.get(r.obra_id)
      o.total += t; o.n++
      if (f.categoria) o.categorias.set(f.categoria, (o.categorias.get(f.categoria) || 0) + t)
      if (f.proveedor) o.proveedores.set(f.proveedor, (o.proveedores.get(f.proveedor) || 0) + t)
    } else if (r.obra_id && r.clasificacion === 'mantenimiento') {
      // mantenimiento (ARCOR) es obra-billable pero tipo distinto: se agrega igual por obra_id
      if (!porObra.has(r.obra_id)) porObra.set(r.obra_id, { total: 0, n: 0, categorias: new Map(), proveedores: new Map() })
      const o = porObra.get(r.obra_id)
      o.total += t; o.n++
      if (f.categoria) o.categorias.set(f.categoria, (o.categorias.get(f.categoria) || 0) + t)
      if (f.proveedor) o.proveedores.set(f.proveedor, (o.proveedores.get(f.proveedor) || 0) + t)
      buckets.mantenimiento += t
    } else {
      buckets[r.clasificacion] = (buckets[r.clasificacion] || 0) + t
    }
  }
  return { porObra, buckets }
}

const topN = (m, n = 5) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([nombre, total]) => ({ nombre, total }))

/** Costo real de UNA obra canónica (por su id/slug). 0 API. */
export async function costoRealObra(obraId) {
  const map = await cargarAliasMap()
  const { rows } = await query('select obra_texto, categoria, proveedor, total from public.costos_obra')
  const { porObra } = agregarCostos(map, rows)
  const o = porObra.get(obraId)
  if (!o) return { obra_id: obraId, total: 0, n: 0, por_categoria: [], por_proveedor: [] }
  return { obra_id: obraId, total: o.total, n: o.n, por_categoria: topN(o.categorias), por_proveedor: topN(o.proveedores) }
}

/** Rollup de TODAS las obras + buckets (indirecto/excluido). 0 API. */
export async function resumenCostos() {
  const map = await cargarAliasMap()
  const { rows: cos } = await query('select obra_texto, categoria, proveedor, total from public.costos_obra')
  const { rows: canon } = await query('select id, nombre, estado, tipo from public.obra_canonica')
  const { porObra, buckets } = agregarCostos(map, cos)
  const nombre = new Map(canon.map((c) => [c.id, c]))
  const obras = [...porObra.entries()].map(([id, o]) => ({
    obra_id: id, nombre: nombre.get(id)?.nombre || id, estado: nombre.get(id)?.estado, tipo: nombre.get(id)?.tipo,
    total: o.total, n: o.n,
  })).sort((a, b) => b.total - a.total)
  return { obras, indirecto: buckets.indirecto, excluido: buckets.excluido, desconocido: buckets.desconocido }
}
