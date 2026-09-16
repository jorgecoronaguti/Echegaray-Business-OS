// LO QUE ESTAS PRUEBAS IMPIDEN: que un archivo entre al bucket y después no se pueda abrir, y que un
// comprobante de pago se registre contra una fila que no es la suya.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ACCEPT_PAGO, MAX_BYTES_PAGO, comprobanteEntra, mediaTypeDe, rutaDeComprobante,
} from './comprobanteDePago.ts'

const UUID = '2f1c9b4e-77a1-4c2e-9f3a-1b2c3d4e5f60'

test('la ruta es la que la policy de Storage y la RPC vuelven a exigir', () => {
  assert.equal(rutaDeComprobante({ fila: 57, id: UUID, extension: 'pdf' }), `pagos/57/${UUID}.pdf`)
  assert.equal(rutaDeComprobante({ fila: 57, id: UUID, extension: 'PDF' }), `pagos/57/${UUID}.pdf`)
})

test('una ruta que la policy rechazaría no se arma: tira antes de que el archivo viaje', () => {
  assert.throws(() => rutaDeComprobante({ fila: 3, id: UUID, extension: 'pdf' }), /renglón de datos/)
  assert.throws(() => rutaDeComprobante({ fila: NaN, id: UUID, extension: 'pdf' }), /renglón de datos/)
  assert.throws(() => rutaDeComprobante({ fila: 57, id: 'no-es-uuid', extension: 'pdf' }), /uuid/)
  assert.throws(() => rutaDeComprobante({ fila: 57, id: UUID, extension: 'html' }), /extensión/)
})

test('un HEIC del iPhone llega SIN type y se guarda igual: si no, Storage lo tira como text/plain', () => {
  assert.equal(mediaTypeDe({ name: 'IMG_0042.HEIC', size: 10, type: '' }), 'image/heic')
  assert.equal(comprobanteEntra({ name: 'IMG_0042.HEIC', size: 10, type: '' }).ok, true)
})

test('el techo son 25 MB y el mensaje nombra el archivo', () => {
  const r = comprobanteEntra({ name: 'transferencia.pdf', size: MAX_BYTES_PAGO + 1, type: 'application/pdf' })
  assert.equal(r.ok, false)
  assert.match((r as { error: string }).error, /transferencia\.pdf/)
  assert.match((r as { error: string }).error, /25 MB/)
  assert.equal(comprobanteEntra({ name: 'transferencia.pdf', size: MAX_BYTES_PAGO, type: 'application/pdf' }).ok, true)
})

test('lo que no entra: vacío, sin nombre, y lo que se ejecutaría en el origen de Storage', () => {
  assert.equal(comprobanteEntra({ name: 'x.pdf', size: 0, type: 'application/pdf' }).ok, false)
  assert.equal(comprobanteEntra({ name: '  ', size: 10, type: 'application/pdf' }).ok, false)
  assert.equal(comprobanteEntra({ name: 'recibo.html', size: 10, type: 'text/html' }).ok, false)
  assert.equal(comprobanteEntra({ name: 'recibo.svg', size: 10, type: 'image/svg+xml' }).ok, false)
  // Un tipo mentido no alcanza: la extensión tiene que estar en la lista.
  assert.equal(comprobanteEntra({ name: 'recibo.exe', size: 10, type: 'application/pdf' }).ok, false)
})

test('el accept del input sale de la MISMA lista que valida: dos listas se separan', () => {
  assert.equal(ACCEPT_PAGO.includes('application/pdf'), true)
  assert.equal(ACCEPT_PAGO.includes('image/heic'), true)
  assert.equal(ACCEPT_PAGO.includes('text/html'), false)
})
