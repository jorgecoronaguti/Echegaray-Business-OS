// Capacidad determinística: costo real por obra canónica (0 API). Una-capacidad-una-fuente: éste es
// el ÚNICO lugar donde el chat calcula el costo real por obra; web y salud_obra lo consultan.
//
// ═══ LA IMPUTACIÓN SALE DE `obra_id`, NO DEL TEXTO (15/09/2026) ═══
//
// Hasta hoy se resolvía `costos_obra.obra_texto` contra `obra_alias`. Ese texto es la columna J del
// Sheet, que dice el CLIENTE: el alias «LA ESTRELLA» se llevaba las compras de las cinco obras de La
// Estrella y las apilaba en la obra madre. Cada fila de Compras trae ahora su propia columna «Obra»
// (`compra_sheet.obra_id`, que `sync-compras.mjs` copia a `costos_obra.obra_id`), y ésa es la única
// imputación que no adivina. La misma regla que `public.obra_costo_real`.
//
// ═══ POR QUÉ ESTO NO LEE LA VISTA ═══
//
// `canario-fuente-unica.mjs` compara `obra_costo_real` (SQL) contra `resumenCostos()` (JS) obra por
// obra. Si acá se leyera la vista, el canario se estaría validando contra la misma información que
// produce y no podría dar rojo nunca. Son dos caminos independientes al mismo número, a propósito.
// La única diferencia declarada: la vista descarta las compras anuladas y acá no hace falta, porque
// `sync-compras.mjs` no las proyecta a `costos_obra` (`esCostoDeObra`). Si algún día las proyectara,
// el canario lo diría — que es exactamente para lo que está.
import { query } from './db.mjs'

/** Lo que no llegó a ninguna obra, separado por qué es. Se informa; nunca se reparte entre obras. */
const bucketDe = (destino) =>
  destino === 'estructura_admin' || destino === 'estructura_taller' ? 'estructura' : 'sin_obra'

/**
 * Agregación PURA (testeable, sin DB): filas `[{obra_id, destino, categoria, proveedor, total}]`
 * → costo por obra canónica + desgloses + lo que no llegó a ninguna obra.
 *
 * `obra_id` null NO SE ATRIBUYE. Una compra del cliente que nadie imputó a una sub-obra no es costo
 * de la obra madre: es plata sin obra. Colgarla de la primera obra del cliente es el defecto que
 * esta función vino a sacar.
 */
export function agregarCostosPorObra(filas) {
  const porObra = new Map()
  const buckets = { estructura: 0, sin_obra: 0 }
  for (const f of filas) {
    const t = Number(f.total || 0)
    if (!f.obra_id) { buckets[bucketDe(f.destino)] += t; continue }
    if (!porObra.has(f.obra_id)) porObra.set(f.obra_id, { total: 0, n: 0, categorias: new Map(), proveedores: new Map() })
    const o = porObra.get(f.obra_id)
    o.total += t; o.n++
    if (f.categoria) o.categorias.set(f.categoria, (o.categorias.get(f.categoria) || 0) + t)
    if (f.proveedor) o.proveedores.set(f.proveedor, (o.proveedores.get(f.proveedor) || 0) + t)
  }
  return { porObra, buckets }
}

const topN = (m, n = 5) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([nombre, total]) => ({ nombre, total }))

const COLUMNAS = 'obra_id, destino, categoria, proveedor, total'

/** Costo real de UNA obra canónica (por su id/slug). 0 API. */
export async function costoRealObra(obraId) {
  const { rows } = await query(`select ${COLUMNAS} from public.costos_obra where obra_id = $1`, [obraId])
  const { porObra } = agregarCostosPorObra(rows)
  const o = porObra.get(obraId)
  if (!o) return { obra_id: obraId, total: 0, n: 0, por_categoria: [], por_proveedor: [] }
  return { obra_id: obraId, total: o.total, n: o.n, por_categoria: topN(o.categorias), por_proveedor: topN(o.proveedores) }
}

/** Rollup de TODAS las obras + lo que no llegó a ninguna (estructura / sin obra). 0 API. */
export async function resumenCostos() {
  const { rows: cos } = await query(`select ${COLUMNAS} from public.costos_obra`)
  const { rows: canon } = await query('select id, nombre, estado, tipo from public.obra_canonica')
  const { porObra, buckets } = agregarCostosPorObra(cos)
  const nombre = new Map(canon.map((c) => [c.id, c]))
  const obras = [...porObra.entries()].map(([id, o]) => ({
    obra_id: id, nombre: nombre.get(id)?.nombre || id, estado: nombre.get(id)?.estado, tipo: nombre.get(id)?.tipo,
    total: o.total, n: o.n,
  })).sort((a, b) => b.total - a.total)
  return { obras, estructura: buckets.estructura, sin_obra: buckets.sin_obra }
}
