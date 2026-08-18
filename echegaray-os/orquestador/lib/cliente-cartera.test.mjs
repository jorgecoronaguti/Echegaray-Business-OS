// ARCHIVAR UN CLIENTE TIENE QUE TENER EFECTO.
//
// ═══ EL DEFECTO ═══
//
// `archivarCliente` escribía `activo = false` desde el primer día, y `/clientes` mostraba la lista
// entera sin mirar esa columna: el cliente archivado seguía ahí, en la misma posición, con los
// mismos números. El verbo existía y la consecuencia no — igual que «cerrar una obra» antes del
// 18/08. Un test que sólo comprobara que la acción devuelve `ok` habría pasado en verde todo ese
// tiempo, porque la escritura SÍ ocurría: lo que faltaba era que alguien la leyera.
//
// Y la otra mitad, igual de importante: archivar NO PUEDE PARECERSE A BORRAR. Los archivados se
// devuelven aparte —no se descartan— para que la lista pueda decir cuántos hay y ofrecerlos.
import test from 'node:test'
import assert from 'node:assert/strict'
import { separarArchivados } from '../../src/features/clientes/services/cartera.ts'

const c = (nombre, activo) => ({ nombre, activo })

test('el archivado sale de la lista y no desaparece: queda contado aparte', () => {
  const { activos, archivados } = separarArchivados([
    c('ARCOR', true), c('Messinas', false), c('La Estrella', true),
  ])
  assert.deepEqual(activos.map((x) => x.nombre), ['ARCOR', 'La Estrella'])
  assert.deepEqual(archivados.map((x) => x.nombre), ['Messinas'])
})

test('sin ningún archivado no hay puerta de vuelta que ofrecer', () => {
  const { activos, archivados } = separarArchivados([c('ARCOR', true)])
  assert.equal(activos.length, 1)
  assert.equal(archivados.length, 0)
})

test('los dos grupos suman SIEMPRE el total: ninguna fila se pierde por el camino', () => {
  // Un filtro escrito con `=== false` en vez de `!c.activo` deja afuera cualquier fila cuyo `activo`
  // llegue como null —y una columna agregada con `add column` sin default llega en null—: el cliente
  // desaparecería de las dos listas y de la pantalla, sin un solo error.
  const filas = [c('a', true), c('b', false), { nombre: 'c', activo: null }]
  const { activos, archivados } = separarArchivados(filas)
  assert.equal(activos.length + archivados.length, filas.length)
  assert.deepEqual(archivados.map((x) => x.nombre), ['b', 'c'])
})

test('el orden que traía la lectura se respeta en cada grupo', () => {
  // La lectura ya viene ordenada por obras activas y nombre. Reordenar acá haría que la lista
  // cambiara de orden al mostrar los archivados, y nadie encontraría dos veces lo mismo en el
  // mismo lugar.
  const { activos } = separarArchivados([c('z', true), c('a', true), c('m', true)])
  assert.deepEqual(activos.map((x) => x.nombre), ['z', 'a', 'm'])
})
