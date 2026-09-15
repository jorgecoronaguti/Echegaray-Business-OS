// Capacidad determinística: costo real por obra canónica (0 API). Una-capacidad-una-fuente: el TOTAL
// por obra es el de `public.obra_costo_real` —la misma vista que consumen `obra_economia` y
// `obra_panel`—; web, chat y salud_obra lo consultan, no lo recalculan.
//
// ═══ POR obra_id, NUNCA POR TEXTO (15/09/2026) ═══
//
// Hasta hoy este módulo resolvía la obra de cada compra por `obra_texto` contra `obra_alias`
// (`resolverObra`). La columna J dice el CLIENTE: las 335 compras de «La Estrella» caían en OB-0003 y
// el comedor, los galpones y la mampostería daban $0. La obra de una compra es `costos_obra.obra_id`
// (la columna Obra de la fila, que escribe el sync y la RPC de la app); una fila sin obra_id no es de
// ninguna obra: es estructura, «sin obra» del cliente, o nadie la imputó todavía.
import { query as queryDeLaBase } from './db.mjs'

/** Lo que NO es de ninguna obra, por qué. Mismos destinos que el CHECK de `costos_obra.destino`. */
export function bucketDeFila(f) {
  if (f.obra_id) return null
  if (f.destino === 'obra') return 'sin_obra'
  if (f.destino) return 'estructura'
  return 'sin_imputar'
}

/** Agregación PURA (testeable, sin DB): filas [{obra_id, destino, categoria, proveedor, total}] →
 *  costo por `obra_id` + breakdowns + lo que no pesa en ninguna obra, por motivo. `obra_texto` NO se
 *  mira: está en la fila, y precisamente no identifica la obra. */
export function agregarPorObraId(filas) {
  const porObra = new Map()
  const buckets = { estructura: 0, sin_obra: 0, sin_imputar: 0 }
  for (const f of filas) {
    const t = Number(f.total || 0)
    const bucket = bucketDeFila(f)
    if (bucket) { buckets[bucket] += t; continue }
    if (!porObra.has(f.obra_id)) porObra.set(f.obra_id, { total: 0, n: 0, categorias: new Map(), proveedores: new Map() })
    const o = porObra.get(f.obra_id)
    o.total += t; o.n++
    if (f.categoria) o.categorias.set(f.categoria, (o.categorias.get(f.categoria) || 0) + t)
    if (f.proveedor) o.proveedores.set(f.proveedor, (o.proveedores.get(f.proveedor) || 0) + t)
  }
  return { porObra, buckets }
}

const topN = (m, n = 5) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([nombre, total]) => ({ nombre, total }))

// La MISMA exclusión que la vista: una fila anulada o eliminada en el Sheet no es costo. Se repite acá
// sólo para que el desglose sume lo que la vista declara; el total NO sale de esta consulta.
const SIN_ANULADAS = `not exists (
  select 1 from public.compra_sheet s
   where c.referencia_externa = coalesce(s.sheet_id::text, s.fila::text)
     and (s.anulada or upper(btrim(coalesce(s.estado, ''))) = 'ELIMINADO'))`

/** Costo real de UNA obra canónica (por su id). El total y el conteo son los de `obra_costo_real`;
 *  el desglose por categoría y proveedor sale de `costos_obra where obra_id = $1`. 0 API. */
export async function costoRealObra(obraId, { query = queryDeLaBase } = {}) {
  const { rows: vista } = await query(
    'select costo_real::float8 as total, n_comprobantes as n from public.obra_costo_real where obra_id = $1', [obraId])
  const { rows } = await query(
    `select c.obra_id, c.destino, c.categoria, c.proveedor, c.total from public.costos_obra c
      where c.obra_id = $1 and ${SIN_ANULADAS}`, [obraId])
  const o = agregarPorObraId(rows).porObra.get(obraId)
  const v = vista[0]
  return {
    obra_id: obraId,
    total: Number(v?.total ?? 0),
    n: Number(v?.n ?? 0),
    por_categoria: o ? topN(o.categorias) : [],
    por_proveedor: o ? topN(o.proveedores) : [],
  }
}

/** Rollup de TODAS las obras (de `obra_costo_real`) + lo que no pesa en ninguna, por motivo. 0 API. */
export async function resumenCostos({ query = queryDeLaBase } = {}) {
  const { rows: vista } = await query(
    `select obra_id, obra_nombre, estado, tipo, costo_real::float8 as total, n_comprobantes as n
       from public.obra_costo_real where n_comprobantes > 0 order by costo_real desc`)
  const { rows } = await query(
    `select c.obra_id, c.destino, c.total from public.costos_obra c where c.obra_id is null and ${SIN_ANULADAS}`)
  const { buckets } = agregarPorObraId(rows)
  const obras = vista.map((v) => ({
    obra_id: v.obra_id, nombre: v.obra_nombre || v.obra_id, estado: v.estado, tipo: v.tipo,
    total: Number(v.total), n: Number(v.n),
  }))
  return { obras, ...buckets }
}
