import { test } from 'node:test'
import assert from 'node:assert/strict'
import { contiene, contieneEnAlguno, plano, urlDeBusqueda } from './busqueda.ts'

test('buscar sin acentos encuentra lo acentuado, y al revés', () => {
  // El defecto que atrapa: quien busca «galpon» concluye que la obra «Galpón» no existe —la
  // conclusión más cara que puede sacar de un listado.
  assert.equal(plano('  Galpón MESSINA '), 'galpon messina')
  assert.ok(contiene('Reparación de Galpón', 'galpon'))
  assert.ok(contiene('Reparacion de Galpon', 'GALPÓN'))
})

test('el campo vacío NO vacía la lista', () => {
  // El defecto que atrapa: un `q.length > 0 && ...` mal puesto deja la pantalla en blanco apenas se
  // borra el buscador, que es lo primero que hace todo el mundo después de buscar.
  assert.ok(contiene('cualquier cosa', ''))
  assert.ok(contiene('cualquier cosa', '   '))
  assert.ok(contiene(null, ''))
  assert.equal(contiene(null, 'juan'), false)
})

test('se busca sobre varios campos como si fueran uno solo', () => {
  // Nombre comercial + razón social, o persona + obra: el que busca escribe lo que tiene delante,
  // no la columna en la que el sistema lo guardó.
  assert.ok(contieneEnAlguno(['La Estrella', 'Alimentos del Sur SAS'], 'alimentos del sur'))
  assert.ok(contieneEnAlguno(['Juan Pérez', null, 'Obra Norte'], 'perez obra'))
  assert.equal(contieneEnAlguno(['Juan Pérez', null], 'gomez'), false)
})

test('la URL conserva lo que había que conservar y descarta lo vacío', () => {
  assert.equal(
    urlDeBusqueda('/administracion/personas', { f: 'en_obra', nueva: undefined }, ' juan '),
    '/administracion/personas?f=en_obra&q=juan',
  )
  assert.equal(urlDeBusqueda('/obras', undefined, 'messina'), '/obras?q=messina')
  // Un valor con espacios o acentos viaja codificado, no roto.
  assert.equal(urlDeBusqueda('/obras', undefined, 'galpón sur'), '/obras?q=galp%C3%B3n+sur')
})

test('`q` VACÍA viaja igual: si se omite, la vista recordada resucita la búsqueda anterior', () => {
  // El defecto que atrapa, y por eso este test es el que no se puede borrar: el middleware de
  // `/obras` restaura la última vista guardada SÓLO cuando la URL no trae ninguna clave de vista
  // (`vistaRecordada.queryARestaurar`). Un navegador enviando el formulario siempre mandaba `q=`.
  // Si al borrar el texto la URL quedara sin `q`, borrar el buscador volvería a filtrar solo.
  assert.equal(urlDeBusqueda('/obras', undefined, ''), '/obras?q=')
  assert.equal(urlDeBusqueda('/obras', { etapa: 'terminacion' }, '   '), '/obras?etapa=terminacion&q=')
})
