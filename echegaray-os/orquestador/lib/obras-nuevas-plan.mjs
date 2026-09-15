// CREAR UNA OBRA QUE YA TIENE PLATA CARGADA — el estado y los alias, decididos con evidencia.
//
// Dueño, 14/09/2026: crear «LE - GALPÓN 7 · LE - GALPÓN 8 · LE - CIERRE PERIMETRAL · LE - MAMPOSTERÍA».
// Las cuatro existen en Compras desde enero (128 filas, $36 M) sin obra en la app. Dos decisiones que
// no se toman a ojo:
//
//   · ESTADO. «activa» si tuvo una compra o una hora en los últimos 30 días; si no, «cerrada». La
//     evidencia se imprime fila por fila: una obra marcada activa sin movimiento aparece en la cartera
//     del jefe de obra y en el selector de horas.
//   · ALIAS. `obra_alias.alias` es PK GLOBAL. «mamposteria» ya apunta a SF - MAMPOSTERÍA: pisarlo movería
//     días de otra obra (el defecto que arregló 9b0afcbf). Por eso la forma con el cliente adelante
//     («estrella galpon 7», la que el resolutor prueba PRIMERO) va siempre, y la forma suelta sólo si
//     está libre y ninguna fila de OTRO cliente la usa en Compras.

import { normAlias } from './jornales-a-registros-hh.mjs'

export const DIAS_ACTIVA = 30

/** activa/cerrada por la última compra u hora. `hoy` y las fechas en ISO (yyyy-mm-dd). */
export function estadoPorActividad({ ultimaCompra = null, ultimaHora = null } = {}, hoy) {
  const desde = new Date(`${hoy}T00:00:00Z`)
  desde.setUTCDate(desde.getUTCDate() - DIAS_ACTIVA)
  const lim = desde.toISOString().slice(0, 10)
  const ult = [ultimaCompra, ultimaHora].filter(Boolean).sort().pop() ?? null
  return {
    estado: ult && ult >= lim ? 'activa' : 'cerrada',
    porque: ult
      ? `último movimiento ${ult} (compra ${ultimaCompra ?? '—'} · hora ${ultimaHora ?? '—'}); corte ${lim}`
      : 'sin compras ni horas registradas',
  }
}

/**
 * Los alias a cargar para una obra nueva.
 * @param {{obraId:string, cliente:string, grafias:string[]}} obra
 * @param {{existentes: Map<string,string>, grafiasDeOtros: Set<string>}} ctx alias vivos (norm → obra) y
 *        grafías (norm) que aparecen en filas de OTROS clientes
 * @returns {{cargar:{alias:string, obra_id:string, ejemplo_raw:string}[], omitidos:{alias:string, porque:string}[]}}
 */
export function planDeAlias({ obraId, cliente, grafias = [] }, { existentes = new Map(), grafiasDeOtros = new Set() } = {}) {
  const pref = normAlias(cliente)
  const cargar = []
  const omitidos = []
  const vistos = new Set()
  for (const g of grafias) {
    const suelta = normAlias(g)
    if (!suelta) continue
    for (const [alias, conCliente] of [[`${pref} ${suelta}`, true], [suelta, false]]) {
      if (vistos.has(alias)) continue
      vistos.add(alias)
      const ocupado = existentes.get(alias)
      if (ocupado && ocupado !== obraId) { omitidos.push({ alias, porque: `ya apunta a ${ocupado}` }); continue }
      if (ocupado) continue
      if (!conCliente && grafiasDeOtros.has(suelta)) { omitidos.push({ alias, porque: 'otro cliente usa esa grafía en Compras' }); continue }
      cargar.push({ alias, obra_id: obraId, ejemplo_raw: g })
    }
  }
  return { cargar, omitidos }
}
