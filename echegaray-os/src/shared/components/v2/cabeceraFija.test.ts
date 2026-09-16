import { test } from 'node:test'
import assert from 'node:assert/strict'
import { elStickyFallo, mismoModo, modoDeCabecera, type MedidaDeCabecera } from './cabeceraFija.ts'

// EL DEFECTO QUE ATRAPA: la cabecera de Liquidación que en Chrome/Mac se va con la página aunque esté
// declarada `sticky`. Si alguien vuelve a confiar sólo en `sticky`, o decide «fija» sin mirar el envoltorio,
// alguno de estos se pone rojo.

const TECHO = 45
const medida = (p: Partial<MedidaDeCabecera> & { envTop: number; envBottom?: number; cabTop: number }): MedidaDeCabecera => ({
  envoltorio: { top: p.envTop, bottom: p.envBottom ?? p.envTop + 2000, left: 24, width: 1392 },
  cabecera: { top: p.cabTop, height: 64 },
  techo: TECHO,
})

test('el sticky falló: el envoltorio pasó bajo el header y la cabecera se fue con él', () => {
  assert.equal(elStickyFallo(medida({ envTop: -800, cabTop: -800 })), true,
    'la cabecera se fue con la página y nadie lo notó')
})

test('el sticky anda: la cabecera quedó clavada en el techo', () => {
  assert.equal(elStickyFallo(medida({ envTop: -800, cabTop: TECHO })), false)
  assert.equal(elStickyFallo(medida({ envTop: -800, cabTop: TECHO + 0.5 })), false, 'medio píxel de zoom no es falla')
})

test('antes de pasar bajo el header no hay nada que juzgar', () => {
  assert.equal(elStickyFallo(medida({ envTop: 300, cabTop: 300 })), false)
  assert.equal(elStickyFallo(medida({ envTop: TECHO, cabTop: TECHO })), false)
})

test('al final del envoltorio el sticky se corre hacia arriba por especificación: NO es falla', () => {
  // Quedan 40 px de envoltorio bajo el techo y la cabecera mide 64: el sticky la empuja hacia arriba.
  assert.equal(elStickyFallo(medida({ envTop: -2000, envBottom: TECHO + 40, cabTop: TECHO - 24 })), false,
    'MUTACIÓN: sin mirar el final del envoltorio, cada tabla que termina «rompe» el sticky')
})

test('con el sticky sano la cabecera queda en flujo, pase lo que pase', () => {
  assert.deepEqual(modoDeCabecera(medida({ envTop: -800, cabTop: -800 }), false), { modo: 'flujo' })
})

test('con el sticky caído: fija bajo el header, con el ancho y el borde del envoltorio', () => {
  assert.deepEqual(modoDeCabecera(medida({ envTop: -800, cabTop: -800 }), true),
    { modo: 'fija', top: TECHO, left: 24, width: 1392 })
})

test('con el sticky caído pero la tabla todavía abajo del header, o ya pasada de largo: flujo', () => {
  assert.deepEqual(modoDeCabecera(medida({ envTop: 120, cabTop: 120 }), true), { modo: 'flujo' })
  assert.deepEqual(modoDeCabecera(medida({ envTop: -3000, envBottom: TECHO + 30, cabTop: -3000 }), true), { modo: 'flujo' },
    'MUTACIÓN: sin este borde la cabecera sigue flotando sobre el pie y lo que viene después')
})

test('dos modos iguales no disparan un render', () => {
  const fija = { modo: 'fija', top: 45, left: 24, width: 1392 } as const
  assert.equal(mismoModo(fija, { ...fija }), true)
  assert.equal(mismoModo(fija, { ...fija, width: 1000 }), false)
  assert.equal(mismoModo({ modo: 'flujo' }, { modo: 'flujo' }), true)
  assert.equal(mismoModo({ modo: 'flujo' }, fija), false)
})
