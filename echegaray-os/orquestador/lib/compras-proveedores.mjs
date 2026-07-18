// COMPRAS — inteligencia de proveedores (área Compras/Logística). Sobre comprobantes_arca (R =
// recibidos/compras): a quién le compro, cuánto, con qué frecuencia, hace cuánto, y la
// CONCENTRACIÓN (riesgo: si un proveedor concentra mucho gasto). 0 API, nada inventado.
// LÍMITE HONESTO: las facturas de ARCA son a nivel TOTAL, no por ítem → NO hay precio unitario
// por material. Esto es gasto POR PROVEEDOR, no precio histórico por material (que hoy no se captura).
import { query } from './db.mjs'

const dias = (d) => Math.floor(new Date(d).getTime() / 86400000)

/** CORE PURO (testeable sin DB): analiza facturas de compra a una fecha. */
export function analizarProveedores(hoy, filas) {
  const hoyD = dias(hoy)
  const map = new Map()
  let totalGeneral = 0
  for (const f of filas) {
    const nombre = String(f.emisor_nombre || '?').trim() || '?'
    const imp = Number(f.imp_total || 0)
    totalGeneral += imp
    const e = map.get(nombre) || { proveedor: nombre, cuit: f.emisor_cuit || null, n: 0, total: 0, ultimo: null }
    e.n++; e.total += imp
    if (!e.ultimo || String(f.fecha_emision) > String(e.ultimo)) e.ultimo = f.fecha_emision
    map.set(nombre, e)
  }
  const provs = [...map.values()]
    .map((e) => ({
      proveedor: e.proveedor, cuit: e.cuit, n_facturas: e.n, total: Math.round(e.total),
      promedio: e.n ? Math.round(e.total / e.n) : 0,
      ultimo: e.ultimo ? String(e.ultimo).slice(0, 10) : null,
      dias_desde_ultimo: e.ultimo ? hoyD - dias(e.ultimo) : null,
    }))
    .sort((a, b) => b.total - a.total)
  const top = provs[0] || null
  const top5 = provs.slice(0, 5).reduce((s, p) => s + p.total, 0)
  return {
    total_general: Math.round(totalGeneral),
    n_proveedores: provs.length,
    n_facturas: filas.length,
    concentracion: {
      top1_nombre: top?.proveedor ?? null,
      top1_pct: totalGeneral ? top.total / totalGeneral : 0,
      top5_pct: totalGeneral ? top5 / totalGeneral : 0,
    },
    proveedores: provs,
  }
}

/** Capacidad pública: gasto por proveedor. Si se pasa `proveedor`, filtra a ese (o los que matchean). 0 API. */
export async function gastoProveedores({ proveedor } = {}) {
  const { rows } = await query(
    `select emisor_nombre, emisor_cuit, imp_total::float8 imp_total, fecha_emision
       from comprobantes_arca where tipo_libro='R'`)
  const a = analizarProveedores(new Date(), rows)
  if (proveedor) {
    const q = String(proveedor).toUpperCase()
    const match = a.proveedores.filter((p) => p.proveedor.toUpperCase().includes(q) || q.includes(p.proveedor.toUpperCase().split(' ')[0]))
    return { filtro: proveedor, encontrados: match.length, proveedores: match, total_filtrado: match.reduce((s, p) => s + p.total, 0), fuente: 'comprobantes_arca (compras/recibidos)' }
  }
  // Ranking: top 15 + resto agregado (para no inundar)
  const top = a.proveedores.slice(0, 15)
  const resto = a.proveedores.slice(15)
  return {
    total_general: a.total_general, n_proveedores: a.n_proveedores, n_facturas: a.n_facturas,
    concentracion: {
      ...a.concentracion,
      top1_pct: Math.round(a.concentracion.top1_pct * 1000) / 10,
      top5_pct: Math.round(a.concentracion.top5_pct * 1000) / 10,
      nota: a.concentracion.top1_pct >= 0.25 ? `${a.concentracion.top1_nombre} concentra el ${Math.round(a.concentracion.top1_pct * 100)}% de la compra — riesgo de dependencia de un proveedor.` : null,
    },
    top_proveedores: top,
    otros: resto.length ? { n: resto.length, total: resto.reduce((s, p) => s + p.total, 0) } : null,
    fuente: 'comprobantes_arca (compras/recibidos), a nivel factura',
    limite: 'gasto POR PROVEEDOR — las facturas no tienen detalle de ítem, así que no hay precio unitario por material.',
  }
}
