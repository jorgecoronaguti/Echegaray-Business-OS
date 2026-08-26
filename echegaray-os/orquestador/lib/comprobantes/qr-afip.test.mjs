import test from 'node:test'
import assert from 'node:assert/strict'
import { comprobanteDesdeQr, esParaLaEmpresa, payloadDeQr } from './qr-afip.mjs'

const qr = (o) => `https://www.afip.gob.ar/fe/qr/?p=${Buffer.from(JSON.stringify(o)).toString('base64')}`
// Medido de una foto real del canal el 25/08/2026: ROBLES PINTURERIAS, Factura A 0006-00008111.
const REAL = {
  ver: 1, fecha: '2026-08-25', cuit: 30711355223, ptoVta: 6, tipoCmp: 1, nroCmp: 8111,
  importe: 112349.35, moneda: 'PES', ctz: 1, tipoDocRec: 80, nroDocRec: 30716304643,
  tipoCodAut: 'E', codAut: 86349837876032,
}

test('el QR real de una factura del canal se decodifica entero', () => {
  const c = comprobanteDesdeQr(qr(REAL))
  assert.equal(c.cuit, '30711355223')
  assert.equal(c.comprobante, '0006-00008111', 'con los ceros que usa la pestaña Compras')
  assert.equal(c.tipo, 'A')
  assert.equal(c.total, 112349.35)
  assert.equal(c.cae, '86349837876032')
  assert.equal(c.via, 'qr_afip')
})

test('el CUIT y el CAE viajan como TEXTO — un número perdería precisión', () => {
  const c = comprobanteDesdeQr(qr(REAL))
  // 86349837876032 entra en un double, pero un CAE de 15 dígitos no siempre: se guarda como texto.
  assert.equal(typeof c.cuit, 'string')
  assert.equal(typeof c.cae, 'string')
  assert.equal(typeof c.receptorCuit, 'string')
})

test('una nota de crédito se declara como tal — el signo ya costó $41,9 M una vez', () => {
  for (const t of [3, 8, 13, 53, 203, 208, 213]) {
    assert.equal(comprobanteDesdeQr(qr({ ...REAL, tipoCmp: t }))?.esNotaCredito, true, `tipo ${t}`)
  }
  for (const t of [1, 6, 11, 51, 201]) {
    assert.equal(comprobanteDesdeQr(qr({ ...REAL, tipoCmp: t }))?.esNotaCredito, false, `tipo ${t}`)
  }
})

test('sin identidad no hay comprobante', () => {
  // Falta el número, el punto de venta o el CUIT: no se devuelve una lectura a medias que después
  // alguien complete adivinando.
  assert.equal(comprobanteDesdeQr(qr({ ...REAL, nroCmp: undefined })), null)
  assert.equal(comprobanteDesdeQr(qr({ ...REAL, ptoVta: undefined })), null)
  assert.equal(comprobanteDesdeQr(qr({ ...REAL, cuit: undefined })), null)
})

test('lo que no es un QR de AFIP no se interpreta', () => {
  for (const x of ['https://mercadolibre.com', 'texto suelto', '', null, undefined, 'https://afip.gob.ar/otra/cosa']) {
    assert.equal(comprobanteDesdeQr(x), null, String(x))
  }
})

test('el QR se acepta con o sin www y en base64url', () => {
  assert.ok(payloadDeQr('https://afip.gob.ar/fe/qr/?p=abc'))
  assert.ok(payloadDeQr('http://www.afip.gob.ar/fe/qr/?p=abc&x=1'))
  // Algunos sistemas imprimen base64url (`-` y `_` en vez de `+` y `/`). Se convierte SÓLO el
  // payload: hacerlo sobre la URL entera rompería `https://` y `/fe/qr/`.
  const payload = Buffer.from(JSON.stringify(REAL)).toString('base64url')
  assert.equal(comprobanteDesdeQr(`https://www.afip.gob.ar/fe/qr/?p=${payload}`)?.numero, 8111)
})

test('un comprobante que NO es de la empresa se detecta, y lo que no se sabe no se afirma', () => {
  assert.equal(esParaLaEmpresa(comprobanteDesdeQr(qr(REAL)), '30-71630464-3'), true, 'con guiones también')
  assert.equal(esParaLaEmpresa(comprobanteDesdeQr(qr({ ...REAL, nroDocRec: 20111111112 })), '30716304643'), false)
  // Sin receptor NO es «no es nuestro»: es «no se puede saber». Devolver false cargaría un gasto
  // ajeno como propio, o descartaría uno propio.
  assert.equal(esParaLaEmpresa(comprobanteDesdeQr(qr({ ...REAL, nroDocRec: undefined })), '30716304643'), null)
})
