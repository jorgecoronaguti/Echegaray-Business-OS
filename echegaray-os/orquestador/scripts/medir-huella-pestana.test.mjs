import test from 'node:test'
import assert from 'node:assert/strict'
import { ventanaDeHuellas, veredicto } from './medir-huella-pestana.mjs'
import { UMBRAL_ALINEACION } from '../lib/huella-celda.mjs'

test('la ventana sale del bounding box de lo sellado, no de una fila tipeada', () => {
  const h = new Map([['117:0', {}], ['222:6', {}], ['150:3', {}]])
  assert.deepEqual(ventanaDeHuellas(h), { fila0: 117, filaN: 222, col0: 0, colN: 6, celdas: 3 })
})

// EL DEFECTO QUE ATRAPA: "no hay huella" no es "el rectángulo está vacío". Si esto devolviera un
// rectángulo degenerado (0:0), el medidor leería A1:A1 del Sheet, encontraría UNA celda comparable y
// podría informar 100% sobre una pestaña que nunca se selló — exactamente el estado en el que
// estuvieron Proveedores y Materiales, y el que hizo creer durante meses que la huella "no alineaba".
test('sin una sola huella devuelve null y no un rectángulo degenerado', () => {
  assert.equal(ventanaDeHuellas(new Map()), null)
})

test('la ventana ignora claves que no son fila:col en vez de contaminar el rectángulo con NaN', () => {
  const h = new Map([['10:2', {}], ['basura', {}], ['20:5', {}]])
  assert.deepEqual(ventanaDeHuellas(h), { fila0: 10, filaN: 20, col0: 2, colN: 5, celdas: 2 })
})

test('el veredicto publica la fracción cruda, que es el número que decide', () => {
  const v = veredicto('Proveedores', { alineada: true, fraccion: 1, comparables: 401, off: 0, motivo: 'ok' }, { celdas: 401 })
  assert.equal(v.fraccion, 1)
  assert.equal(v.comparables, 401)
  assert.equal(v.celdasSelladas, 401)
  assert.match(v.linea, /100\.0%/)
  assert.match(v.linea, /ALINEA/)
})

// EL DEFECTO QUE ATRAPA: el 47% medido el 15/08 estaba DEBAJO del umbral y la corrida no decidía
// nada. Si el veredicto dijera "ALINEA" con una fracción bajo umbral, el medidor taparía justo el
// caso que existe para detectar.
test('bajo umbral el veredicto lo dice y no lo suaviza', () => {
  const v = veredicto('Proveedores', { alineada: false, fraccion: 0.47, comparables: 396, off: 0, motivo: 'mi mapa ya no cae donde dice' }, { celdas: 396 })
  assert.equal(v.alineada, false)
  assert.ok(v.fraccion < UMBRAL_ALINEACION)
  assert.match(v.linea, /NO ALINEA/)
})
