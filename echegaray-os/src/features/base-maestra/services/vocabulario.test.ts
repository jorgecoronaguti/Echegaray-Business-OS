import test from 'node:test'
import assert from 'node:assert/strict'
import {
  MAGNITUD, esfuerzoObservado, produccionDeCuadrilla, productividad,
} from './vocabulario.ts'

// EL DEFECTO 4.9, ATRAPADO. 36,5 hs/m³ es un ESFUERZO y no un rendimiento: si el número SUBE, la
// tarea empeoró. La prueba fija las dos direcciones, que es lo único que distingue una magnitud de
// la otra — y lo que el rótulo viejo hacía leer al revés.
test('el esfuerzo y la productividad se mueven en direcciones opuestas', () => {
  const antes = productividad(30)
  const despues = productividad(36.5)
  assert.ok(antes != null && despues != null)
  // El esfuerzo subió de 30 a 36,5 hs/m³: la productividad TIENE que bajar.
  assert.ok(despues < antes, 'más horas por unidad no puede ser más productividad')
  assert.equal(productividad(36.5), 1 / 36.5)
})

test('los rótulos nombran la magnitud y su unidad, y no se escriben en cada pantalla', () => {
  assert.equal(MAGNITUD.esfuerzo.rotulo, 'Esfuerzo')
  assert.equal(MAGNITUD.esfuerzo.unidad('m³'), 'hs/m³')
  assert.equal(MAGNITUD.productividad.unidad('m³'), 'm³/hs')
  assert.equal(MAGNITUD.produccion.unidad('m³'), 'm³/jornada')
  assert.equal(MAGNITUD.duracion.unidad(), 'días')
  // Sin unidad cargada se dice «un», no se deja el hueco: «hs/» no es una unidad.
  assert.equal(MAGNITUD.esfuerzo.unidad(null), 'hs/un')
})

// UN ESFUERZO DE CERO DIRÍA QUE LA TAREA NO LLEVA MANO DE OBRA, y dividir por él publica un
// infinito con cara de dato. La ausencia se declara; no se rellena.
test('el cero y el nulo no producen números: producen ausencia', () => {
  assert.equal(productividad(null), null)
  assert.equal(productividad(0), null)
  assert.equal(productividad(-1), null)
})

// LA CAPACIDAD, NO LAS CABEZAS. Dos oficiales y dos ayudantes son cuatro personas y 3,2 de
// capacidad: con 8 hs de jornada y 4 hs/m³, son 6,4 m³ por jornada y no 8.
test('la producción de cuadrilla se calcula sobre la capacidad ponderada', () => {
  assert.equal(produccionDeCuadrilla(4, 3.2, 8), 6.4)
  assert.notEqual(produccionDeCuadrilla(4, 3.2, 8), produccionDeCuadrilla(4, 4, 8))
})

test('sin cualquiera de los tres insumos no hay producción que afirmar', () => {
  assert.equal(produccionDeCuadrilla(null, 3.2, 8), null)
  assert.equal(produccionDeCuadrilla(4, null, 8), null)
  assert.equal(produccionDeCuadrilla(4, 3.2, null), null)
  assert.equal(produccionDeCuadrilla(4, 0, 8), null)
})

// SIN LAS DOS PUNTAS NO HAY ESFUERZO OBSERVADO. Con horas y sin producción el cociente es infinito;
// con producción y sin horas es cero, que afirma que la tarea no lleva mano de obra.
test('el esfuerzo observado exige horas Y producción física', () => {
  assert.equal(esfuerzoObservado(73, 2), 36.5)
  assert.equal(esfuerzoObservado(73, null), null)
  assert.equal(esfuerzoObservado(73, 0), null)
  assert.equal(esfuerzoObservado(null, 2), null)
  assert.equal(esfuerzoObservado(0, 2), null)
})
