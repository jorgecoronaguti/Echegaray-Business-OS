// QUÉ CAMBIARÍA CADA ALIAS PROPUESTO — el dry de «sin sub-obra», con el MISMO asignador del sync.
//
// La regla de `compras-obra-asignada.mjs` no se afloja: una compra va a una obra sólo si la columna K la
// nombra (alias o nombre canónico) y la obra es del cliente de la fila. La palanca para achicar «sin
// obra» es cargar el alias que falta. Este módulo mide, antes de cargar nada, qué filas y cuánta plata
// movería cada alias propuesto. Puro: no lee ni escribe la base; el script `alias-subobra-dry.mjs` le pasa
// las filas.

import { asignadorDeCompras, planDeAsignacion, referenciaDeCompra, VIA } from './compras-obra-asignada.mjs'
import { normAlias } from './jornales-a-registros-hh.mjs'

const importe = (c) => {
  const n = Number(c.total ?? c.importe)
  return Number.isFinite(n) ? n : 0
}

/** Los alias vigentes más los propuestos. Un alias que YA existe no se pisa: no se reasigna lo asignado. */
function conPropuestas(alias, propuestas) {
  const m = new Map(alias)
  for (const p of propuestas) {
    const k = normAlias(p.alias)
    if (k && !m.has(k)) m.set(k, p.obra_id)
  }
  return m
}

/**
 * `propuestas`: [{ alias, obra_id, evidencia }]. Devuelve, por propuesta, las filas HOY sin obra que
 * pasarían a esa obra (con su plata y ejemplos), y las que siguen sin obra con TODAS las propuestas.
 */
export function propuestaDeAlias(compras, catalogos, propuestas) {
  const base = planDeAsignacion(compras, asignadorDeCompras(catalogos))
  const compraDe = new Map(compras.map((c) => [referenciaDeCompra(c), c]))
  const sinObra = base.filter((p) => p.obra_id == null && p.via === VIA.SIN_OBRA).map((p) => compraDe.get(p.referencia))
  const porPropuesta = propuestas.map((pr) => {
    // UN ALIAS VIGENTE QUE APUNTA A OTRA OBRA NO SE PISA: cargarlo rompería la asignación de hoy. La
    // propuesta queda en conflicto, sin mover nada, y lo resuelve una persona.
    const vigente = catalogos.alias.get(normAlias(pr.alias))
    const conflicto = vigente != null && vigente !== pr.obra_id
    const asignar = asignadorDeCompras({ ...catalogos, alias: conPropuestas(catalogos.alias, [pr]) })
    const movidas = sinObra.filter((c) => asignar(c).obra_id === pr.obra_id)
    return {
      ...pr, conflicto, filas: movidas.length, total: movidas.reduce((s, c) => s + importe(c), 0),
      ejemplos: [...new Set(movidas.map((c) => String(c.detalle_obra ?? '').slice(0, 60)))].slice(0, 4),
    }
  })
  const asignarTodas = asignadorDeCompras({ ...catalogos, alias: conPropuestas(catalogos.alias, propuestas) })
  const siguenSinObra = sinObra.filter((c) => asignarTodas(c).obra_id == null)
  return {
    porPropuesta,
    siguenSinObra,
    sinObraAntes: sinObra.reduce((s, c) => s + importe(c), 0),
    sinObraDespues: siguenSinObra.reduce((s, c) => s + importe(c), 0),
  }
}
