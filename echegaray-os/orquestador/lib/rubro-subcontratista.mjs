// EL RUBRO «SUBCONTRATISTA» QUE CONFIRMÓ EL DUEÑO (14/09/2026) — el plan, puro.
//
// «Fredes y Castro, Angel Fernandez (montajes) y Leandro Rojas. FEMENIA NO.» Y el mismo día a las 18:10: «Pedro
// Tello SÍ es subcontratista» — ya tenía el rubro declarado desde su ficha; entra a la lista para que su
// declaración quede con el origen del dueño y un cambio de la ficha no lo saque de la columna Subcontratos. El rubro vive en
// `public.proveedores` (se edita desde la ficha del proveedor y firma `rubro_declarado_por`), así que no va en
// una migración: lo aplica `orquestador/scripts/proveedores-subcontratistas-dry.mjs`, dry por defecto. Fredes y
// Castro tenían el rubro firmado por una cuenta de prueba; la firma pasa a ser la del dueño. La regla SQL de
// subcontratos (20260915T0810) lee exactamente este rubro.

export const ORIGEN_DUENO = 'dueño 14/09/2026'
export const CONFIRMADOS = Object.freeze(['Pedro Fredes', 'Gerson Castro', 'Angel Fernandez', 'Leandro Rojas', 'Pedro Tello'])
export const EXCLUIDOS = Object.freeze(['FEMENIA'])

/** La razón social con que Compras también nombra al proveedor. */
const RAZON_SOCIAL = Object.freeze({ 'Gerson Castro': 'CASTRO GALVAN GERSON ULISES' })

const clave = (v) => String(v ?? '').replace(/\s+/g, ' ').trim().toUpperCase()

/**
 * Una acción por proveedor confirmado: `actualizar` (existe con otro rubro o firma), `sin_cambio` o `crear`
 * (no existe: Leandro Rojas). Nadie fuera de la lista se toca, y un excluido nunca entra.
 */
export function planDeRubroSubcontratista(proveedores) {
  const excluidos = new Set(EXCLUIDOS.map(clave))
  const despues = { rubro: 'Subcontratista', rubro_declarado_por: ORIGEN_DUENO }
  return CONFIRMADOS.filter((n) => !excluidos.has(clave(n))).map((nombre) => {
    const razon = RAZON_SOCIAL[nombre]
    const p = proveedores.find((x) => x.es_prueba !== true
      && (clave(x.nombre) === clave(nombre) || (razon != null && clave(x.razon_social) === clave(razon))))
    if (!p) return { accion: 'crear', id: null, nombre, antes: null, despues }
    const igual = p.rubro === despues.rubro && p.rubro_declarado_por === despues.rubro_declarado_por
    return {
      accion: igual ? 'sin_cambio' : 'actualizar', id: p.id, nombre, proveedor: p.nombre,
      antes: { rubro: p.rubro ?? null, rubro_declarado_por: p.rubro_declarado_por ?? null }, despues,
    }
  })
}
