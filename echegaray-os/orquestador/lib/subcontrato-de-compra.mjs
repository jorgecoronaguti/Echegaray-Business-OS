// QUÉ COMPRA ES UN SUBCONTRATO — espejo en JS de la regla SQL de 20260915T0810.
//
// ═══ LA DEFINICIÓN VIVE EN POSTGRES ═══
//
// `costo_de_obras_a_la_fecha` y `compras_sin_obra_de_clientes` llevan el mismo bloque «REGLA
// SUBCONTRATO». Este módulo existe para probarla sin base (`subcontrato-de-compra.test.mjs`) y para
// compararla contra lo que suma SQL sobre las filas reales en el cotejo.
//
// ═══ LA REGLA (propuesta al dueño, 14/09/2026) ═══
//
//   1. PROVEEDOR DECLARADO: `proveedores.rubro = 'Subcontratista'` (lo escribió una persona, con
//      `rubro_declarado_por`), no de prueba, cruzado por CUIT, nombre, razón social o alias vinculado.
//   2. FAMILIA: `familia_material = 'Subcontratos y mano de obra'`. Ya separaba subcontratos de
//      Materiales antes de esta regla; se conserva para no retroceder.
//
// NO RECLASIFICAN: `rubro_deducido` (lo infirió el OS), el texto del concepto («montaje»,
// «instalación») ni una cuenta de prueba. Un dudoso se marca en la ficha del proveedor, no se adivina.

export const RUBRO_SUBCONTRATISTA = 'Subcontratista'
export const FAMILIA_SUBCONTRATO = 'Subcontratos y mano de obra'

/** `normalizar_cuit`: sólo dígitos; vacío = null. */
const cuit = (v) => {
  const d = String(v ?? '').replace(/\D/g, '')
  return d === '' ? null : d
}
/** `normalizar_nombre_proveedor`: mayúsculas, espacios colapsados; vacío = null. */
const nombre = (v) => {
  const n = String(v ?? '').replace(/\s+/g, ' ').trim().toUpperCase()
  return n === '' ? null : n
}
const num = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v))

// ESTRUCTURA NUNCA ES COSTO DE OBRA (dueño, 14/09/2026): la unidad de negocio de Compras, y la columna
// `destino` de feat/obra-por-fila cuando exista. El bloque SQL «REGLA ESTRUCTURA» dice lo mismo.
const UNIDADES_ESTRUCTURA = new Set(['ESTRUCTURA', 'IMPUESTOS', 'FINANCIERO'])
const DESTINOS_ESTRUCTURA = new Set(['ES-ADM', 'ES-TAL', 'IMP', 'FIN'])
export const esDeEstructura = (f) =>
  UNIDADES_ESTRUCTURA.has(String(f.unidad_negocio ?? '').trim().toUpperCase()) || DESTINOS_ESTRUCTURA.has(String(f.destino ?? '').trim())

/** ¿El proveedor de la fila es un subcontratista declarado? */
function declarado(fila, proveedores, alias) {
  const n = nombre(fila.proveedor)
  const c = cuit(fila.cuit)
  return proveedores.some((p) => p.rubro === RUBRO_SUBCONTRATISTA && p.es_prueba !== true && (
    (c != null && cuit(p.cuit) === c)
    || (n != null && (nombre(p.nombre) === n || nombre(p.razon_social) === n))
    || (n != null && alias.some((a) => a.proveedor_id === p.id && a.estado === 'vinculado' && a.nombre_norm === n))))
}

/** 'proveedor' | 'familia' | null. `null` = va a Materiales. */
export function motivoDeSubcontrato(fila, { proveedores = [], alias = [] } = {}) {
  if (declarado(fila, proveedores, alias)) return 'proveedor'
  return fila.familia_material === FAMILIA_SUBCONTRATO ? 'familia' : null
}

/**
 * MATERIALES Y SUBCONTRATOS DE UN CONJUNTO DE COMPRAS (ya filtradas por obra, sin anuladas ni
 * nómina). Lo posterior al corte no suma en ninguna de las dos: viaja en `comprometidoFuturo`.
 */
export function costoDirectoDeCompras(filas, { proveedores = [], alias = [], corte = null } = {}) {
  let materiales = null, subcontratos = null, comprometidoFuturo = null, estructura = null, nComprobantes = 0
  const detalle = []
  for (const f of filas) {
    const total = num(f.total) ?? 0
    // LO DE ESTRUCTURA SALE DE TODAS LAS COLUMNAS DE LA OBRA, y se cuenta aparte para que no se pierda.
    if (esDeEstructura(f)) { estructura = (estructura ?? 0) + total; continue }
    if (corte != null && String(f.fecha ?? '').slice(0, 10) > corte) {
      comprometidoFuturo = (comprometidoFuturo ?? 0) + total
      continue
    }
    const motivo = motivoDeSubcontrato(f, { proveedores, alias })
    if (motivo == null) {
      materiales = (materiales ?? 0) + total
      nComprobantes++
      continue
    }
    subcontratos = (subcontratos ?? 0) + total
    detalle.push({ proveedor: f.proveedor ?? null, comprobante: f.comprobante ?? null, fecha: f.fecha ?? null, total, motivo })
  }
  detalle.sort((a, b) => b.total - a.total)
  return { materiales, subcontratos, comprometidoFuturo, estructura, nComprobantes, nSubcontratos: detalle.length, detalle }
}
