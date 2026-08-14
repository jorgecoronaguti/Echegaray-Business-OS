import test from 'node:test'
import assert from 'node:assert/strict'
import { clasificarVentasSinCobranza, numeroSuelto } from './ventas-sin-cobranza.mjs'
import { normComprobante } from './cheques-cobertura.mjs'

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// LOS CASOS SON LOS DEL ARCHIVO VIVO DEL 14/08/2026 — no ejemplos inventados.
//
// El aviso decía "6 facturas emitidas que Cobranzas no tiene, $129.499.724" cada dos horas. Medido
// contra el Sheet real ese día, cuatro de las seis estaban cargadas y el agujero era $54.625.304,80.
// Si alguien saca la segunda o la tercera pasada, estos tests vuelven a rojo con esos números.
// ══════════════════════════════════════════════════════════════════════════════════════════════════

/** Una factura de ARCA, con la llave ya normalizada como la arma el generador. */
const emitida = (comprobante, importe) => ({ comprobante, importe, llave: normComprobante(comprobante) })
/** Una fila de Cobranzas, con la llave ya normalizada — incluso si es "corta". */
const cobranza = (fila, numero, importe) => ({ fila, llave: normComprobante(numero), importe })

test('numeroSuelto: el número de factura sin su punto de venta, que es como lo tipea el dueño', () => {
  assert.equal(numeroSuelto(normComprobante('0001-00000219')), '219')
  assert.equal(numeroSuelto(normComprobante('219')), '219')
  assert.equal(numeroSuelto(''), '')
})

// ── EL DEFECTO 1: EL N° TIPEADO COMO EN EL TALONARIO ──────────────────────────────────────────────
//
// Quattropani 0001-00000219 por $65.678.419,31 está en Cobranzas fila 61 con el N° "219", y ARCOR
// 0001-00000053 por $9.099.200 está en la fila 49 con "53". `esLlaveUtil` descarta esas dos llaves por
// cortas, así que la primera pasada ni las veía: $74.777.619,31 reportados como faltantes.

test('la factura cargada con el N° sin punto de venta NO es un agujero: se separa y no lleva ⚠', () => {
  const r = clasificarVentasSinCobranza(
    [emitida('0001-00000219', 65678419.31), emitida('0001-00000053', 9099200)],
    [cobranza(61, '219', 65678419.31), cobranza(49, '53', 9099200)],
  )
  assert.equal(r.sinRastro.length, 0, 'ninguna de las dos falta: las dos están cargadas')
  assert.deepEqual(r.porNumeroSuelto.map((x) => [x.comprobante, x.fila]),
    [['0001-00000219', 61], ['0001-00000053', 49]])
})

test('el número suelto NO empareja contra una llave que YA trae punto de venta (otro PV es otra factura)', () => {
  const r = clasificarVentasSinCobranza(
    [emitida('0001-00000219', 65678419.31)],
    // "0002-00000219" es la 219 de OTRO punto de venta: no es la misma factura.
    [cobranza(61, '0002-00000219', 1)],
  )
  assert.equal(r.porNumeroSuelto.length, 0)
  assert.equal(r.sinRastro.length, 1)
})

// ── EL DEFECTO 2: MISMO IMPORTE, OTRO NÚMERO ──────────────────────────────────────────────────────
//
// MACRO CONSTRUCCIONES: ARCA registra 0001-00000212 por $96.800 y Cobranzas tiene la fila 58 por el
// mismo importe exacto bajo "00001-00000008". No se silencia —puede ser un número mal tipeado o dos
// comprobantes distintos por la misma plata— pero tampoco se cuenta como plata que nadie sigue.

test('mismo importe exacto bajo otro número: se separa para que lo decida el dueño, no cuenta como agujero', () => {
  const r = clasificarVentasSinCobranza(
    [emitida('0001-00000212', 96800)],
    [cobranza(58, '00001-00000008', 96800)],
  )
  assert.equal(r.sinRastro.length, 0)
  assert.equal(r.porImporte.length, 1)
  assert.equal(r.porImporte[0].fila, 58)
  assert.equal(r.porImporte[0].llaveEnCobranzas, normComprobante('00001-00000008'))
})

test('el importe empareja EXACTO: sin tolerancia porcentual, dos certificados parecidos no se tapan', () => {
  // Dos certificados de la misma obra difieren en poco por construcción. Con la tolerancia del 3% que
  // usa el cruce contra Compras, éste se habría dado por cargado y el agujero desaparecía solo.
  const r = clasificarVentasSinCobranza(
    [emitida('0001-00000214', 10133750)],
    [cobranza(30, '0001-00000999', 10000000)],
  )
  assert.equal(r.porImporte.length, 0)
  assert.equal(r.sinRastro.length, 1)
})

// ── LO QUE NO SE PUEDE PERDER: EL AGUJERO DE VERDAD ───────────────────────────────────────────────

test('las que no tienen rastro siguen siendo un hallazgo: $54.625.304,80 del 14/08', () => {
  const r = clasificarVentasSinCobranza([
    emitida('0001-00000220', 37510000),
    emitida('0001-00000214', 10133750),
    emitida('0001-00000215', 6981554.8),
  ], [cobranza(10, '0001-00000201', 1234)])
  assert.equal(r.sinRastro.length, 3)
  assert.equal(r.sinRastro.reduce((a, x) => a + x.importe, 0).toFixed(2), '54625304.80')
})

test('el caso completo del 14/08: 6 facturas, $129.499.724 — y sólo 3 son el agujero', () => {
  const r = clasificarVentasSinCobranza([
    emitida('0001-00000220', 37510000),
    emitida('0001-00000219', 65678419.31),
    emitida('0001-00000215', 6981554.8),
    emitida('0001-00000053', 9099200),
    emitida('0001-00000214', 10133750),
    emitida('0001-00000212', 96800),
  ], [
    cobranza(61, '219', 65678419.31),
    cobranza(49, '53', 9099200),
    cobranza(58, '00001-00000008', 96800),
  ])
  assert.equal(r.sinRastro.length, 3)
  assert.equal(r.porNumeroSuelto.length, 2)
  assert.equal(r.porImporte.length, 1)
  const total = (xs) => xs.reduce((a, x) => a + x.importe, 0)
  assert.equal(total(r.sinRastro).toFixed(2), '54625304.80')
  assert.equal((total(r.sinRastro) + total(r.porNumeroSuelto) + total(r.porImporte)).toFixed(2), '129499724.11',
    'ni un peso se pierde en la clasificación: las tres bolsas reconstruyen el total')
})

test('una fila de Cobranzas se consume UNA sola vez: dos facturas del mismo importe no se tapan con una', () => {
  const r = clasificarVentasSinCobranza(
    [emitida('0001-00000301', 5000000), emitida('0001-00000302', 5000000)],
    [cobranza(70, '0001-00000999', 5000000)],
  )
  assert.equal(r.porImporte.length, 1)
  assert.equal(r.sinRastro.length, 1, 'la segunda sigue siendo un hallazgo: la fila ya se usó')
})
