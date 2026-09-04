// EL DÉBITO ES EL IVA QUE LA FACTURA YA DECLARA, Y SE DEVENGA AL EMITIRLA.
//
// Reporte del dueño (03/09/2026): «lo indicado con B en cobranzas es lo que tiene que considerar
// SIEMPRE». Cobranzas escribe el IVA de cada factura en su columna K: no hay nada que derivar.
//
// Y el mes es el de EMISIÓN, no el de cobro. Tomarlo por cobro corría la plata de período: con
// septiembre se veía $15.139.582 a pagar mientras el bloque de control de la MISMA pestaña decía
// $452.447, porque en septiembre se cobran facturas emitidas meses antes.
//
// Las filas imitan `Cobranzas!A5:P`. La fecha que manda es la de FACTURA (columna P), no la de venta.

import test from 'node:test'
import assert from 'node:assert/strict'
import { ventasPorMesDeEmision, ventasFacturadasDelMes } from './impuestos-base-libro.mjs'

/** El débito del mes es LA MISMA definición con la medida `iva`: no hay una función aparte. */
const debitoFacturadoDelMes = (anio, m) => ventasFacturadasDelMes(anio, m, 'iva')
const ivaDeclaradoPorMesDeEmision = (filas) => Object.fromEntries(
  Object.entries(ventasPorMesDeEmision(filas)).map(([k, v]) => [k, v.iva]))

const SEP26 = 46266 // 01/09/2026
// Índices reales de `Cobranzas!A5:P`: 1 = Categoría · 10 = IVA · 15 = «Fecha de Factura».
// La 2 es «Fecha de Venta», que es OTRA fecha: difieren hasta 82 días en 46 de las 95 filas.
const fila = (cat, serial, iva) => {
  const f = [1, cat, null, 'FA', '01-1', '', 'ARCOR', '', '', 1000000, iva]
  f[15] = serial
  return f
}

test('suma el IVA que la factura declara — no lo deriva del importe', () => {
  const r = ivaDeclaradoPorMesDeEmision([fila('B', SEP26, 6319082)])
  assert.equal(r['2026-09'], 6319082, 'el número sale de la columna K, tal cual está escrito')
})

test('una fila N no aporta débito: sin factura no hay IVA devengado', () => {
  const r = ivaDeclaradoPorMesDeEmision([fila('B', SEP26, 100), fila('N', SEP26, 0)])
  assert.equal(r['2026-09'], 100)
})

test('agrupa por EMISIÓN — dos facturas del mismo mes se acumulan', () => {
  const r = ivaDeclaradoPorMesDeEmision([fila('B', SEP26, 100), fila('B', SEP26 + 20, 50)])
  assert.equal(r['2026-09'], 150)
})

test('una factura emitida en agosto NO cae en septiembre aunque se cobre después', () => {
  const r = ivaDeclaradoPorMesDeEmision([fila('B', SEP26 - 5, 900)])
  assert.equal(r['2026-08'], 900)
  assert.equal(r['2026-09'], undefined, 'el IVA se devenga al emitir, no al cobrar')
})

test('manda la FECHA DE FACTURA (P), no la «Fecha de Venta» (C)', () => {
  // El caso que lo destapó: una factura emitida el 05/10 no aparecía en octubre y el mes daba $0.
  const f = [1, 'B', 46000, 'FA', '01-1', '', 'ARCOR', '', '', 1000000, 777]
  f[15] = 46296 // 05/10/2026
  const r = ivaDeclaradoPorMesDeEmision([f])
  assert.equal(r['2026-10'], 777)
  assert.equal(r['2026-06'], undefined, 'la fecha de venta no decide el período fiscal')
})

test('una fila sin fecha de emisión no se cuela en ningún mes', () => {
  assert.deepEqual(ivaDeclaradoPorMesDeEmision([fila('B', null, 500)]), {})
})

test('un mes sin ninguna factura emitida no aparece — no es un cero', () => {
  const r = ivaDeclaradoPorMesDeEmision([fila('B', SEP26, 100)])
  assert.equal(Object.prototype.hasOwnProperty.call(r, '2026-10'), false,
    'la ausencia se tiene que poder distinguir de un cero: son cosas distintas')
})

test('un mes SIN facturas emitidas vale VACÍO, no cero', () => {
  // El 0 no es la ausencia: leído como pronóstico dice «no pagás IVA» cuando lo cierto es «todavía
  // no facturaste», y hacia adentro del cuadro cuenta como dato y sube el ancla del origen.
  const f = debitoFacturadoDelMes(2026, 11)
  assert.match(f, /IF\(x=0;""/, 'sin facturas emitidas la celda queda vacía')
  assert.match(f, /^LET\(x;/, 'la suma se calcula UNA vez, no dos')
})

test('la FÓRMULA filtra por categoría B, por ventana de emisión, y suma la columna del IVA', () => {
  const f = debitoFacturadoDelMes(2026, 9)
  assert.match(f, /Cobranzas!\$B\$5:\$B="B"/, 'sólo lo facturado')
  assert.match(f, /Cobranzas!\$P\$5:\$P>=DATE\(2026;9;1\)/, 'la ventana va por la columna P, «Fecha de Factura»')
  assert.match(f, /Cobranzas!\$K\$5:\$K/, 'suma el IVA declarado')
  assert.doesNotMatch(f, /ALICUOTA|alicuota/i, 'no se vuelve a derivar lo que ya está escrito')
  assert.doesNotMatch(f, /_MOVIMIENTOS/, 'el débito no sale del libro de caja: sale de la factura')
})

test('la ventana del mes excluye el primer día del siguiente', () => {
  assert.match(debitoFacturadoDelMes(2026, 9), /<EOMONTH\(DATE\(2026;9;1\);0\)\+1/)
})
