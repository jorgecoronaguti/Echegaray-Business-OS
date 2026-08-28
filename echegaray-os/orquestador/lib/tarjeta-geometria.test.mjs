// EL ALTO DE LA BANDA ESTÁ EN UN SOLO LUGAR, Y ACÁ SE PRUEBA QUE LOS DEMÁS LO IMPORTAN.
//
// El 28/08 la banda pasó de 31 a 52 filas. El `31` estaba escrito a mano en dos archivos, y de él
// cuelgan el rango que el cash flow suma como "Cuotas de tarjeta sin factura cargada", la fila donde
// `cheques-cobertura-sheet.mjs` estampa "Estado en el OS" y el recorrido de `cash-flow-rehacer.mjs`.
// Un rango corrido NO da error: devuelve cero, y un cero se lee como un cero real.
//
// Gemelo de `cheques-emitidos-geometria.test.mjs`, y por el mismo motivo.

import test from 'node:test'
import assert from 'node:assert/strict'
import { BANDA, FILA_HDR, FILA_DATO0, FILA_FIN, rangoAbierto, rangoCerrado } from './tarjeta-geometria.mjs'
import { INSTRUMENTOS, rangoInstrumento } from './cash-flow-lineas.mjs'
import { BANDA as BANDA_BANDA } from './tarjeta-banda.mjs'

test('el cash flow lee el registro de la tarjeta desde donde el generador lo deja', () => {
  // `filaCab` es la fila del TÍTULO que abre el registro ("6 · EL DETALLE…"), que es la última de la
  // banda. Si alguien cambia BANDA sin tocar nada más, esto sigue cerrando — que es el punto.
  assert.equal(INSTRUMENTOS.tarjeta.filaCab, BANDA)
  assert.equal(FILA_HDR, BANDA + 1)
  assert.equal(FILA_DATO0, BANDA + 2)
})

test('el generador de la banda y la geometría hablan del mismo número', () => {
  assert.equal(BANDA_BANDA, BANDA)
})

test('el rango del cash flow arranca DESPUÉS de la banda, no adentro', () => {
  const r = rangoInstrumento(INSTRUMENTOS.tarjeta, 'E')
  assert.equal(r, `'Tarjeta de Credito'!$E$${BANDA + 1}:$E$${FILA_FIN}`)
  // Y no puede empezar en la 2 ni en la 3: ahí vive la banda, cuyos rótulos entrarían al rango.
  assert.ok(!/\$E\$[123]:/.test(r))
})

test('el tope 400 es contrato con CAJA: el registro tiene que caber debajo de la banda', () => {
  // CAJA cablea $E$3:$E$400 y está congelada. Con la banda en 52, quedan 347 filas de registro; el
  // día que se acerque a ese número hay que tocar CAJA a mano ANTES de crecer.
  assert.ok(FILA_FIN - FILA_DATO0 > 300, `sólo quedan ${FILA_FIN - FILA_DATO0} filas de registro`)
})

test('los rangos de la propia pestaña son abiertos, y los que salen afuera, cerrados', () => {
  assert.equal(rangoAbierto('E'), `$E$${FILA_DATO0}:$E`)
  assert.equal(rangoCerrado('E'), `$E$${FILA_DATO0}:$E$${FILA_FIN}`)
})
