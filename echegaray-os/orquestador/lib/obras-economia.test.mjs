import test from 'node:test'
import assert from 'node:assert/strict'
import { contratadoEnPesos, filaEconomia, margenDe, netoDeOrden, totalesDeOrdenes, ventaViva, ORIGEN } from './obras-economia.mjs'

/** Lo que devuelve `contratadoEnPesos` cuando la obra no tiene ninguna orden cargada. */
const SIN_PAPEL = { referencia: null, nota: null }

test('contratado: OC en pesos gana; sin OC va U$S×TC; sin nada, la suma viva; y si no hay, null (no cero)', () => {
  assert.deepEqual(contratadoEnPesos({ contrato: 47_590_272, contratoUsd: 63_000, ventaViva: 1 }, 1500),
    { contratado: 47_590_272, contratadoUsd: null, origen: ORIGEN.ocPesos, ...SIN_PAPEL })
  assert.deepEqual(contratadoEnPesos({ contrato: null, contratoUsd: 63_000, ventaViva: 1 }, 1511.488),
    { contratado: 63_000 * 1511.488, contratadoUsd: 63_000, origen: ORIGEN.ocUsd, ...SIN_PAPEL })
  assert.deepEqual(contratadoEnPesos({ contrato: null, contratoUsd: null, ventaViva: 14_120_243 }, null),
    { contratado: 14_120_243, contratadoUsd: null, origen: ORIGEN.sumaViva, ...SIN_PAPEL })
  assert.deepEqual(contratadoEnPesos({}, null), { contratado: null, contratadoUsd: null, origen: null, ...SIN_PAPEL })
})

test('U$S sin tipo de cambio NO se valúa: queda el dólar visible y el contratado en null', () => {
  assert.deepEqual(contratadoEnPesos({ contratoUsd: 63_000 }, null),
    { contratado: null, contratadoUsd: 63_000, origen: null, ...SIN_PAPEL })
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
    referencia: null, nota: null,
    oc_civa_ventana: null, oc_civa_historico: null, oc_n_ventana: null, oc_n_historico: null,
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
  assert.deepEqual(r, { contratado: 63_000 * 1512.262, contratadoUsd: 63_000, origen: ORIGEN.ocUsd, ...SIN_PAPEL })
  assert.ok(r.contratado > 95_000_000, 'el contratado de Quattropani está en los $95 M, no en los $1.504')
})

test('el desempate NO le saca el contrato en pesos a las obras que lo declaran de verdad', () => {
  // Pisos Industriales declara $47.590.272 y ninguna cifra en dólares; Playón, $102.500.000 partido.
  assert.equal(contratadoEnPesos({ contrato: 47_590_272, contratoUsd: null }, 1512.262).origen, ORIGEN.ocPesos)
  // Y una obra que declarara las dos con el peso coherente (U$S 63.000 ≈ $95 M) sigue mandando el peso.
  assert.equal(contratadoEnPesos({ contrato: 95_272_506, contratoUsd: 63_000 }, 1512.262).origen, ORIGEN.ocPesos)
})

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// EL PAPEL DEL CLIENTE — `cliente_orden` — Y LA VENTANA DEL AÑO
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test('una OC con IVA se lleva el 1,21; una OC NETA (ARCOR) no se toca', () => {
  // Medido contra la base el 10/09/2026: las cobranzas que citan la OC 53259436 de ARCOR suman su
  // importe en NETO (0,3 + 0,1 + 0,3 + 0,3). Dividirla por 1,21 le sacaría el 17,4% a su cartera.
  assert.equal(netoDeOrden(12_100_000, false), 10_000_000)
  assert.equal(netoDeOrden(10_700_000, true), 10_700_000)
  assert.equal(netoDeOrden(null, false), null)
})

test('las OC de otro año no se suman con las del año en curso: se cuentan aparte', () => {
  // BSA arrastró tres OC de 2024 al fusionarse `bsa-planta` (20260910T1900). Sumadas daban
  // «OC · OP c/IVA $49.886.583» al lado de un contratado de $17,7 M — dos años en el mismo total.
  const bsa = [
    { numero: '00002-00000279', fecha: '2024-09-20', importe: 32_855_708.38 },
    { numero: '00002-00000496', fecha: '2024-12-16', importe: 5_019_988.49 },
    { numero: '00002-00000495', fecha: '2024-12-16', importe: 445_517.49 },
    { numero: '00002-00001984', fecha: '2026-06-18', importe: 4_336_586.76 },
    { numero: '00002-00001985', fecha: '2026-06-18', importe: 7_228_782.00 },
  ]
  const t = totalesDeOrdenes(bsa, 2026)
  assert.equal(t.nVentana, 2)
  assert.equal(t.nHistorico, 3)
  assert.equal(Math.round(t.cIvaVentana * 100) / 100, 11_565_368.76)
  assert.equal(Math.round(t.cIvaHistorico * 100) / 100, 38_321_214.36)
  // Sin ventana declarada NINGUNA orden es histórica: el que no pide ventana las quiere todas.
  assert.equal(totalesDeOrdenes(bsa, null).nHistorico, 0)
  // Una orden sin fecha legible NO se descarta: sacarla le restaría plata a la obra sin dejar rastro.
  assert.equal(totalesDeOrdenes([{ numero: 'x', fecha: null, importe: 100 }], 2026).nVentana, 1)
})

test('la OC que coincide con la suma viva deja de marcarse «suma-viva» y cita su papel', () => {
  // ME - ADICIONAL TERCER MURO: OC 2256 por $12.100.000 c/IVA = $10.000.000 neto, y su única fila de
  // Cobranzas vende exactamente $10.000.000. El número no cambia; cambia lo que se puede afirmar.
  const oc = totalesDeOrdenes([{ numero: '00002-00002256', fecha: '2026-09-02', importe: 12_100_000 }], 2026)
  const r = contratadoEnPesos({ contrato: null, contratoUsd: null, ventaViva: 10_000_000, oc }, null)
  assert.equal(r.origen, ORIGEN.ocCliente)
  assert.equal(r.referencia, 'según OC 2256')
  assert.equal(r.nota, null)
  assert.equal(r.contratado, 10_000_000, 'se publica la suma viva, no el neto de la orden: son el mismo número salvo redondeo')
})

test('un centavo de redondeo no rompe la coincidencia; $50.000 de diferencia sí', () => {
  // Playón Dilución: $24.309.950,07 / 1,21 = $20.090.867,8264 y sus dos certificaciones suman
  // $20.090.867,84. Con tolerancia cero, esa obra saldría discrepante para siempre.
  const oc = totalesDeOrdenes([{ numero: '00002-00002266', fecha: '2026-09-03', importe: 24_309_950.07 }], 2026)
  assert.equal(contratadoEnPesos({ ventaViva: 20_090_867.84, oc }, null).origen, ORIGEN.ocCliente)
  const lejos = contratadoEnPesos({ ventaViva: 20_040_867.84, oc }, null)
  assert.equal(lejos.origen, ORIGEN.sumaViva, 'una obra a la que le falta un hito no está respaldada por su OC')
  assert.match(lejos.nota, /^OC \$24\.309\.950 c\/IVA \(\$20\.090\.868 neto\) vs Cobranzas \$20\.040\.868$/)
})

test('BSA: las OC no cierran contra Cobranzas, así que la marca NO mejora y la diferencia se escribe', () => {
  // 4 filas imputadas por OC = $17.704.199,40; las 2 OC de 2026 = $11.565.368,76 c/IVA. Publicar
  // «según OC» acá sería firmar un número con un papel que dice otra cosa.
  const oc = totalesDeOrdenes([
    { numero: '00002-00000279', fecha: '2024-09-20', importe: 32_855_708.38 },
    { numero: '00002-00001984', fecha: '2026-06-18', importe: 4_336_586.76 },
    { numero: '00002-00001985', fecha: '2026-06-18', importe: 7_228_782.00 },
  ], 2026)
  const r = contratadoEnPesos({ ventaViva: 17_704_199.40, oc }, null)
  assert.equal(r.origen, ORIGEN.sumaViva)
  assert.equal(r.referencia, null)
  assert.match(r.nota, /OC \$11\.565\.369 c\/IVA .* vs Cobranzas \$17\.704\.199/)
})

test('un contrato DECLARADO que sus OC no cubren enteras lo dice, y no cambia de número', () => {
  // ME - PLAYÓN DE AZUFRE vale $102.500.000 (blanco $65 M + negro $37,5 M) y su única OC cargada
  // cubre sólo el blanco. El contrato manda; la nota evita que los dos números queden sueltos.
  const oc = totalesDeOrdenes([{ numero: '00002-00002173', fecha: '2026-08-11', importe: 78_650_000 }], 2026)
  const r = contratadoEnPesos({ contrato: 102_500_000, oc }, null)
  assert.equal(r.contratado, 102_500_000)
  assert.equal(r.origen, ORIGEN.ocPesos)
  assert.match(r.nota, /OC \$78\.650\.000 c\/IVA \(\$65\.000\.000 neto\) vs Cobranzas \$102\.500\.000/)
})

test('la venta viva se acota al año de OBRAS, como la columna D — y sin año declarado no se acota', () => {
  // La fila 3 de San Francisco vende $15.000.000 el 15/12/2025. `enElAno()` la deja afuera del
  // «⇒ TOTAL 2026» de la pestaña y hasta hoy entraba entera en obra_economia_sheet.
  const conFecha = { cliente: 0, concepto: 1, oc: 2, neto: 3, estado: 4, moneda: 5, fechaVenta: 6 }
  const filas = [
    ['SF', 'Certificado 2', '', 15_000_000, 'Cobrado', '', '2025-12-15'],
    ['SF', 'Certificado 3', '', 1_000_000, 'Cobrado', '', '2026-03-01'],
    // Serial de Sheets: 46023 = 01/01/2026. La lectura viene con UNFORMATTED_VALUE.
    ['SF', 'Certificado 4', '', 500_000, 'Pendiente', '', 46023],
  ]
  const imputadas = [0, 1, 2]
  assert.equal(ventaViva(filas, conFecha, { imputadas, anio: 2026 }, null).pesos, 1_500_000)
  assert.equal(ventaViva(filas, conFecha, { imputadas }, null).pesos, 16_500_000)
})
