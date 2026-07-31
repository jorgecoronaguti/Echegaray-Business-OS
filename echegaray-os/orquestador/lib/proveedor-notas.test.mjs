// Tests de las notas por proveedor. Herméticos: núcleo puro, sin base.
//
// EL CASO QUE ESTOS TESTS DEFIENDEN, textual del dueño (31/07): "recien puse pagado en compras y no
// borro el agrupar segun corresponde". Pagar a un proveedor lo saca de la lista de deuda, y sus notas
// vivían sólo en esa lista: pagarle borraba lo que él había escrito sobre él. La nota de FEMENIA se
// perdió así de verdad, y la de Hormiserv sobrevivió por casualidad en una fila huérfana.
import test from 'node:test'
import assert from 'node:assert/strict'
import { claveProv, conciliarNotas, yaEscritas } from './proveedor-notas.mjs'

test('la clave normaliza tildes, mayúsculas y espacios de más', () => {
  assert.equal(claveProv('Ruviño Matias Esteban'), 'ruvino matias esteban')
  assert.equal(claveProv('  FEMENIA  '), 'femenia')
  assert.equal(claveProv('La Aguilana - OLIVIERI  ESTEVEZ'), 'la aguilana - olivieri estevez')
  assert.equal(claveProv(null), '')
})

test('EL CASO DEL DUEÑO: le pagué a FEMENIA y su nota NO se borra', () => {
  // FEMENIA sale de la lista (deuda cero). Su celda está vacía porque no tiene fila, no porque él la
  // haya limpiado. La nota se conserva y vuelve a aparecer cuando le vuelva a deber.
  const enBase = new Map([['femenia', { proveedor: 'FEMENIA', nota: 'pagar con echeq a 30 días' }]])
  const { borrar, escribir, guardar } = conciliarNotas(new Map(), enBase, new Set())
  assert.deepEqual(borrar, [], 'pagarle a alguien NO puede borrar la nota que habla de él')
  assert.equal(escribir.size, 0, 'y no se escribe: no hay fila donde ponerla')
  assert.equal(guardar.length, 0)
})

test('si el proveedor SÍ está en la lista y vació la celda, la borró él', () => {
  const enBase = new Map([['mariana sa', { proveedor: 'Mariana SA', nota: 'pagar con cheque a 30', escritaEn: new Date() }]])
  const { borrar, escribir } = conciliarNotas(new Map([['mariana sa', '']]), enBase, new Set(['mariana sa']), yaEscritas(enBase))
  assert.deepEqual(borrar, ['mariana sa'], 'lo que el dueño borra a mano manda')
  assert.equal(escribir.size, 0, 'y no se la vuelve a escribir: sería revertirle la edición')
})

test('su texto en la pestaña gana sobre el guardado', () => {
  const enBase = new Map([['hormiserv', { proveedor: 'Hormiserv', nota: 'texto viejo' }]])
  const { guardar, escribir } = conciliarNotas(new Map([['hormiserv', 'texto nuevo que escribió él']]), enBase, new Set(['hormiserv']))
  assert.deepEqual(guardar, [{ clave: 'hormiserv', nota: 'texto nuevo que escribió él' }])
  assert.equal(escribir.size, 0, 'no se pisa lo que él acaba de escribir')
})

test('un proveedor que vuelve a la lista recupera su nota', () => {
  // Le volvimos a comprar a FEMENIA: aparece en la lista con la celda vacía, y la nota vuelve.
  // Nunca se la escribí (escritaEn null): su celda vacía NO es un borrado, es una nota por poner.
  const enBase = new Map([['femenia', { proveedor: 'FEMENIA', nota: 'pagar con echeq a 30 días', escritaEn: null }]])
  const { escribir, borrar } = conciliarNotas(new Map(), enBase, new Set(['femenia']), yaEscritas(enBase))
  assert.equal(escribir.get('femenia'), 'pagar con echeq a 30 días')
  assert.deepEqual(borrar, [], 'la celda vacía de un proveedor que reaparece no es un borrado')
})

test('sin cambios no genera trabajo', () => {
  const enBase = new Map([['x', { proveedor: 'X', nota: 'igual' }]])
  const { guardar, borrar, escribir } = conciliarNotas(new Map([['x', 'igual']]), enBase, new Set(['x']))
  assert.equal(guardar.length, 0); assert.equal(borrar.length, 0); assert.equal(escribir.size, 0)
})

test('una nota nueva escrita a mano se guarda aunque el proveedor no esté en la lista', () => {
  // Él puede anotar sobre alguien a quien no le debe hoy. Eso también es dato suyo.
  const { guardar } = conciliarNotas(new Map([['nuevo prov', 'llamarlo el lunes']]), new Map(), new Set())
  assert.deepEqual(guardar, [{ clave: 'nuevo prov', nota: 'llamarlo el lunes' }])
})

test('yaEscritas separa las que puse yo de las que nunca llegaron a la pestaña', () => {
  const base = new Map([
    ['a', { nota: 'x', escritaEn: new Date('2026-07-30') }],
    ['b', { nota: 'y', escritaEn: null }],
  ])
  assert.deepEqual([...yaEscritas(base)], ['a'])
})

test('EL BORRADO REAL exige las tres condiciones: en la lista, vacía, y escrita antes', () => {
  // Si falta cualquiera de las tres, no es un borrado. Esta es la red que evita repetir el defecto.
  const nota = { proveedor: 'P', nota: 'algo', escritaEn: new Date() }
  const base = new Map([['p', nota]])
  assert.deepEqual(conciliarNotas(new Map([['p', '']]), base, new Set(['p']), new Set(['p'])).borrar, ['p'])
  assert.deepEqual(conciliarNotas(new Map([['p', '']]), base, new Set(), new Set(['p'])).borrar, [], 'no está en la lista')
  assert.deepEqual(conciliarNotas(new Map([['p', '']]), base, new Set(['p']), new Set()).borrar, [], 'nunca la escribí')
  assert.deepEqual(conciliarNotas(new Map([['p', 'sigue ahí']]), base, new Set(['p']), new Set(['p'])).borrar, [], 'no está vacía')
})
