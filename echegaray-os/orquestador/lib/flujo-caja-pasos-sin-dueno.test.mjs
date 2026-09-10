import test from 'node:test'
import assert from 'node:assert/strict'
import { PASOS, PASOS_RETIRADOS, pestanasSinDuenoActivo } from './flujo-caja-pasos.mjs'
import { frescuraDe, FRESCURA } from './coherencia-pestanas.mjs'

// EL DEFECTO QUE ATRAPA (auditoría del 10/09/2026).
//
// El control de coherencia publicaba «Materiales · SIN_GENERADOR» deduciéndolo de un regex sobre el
// nombre del script RETIRADO. El 09/09 la pestaña recuperó dueño (`materiales-pestana.mjs`, que está
// en PASOS y la declara) y el regex siguió dando positivo: una pestaña que se rehace en cada corrida
// figuraba como abandonada, y nadie le miraba la frescura.

test('«Materiales» tiene dueño vivo, así que NO figura sin generador', () => {
  assert.ok(
    PASOS.some(([s, , pest = []]) => s === 'materiales-pestana.mjs' && pest.includes('Materiales')),
    'el paso vivo que la declara sigue en el registro',
  )
  assert.ok(!pestanasSinDuenoActivo().has('Materiales'))
})

test('el retiro que la dejó huérfana sigue declarado: la lista se deduce, no se tipea', () => {
  const retiro = PASOS_RETIRADOS.find((p) => p.script === 'proveedores-materiales-pestana.mjs')
  assert.deepEqual(retiro.dejoSinDueno, ['Materiales'], 'el retiro declara qué dejó sin dueño')
  // Y si el paso vivo desapareciera, la pestaña volvería sola a la lista: el control puede dar rojo.
  const sinElPasoVivo = PASOS.filter(([s]) => s !== 'materiales-pestana.mjs')
  assert.ok(pestanasSinDuenoActivo(sinElPasoVivo, PASOS_RETIRADOS).has('Materiales'))
})

test('«Proveedores» nunca entra: sus seis pasos vivos son dueños de un bloque, no de la pestaña', () => {
  assert.ok(!pestanasSinDuenoActivo().has('Proveedores'))
})

test('con dueño vivo, la frescura vuelve a decidirse por la firma — que es el punto', () => {
  const ahora = new Date('2026-09-10T17:00:00Z')
  const sinDueno = pestanasSinDuenoActivo()
  const p = (escritoEn) => frescuraDe(
    { pestana: 'Materiales', escritoEn, tieneGenerador: sinDueno.has('Materiales') ? false : undefined },
    { ahora },
  )
  assert.equal(p('2026-09-10T16:54:00Z').estado, FRESCURA.AL_DIA)
  assert.equal(p('2026-09-07T08:00:00Z').estado, FRESCURA.ATRASADA)
  assert.equal(p(null).estado, FRESCURA.NO_VERIFICABLE, 'sin firma no es «vieja»: es que nadie la firmó')
})
