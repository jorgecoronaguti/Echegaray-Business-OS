// LA PROPUESTA DE ALIAS PARA ACHICAR «SIN SUB-OBRA» — un dry, nunca una escritura (14/09/2026).
//
// «hay obras que no están reflejando el monto cotizado ni el costo de mat o mo» (dueño). Las compras de
// La Estrella, Messina y San Francisco quedan «sin obra» cuando la columna K no nombra una obra del
// cliente. La palanca que ya decidió `compras-obra-asignada.mjs` es cargar el alias que falta, no aflojar
// la regla. Este módulo mide QUÉ cambiaría cada alias propuesto, con el MISMO asignador.
//
// ═══ QUÉ DEFECTOS ATRAPA ═══
//
//   · UNA PROPUESTA QUE REPARTE A OJO: un alias sólo mueve filas que el asignador real movería.
//   · UN ALIAS DE OTRO CLIENTE: la obra propuesta tiene que ser del cliente de la fila.
//   · UNA PROPUESTA QUE PISA LO YA ASIGNADO: lo que ya tenía obra no se cuenta ni se toca.
//   · LO GENÉRICO SE QUEDA: «combustible» no nombra una sub-obra.

import test from 'node:test'
import assert from 'node:assert/strict'
import { normAlias } from './jornales-a-registros-hh.mjs'
import { propuestaDeAlias } from './alias-subobra.mjs'

const canonica = (id, nombre, cliente_texto) => ({ id, nombre, cliente_texto, fusionada_en: null })
const CATALOGOS = {
  alias: new Map([[normAlias('bsa planta'), 'messina-bsa']]),
  canonicas: [
    canonica('messina', 'ME - OBRA GENERAL', 'MESSINA'),
    canonica('messina-bsa', 'ME - BSA', 'MESSINA'),
    canonica('messina-pisos-120-rampa', 'ME - PISOS 120 M² Y RAMPA', 'MESSINA'),
    canonica('la-estrella', 'LE - OBRA GENERAL', 'LA ESTRELLA'),
    canonica('le-comedor', 'LE - OFICINA Y FÁBRICA DE PALITOS', 'LA ESTRELLA'),
  ],
  clienteAlias: new Map([[normAlias('MESSINA'), 'MESSINA'], [normAlias('LA ESTRELLA'), 'LA ESTRELLA']]),
}
let fila = 0
const compra = (obra_texto, detalle_obra, total) => ({ fila: ++fila, sheet_id: null, obra_texto, detalle_obra, total, estado: '', anulada: false })

const COMPRAS = [
  compra('MESSINA', 'Planta de BSA', 3_300_000),
  compra('MESSINA', 'Planta de BSA', 1_000_000),
  compra('MESSINA', 'Pisos - OC 02-00002097', 2_379_200),
  compra('MESSINA', 'combustible', 438_509),
  compra('MESSINA', 'bsa planta', 500_000), // ya asignada por el alias vigente
  compra('LA ESTRELLA', 'Planta de BSA', 7_000), // otro cliente: no es evidencia
]

test('un alias propuesto mueve SÓLO las filas sin obra que el asignador real movería, con su plata', () => {
  const r = propuestaDeAlias(COMPRAS, CATALOGOS, [
    { alias: 'planta de bsa', obra_id: 'messina-bsa', evidencia: 'nombre de la sub-obra en la K' },
    { alias: 'messina pisos', obra_id: 'messina-pisos-120-rampa', evidencia: 'OC 2097 en obra_economia_sheet.referencia' },
  ])
  const bsa = r.porPropuesta.find((p) => p.alias === 'planta de bsa')
  assert.equal(bsa.filas, 2, 'la de La Estrella no cuenta y la ya asignada tampoco')
  assert.equal(bsa.total, 4_300_000)
  const pisos = r.porPropuesta.find((p) => p.alias === 'messina pisos')
  assert.equal(pisos.filas, 1)
  assert.equal(pisos.total, 2_379_200)
})

test('lo genérico y lo de otro cliente se quedan sin obra, y se cuentan', () => {
  const r = propuestaDeAlias(COMPRAS, CATALOGOS, [{ alias: 'planta de bsa', obra_id: 'messina-bsa', evidencia: 'x' }])
  assert.deepEqual(r.siguenSinObra.map((c) => c.detalle_obra).sort(), ['Pisos - OC 02-00002097', 'Planta de BSA', 'combustible'])
  assert.equal(r.siguenSinObra.find((c) => c.obra_texto === 'LA ESTRELLA')?.detalle_obra, 'Planta de BSA')
})

test('un alias que apunta a la obra de OTRO cliente no mueve nada', () => {
  // SÓLO LAS DE MESSINA: la compra de La Estrella sí iría a le-comedor, que es de su cliente.
  const messina = COMPRAS.filter((c) => c.obra_texto === 'MESSINA')
  const r = propuestaDeAlias(messina, CATALOGOS, [{ alias: 'planta de bsa', obra_id: 'le-comedor', evidencia: 'error de carga' }])
  assert.equal(r.porPropuesta[0].filas, 0)
  assert.equal(r.porPropuesta[0].total, 0)
})

test('un alias que YA existe apuntando a otra obra no se pisa: la propuesta queda en conflicto y no mueve nada', () => {
  const catalogos = { ...CATALOGOS, alias: new Map([...CATALOGOS.alias, [normAlias('planta de bsa'), 'le-comedor']]) }
  const r = propuestaDeAlias(COMPRAS, catalogos, [{ alias: 'planta de bsa', obra_id: 'messina-bsa', evidencia: 'x' }])
  assert.equal(r.porPropuesta[0].conflicto, true)
  assert.equal(r.porPropuesta[0].filas, 0, 'cargarlo pisaría la asignación que hoy tiene La Estrella')
})

test('lo que ya tenía obra no cambia con ninguna propuesta', () => {
  const r = propuestaDeAlias(COMPRAS, CATALOGOS, [{ alias: 'bsa planta', obra_id: 'messina', evidencia: 'pisar' }])
  assert.equal(r.porPropuesta[0].filas, 0, 'una propuesta no puede reasignar lo que ya tenía obra')
})
