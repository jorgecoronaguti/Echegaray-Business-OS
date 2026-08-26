import test from 'node:test'
import assert from 'node:assert/strict'
import { comprobanteDesdePdf, identidadDelNombre, importeAr, pieDeFacturaSinIva } from './pdf-afip.mjs'

// Los dos textos salen de PDFs REALES del canal de comprobantes, extraídos con `PDFParse` el
// 25/08/2026. Están recortados a lo que el parser mira, pero ni una etiqueta ni un número se
// tocaron: si AFIP cambia el layout, estos tests se ponen rojos, que es lo que se quiere.

const FACTURA_A = `
30716304643 ECHEGARAY CONSTRUCCIONES S.A.S.
Calvento Este 217 - San Juan, San Juan
Cuenta Corriente
CUIT:
Punto de Venta: Comp. Nro:\t00009 00003204
Razón Social:
DUPEC
FACTURA\tA
COD. 01
IVA Responsable Inscripto
20287737824
01/06/2009
Alquiler de excavadora sobre orugas, el día 29-07-2026 1,00 unidades 388070,00 0,00 388070,00 21% 469564,70
CAE N°:
14/08/2026
86316774738912
Importe Neto Gravado: $ 388070,00
IVA 27%: $ 0,00
IVA 21%: $ 81494,70
IVA 10.5%: $ 0,00
Importe Otros Tributos: $ 0,00
Importe Total: $ 469564,70
`.repeat(1)

const FACTURA_C = `
Fecha de Emisión:
ROBLES JOSE MARIA
07/08/2026
20379240195
CUIT:
Punto de Venta: Comp. Nro:\t00001 00000205
Razón Social:
ROBLES JOSE MARIA
FACTURA\tC
COD. 011
Responsable Monotributo
20379240195
ECHEGARAY CONSTRUCCIONES S.A.S.
CUIT: 30716304643
Honorarios Correspondiente Julio 2026 1,00 unidades 306057,36 306057,36\t0,00 0,00
Honorarios Julio. Excedente 11 empleados 1,00 uiacthor 270488,79 270488,79\t0,00 0,00
0,00
576546,15
576546,15
Subtotal: $
Importe Otros Tributos: $
Importe Total: $
CAE N°:
86349811111111
`

test('un importe en es-AR se lee como es-AR', () => {
  assert.equal(importeAr('388.070,00'), 388070)
  assert.equal(importeAr('576546,15'), 576546.15)
  assert.equal(importeAr('$ 469564,70'), 469564.7)
  assert.equal(importeAr('0,00'), 0)
  assert.equal(importeAr('1.234.567,89'), 1234567.89)
  for (const x of ['', null, 'abc', '$']) assert.equal(importeAr(x), null, String(x))
})

test('la Factura A se lee entera: neto, IVA por alícuota y total', () => {
  const r = comprobanteDesdePdf(FACTURA_A, { nombreArchivo: '20287737824_001_00009_00003204.pdf' })
  assert.equal(r.completo, true)
  const c = r.comprobante
  assert.equal(c.tipo, 'A')
  assert.equal(c.comprobante, '00009-00003204')
  assert.equal(c.cuit, '20287737824', 'el emisor es el CUIT que NO es el nuestro')
  assert.equal(c.neto, 388070)
  assert.equal(c.iva, 81494.7)
  assert.equal(c.ivaDiscriminado, true)
  assert.equal(c.total, 469564.7)
  assert.equal(c.cae, '86316774738912')
  assert.equal(c.cuadra, true, 'neto + IVA + otros = total')
})

test('la Factura C no discrimina IVA, y eso NO es un dato faltante', () => {
  const r = comprobanteDesdePdf(FACTURA_C, { nombreArchivo: '20379240195_011_00001_00000205.pdf' })
  assert.equal(r.completo, true)
  const c = r.comprobante
  assert.equal(c.tipo, 'C')
  assert.equal(c.iva, 0)
  assert.equal(c.ivaDiscriminado, false, 'un monotributista no tiene IVA que discriminar')
  assert.equal(c.neto, 576546.15, 'sin IVA el neto ES el total; dividir por 1,21 sería inventar')
  assert.equal(c.total, 576546.15)
})

test('el pie de la C se aparea por orden PERO sólo se acepta si cierra con el detalle', () => {
  const p = pieDeFacturaSinIva(FACTURA_C)
  assert.equal(p.total, 576546.15)
  // 306057,36 + 270488,79 = 576546,15 — dos caminos independientes al mismo número.
  assert.equal(p.verificadoConElDetalle, true)
})

test('si el detalle NO cierra y el subtotal tampoco, el pie NO se afirma', () => {
  const roto = FACTURA_C.replace('576546,15\n576546,15', '111111,11\n999999,99')
  assert.equal(pieDeFacturaSinIva(roto), null, 'no se elige un número al azar')
})

test('el nombre del archivo CONFIRMA, nunca aporta solo', () => {
  assert.deepEqual(identidadDelNombre('20287737824_001_00009_00003204 EZ17.pdf'),
    { cuit: '20287737824', codigo: 1, puntoVenta: 9, numero: 3204 })
  assert.equal(identidadDelNombre('factura julio.pdf'), null)
  // Un nombre que no coincide con el contenido se marca, no se impone.
  const r = comprobanteDesdePdf(FACTURA_A, { nombreArchivo: '20111111112_001_00001_00000001.pdf' })
  assert.equal(r.comprobante.confirmadoPorNombre, false)
  assert.equal(r.comprobante.cuit, '20287737824', 'gana el contenido')
})

test('el emisor es el CUIT que no es el nuestro; con dos ajenos no se elige', () => {
  const dos = FACTURA_A.replace('01/06/2009', '01/06/2009\n27999999994')
  assert.equal(comprobanteDesdePdf(dos).comprobante.cuit, null)
})

test('una nota de crédito se declara — el signo ya costó $41,9 M', () => {
  const nc = FACTURA_A.replace('COD. 01\n', 'COD. 03\n')
  assert.equal(comprobanteDesdePdf(nc).comprobante.esNotaCredito, true)
})

test('un escaneo sin texto no se interpreta', () => {
  for (const x of ['', '   ', 'Documento de impresora redirigido', null]) {
    assert.equal(comprobanteDesdePdf(x), null, String(x).slice(0, 20))
  }
})

test('sin punto de venta y número no hay comprobante', () => {
  assert.equal(comprobanteDesdePdf(FACTURA_A.replace(/Punto de Venta.*\n/, '')), null)
})
