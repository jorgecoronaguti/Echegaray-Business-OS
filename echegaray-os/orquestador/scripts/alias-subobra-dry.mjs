// DRY DE ALIAS PARA ACHICAR «SIN SUB-OBRA». SÓLO LEE: no escribe `obra_alias` ni `compra_obra_asignada`.
//
//   node orquestador/scripts/alias-subobra-dry.mjs
//
// Corre el MISMO asignador del sync (`compras-obra-asignada.mjs`) sobre las filas de Compras, con los
// alias vigentes y con los PROPUESTOS de abajo, y dice qué filas y cuánta plata pasaría de «sin obra» a
// cada sub-obra. Cargar un alias es decisión del dueño: esta lista es la propuesta, con su evidencia.
//
// Lo que NO tiene sub-obra en `obra_canonica` (Galpón 7, Galpón 8, Mampostería y Cierre Perimetral de La
// Estrella, entre otras) no se propone: no hay a dónde asignarlo. Queda en «sin sub-obra» hasta que se
// cree la obra o se decida que es de la general.

import { query, closePool } from '../lib/db.mjs'
import { catalogosDeAsignacion } from '../lib/compras-obra-asignada.mjs'
import { propuestaDeAlias } from '../lib/alias-subobra.mjs'

/** La propuesta (14/09/2026). `evidencia` empieza por fuerte / media / dudosa. */
export const PROPUESTAS = [
  { alias: 'Planta de BSA', obra_id: 'messina-bsa', evidencia: 'fuerte: la K nombra la sub-obra ME - BSA (alias vigente «bsa planta»)' },
  { alias: 'MESSINA Bases de Tanque', obra_id: 'messina-bases-tanque-so2', evidencia: 'fuerte: la K nombra la sub-obra ME - BASES TANQUE SO2' },
  { alias: 'MESSINA Pisos', obra_id: 'messina-pisos-120-rampa', evidencia: 'fuerte: «Pisos - OC 02-00002097» y obra_economia_sheet.referencia dice «según OC 2097»' },
  { alias: 'MESSINA BSA', obra_id: 'messina-bsa', evidencia: 'dudosa: «BSA · Clasificación de escombros» también puede ser ME - LIMPIEZA DE ESCOMBROS' },
  { alias: 'Adicional - Oficinas y Fabrica de Palitos', obra_id: 'le-comedor', evidencia: 'fuerte: la K nombra LE - OFICINA Y FÁBRICA DE PALITOS' },
  { alias: 'LA ESTRELLA Comedor', obra_id: 'le-comedor', evidencia: 'media: le-comedor tiene alias «le comedor»' },
  { alias: 'SAN FRANCISCO Mampostería y Cancha de Padel', obra_id: 'san-francisco', evidencia: 'dudosa: SF - MAMPOSTERÍA también existe' },
]

async function main() {
  const compras = (await query(`select fila, sheet_id, obra_texto, detalle_obra, total, importe, estado, anulada
                                  from public.compra_sheet`)).rows
  const catalogos = await catalogosDeAsignacion(query)
  const r = propuestaDeAlias(compras, catalogos, PROPUESTAS)
  const plata = (n) => `$ ${Math.round(n).toLocaleString('es-AR')}`
  console.log('[dry] alias propuestos — NO se escribe nada')
  for (const p of r.porPropuesta) {
    console.log(`  «${p.alias}» → ${p.obra_id}: ${p.filas} fila(s), ${plata(p.total)} · ${p.evidencia}${p.conflicto ? ' · CONFLICTO: el alias ya apunta a otra obra' : ''}`)
    for (const e of p.ejemplos) console.log(`      K: ${e}`)
  }
  console.log(`[dry] sin obra (todos los clientes): antes ${plata(r.sinObraAntes)} · con las propuestas ${plata(r.sinObraDespues)}`)
  await closePool()
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(async (e) => { console.error(e); await closePool(); process.exit(1) })
}
