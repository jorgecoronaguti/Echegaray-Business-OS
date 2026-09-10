import test from 'node:test'
import assert from 'node:assert/strict'
import { contratadoEnPesos, filaEconomia, margenDe, ventaViva, ORIGEN } from './obras-economia.mjs'

test('contratado: OC en pesos gana; sin OC va U$S×TC; sin nada, la suma viva; y si no hay, null (no cero)', () => {
  assert.deepEqual(contratadoEnPesos({ contrato: 47_590_272, contratoUsd: 63_000, ventaViva: 1 }, 1500),
    { contratado: 47_590_272, contratadoUsd: null, origen: ORIGEN.ocPesos })
  assert.deepEqual(contratadoEnPesos({ contrato: null, contratoUsd: 63_000, ventaViva: 1 }, 1511.488),
    { contratado: 63_000 * 1511.488, contratadoUsd: 63_000, origen: ORIGEN.ocUsd })
  assert.deepEqual(contratadoEnPesos({ contrato: null, contratoUsd: null, ventaViva: 14_120_243 }, null),
    { contratado: 14_120_243, contratadoUsd: null, origen: ORIGEN.sumaViva })
  assert.deepEqual(contratadoEnPesos({}, null), { contratado: null, contratadoUsd: null, origen: null })
})

test('U$S sin tipo de cambio NO se valúa: queda el dólar visible y el contratado en null', () => {
  assert.deepEqual(contratadoEnPesos({ contratoUsd: 63_000 }, null),
    { contratado: null, contratadoUsd: 63_000, origen: null })
})

test('margen = contratado − MO − materiales, en $ y %; un dato que falta hace faltar el margen', () => {
  assert.deepEqual(margenDe({ contratado: 40_000_000, costoMo: 21_413_403, costoMateriales: 3_161_070 }),
    { margen: 15_425_527, margenPct: 15_425_527 / 40_000_000 * 100 })
  assert.deepEqual(margenDe({ contratado: null, costoMo: 1, costoMateriales: 1 }), { margen: null, margenPct: null })
  assert.deepEqual(margenDe({ contratado: 10, costoMo: null, costoMateriales: 1 }), { margen: null, margenPct: null })
  // Costo cero declarado SÍ es un dato (BSA no tiene materiales): el margen se calcula.
  assert.deepEqual(margenDe({ contratado: 100, costoMo: 60, costoMateriales: 0 }), { margen: 40, margenPct: 40 })
  // Un margen negativo se informa como tal: no se recorta a cero.
  assert.equal(margenDe({ contratado: 100, costoMo: 90, costoMateriales: 20 }).margen, -10)
})

const cols = { cliente: 0, concepto: 1, oc: 2, neto: 3, estado: 4, moneda: 5 }
const sel = { variantes: ['MESSINA'], needle: 'BSA', unica: false }

test('venta viva: suma el NETO de las filas de la obra, excluye CANCELAR y valúa USD al TC', () => {
  const filas = [
    ['MESSINA', 'Anticipo BSA', '', 1000, 'Cobrado', ''],
    ['MESSINA', 'Saldo BSA', '', 2000, 'Pendiente', ''],
    ['MESSINA', 'BSA error', '', 999, 'cancelar', ''],
    ['MESSINA', 'Otra obra', '', 5, 'Pendiente', ''],
    ['MESSINA', 'BSA en dólares', '', 10, 'Pendiente', 'USD'],
  ]
  assert.deepEqual(ventaViva(filas, cols, sel, 100), { pesos: 4000, filas: 3, sinMoneda: 0 })
  // Sin TC la fila en USD no se puede valuar: la venta viva no se afirma.
  assert.equal(ventaViva(filas, cols, sel, null).pesos, null)
  // Sin ninguna fila no hay venta viva: null, no cero.
  assert.equal(ventaViva([], cols, sel, 100).pesos, null)
})

test('la fila que se persiste: plazo de la obra, costos y margen, y el origen del contratado', () => {
  const f = filaEconomia(
    { clave: 'sf-instalacion-electrica', inicio: '2026-08-10', fin: '2026-10-16' },
    { contrato: 40_000_000, contratoUsd: null },
    { mo: '21413403', material: 3_161_070 },
    { ventaViva: 12_100_000, tc: 1511, obraCanonicaId: 'instalacion-electrica' },
  )
  assert.deepEqual(f, {
    obra_clave: 'sf-instalacion-electrica', obra_canonica_id: 'instalacion-electrica',
    contratado: 40_000_000, contratado_usd: null, costo_mo: 21_413_403, costo_materiales: 3_161_070,
    margen: 15_425_527, plazo_desde: '2026-08-10', plazo_hasta: '2026-10-16', origen: 'oc-pesos',
  })
  // Sin costo cargado: los costos y el margen van en null, el contratado igual se publica.
  const g = filaEconomia({ clave: 'x' }, { contrato: 10 }, {}, {})
  assert.equal(g.costo_mo, null); assert.equal(g.margen, null); assert.equal(g.contratado, 10)
})

test('QUATTROPANI: un contrato en pesos MÁS CHICO que el mismo contrato en dólares no es un contrato', () => {
  // El 10/09/2026 la H78 traía el tipo de cambio anotado ("$1503,6*USD3500") y el camino "OC en pesos"
  // le ganaba al de dólares: la obra se publicó contratada en $1.504 y con margen −$39,1 M. Con el
  // desempate, vuelve a U$S 63.000 × TC.
  const r = contratadoEnPesos({ contrato: 1503.6, contratoUsd: 63_000, ventaViva: 132_304_456 }, 1512.262)
  assert.deepEqual(r, { contratado: 63_000 * 1512.262, contratadoUsd: 63_000, origen: ORIGEN.ocUsd })
  assert.ok(r.contratado > 95_000_000, 'el contratado de Quattropani está en los $95 M, no en los $1.504')
})

test('el desempate NO le saca el contrato en pesos a las obras que lo declaran de verdad', () => {
  // Pisos Industriales declara $47.590.272 y ninguna cifra en dólares; Playón, $102.500.000 partido.
  assert.equal(contratadoEnPesos({ contrato: 47_590_272, contratoUsd: null }, 1512.262).origen, ORIGEN.ocPesos)
  // Y una obra que declarara las dos con el peso coherente (U$S 63.000 ≈ $95 M) sigue mandando el peso.
  assert.equal(contratadoEnPesos({ contrato: 95_272_506, contratoUsd: 63_000 }, 1512.262).origen, ORIGEN.ocPesos)
})
