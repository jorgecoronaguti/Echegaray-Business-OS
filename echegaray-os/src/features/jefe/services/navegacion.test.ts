import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CONTEXTOS, conObra, contextoActivo, obraElegida, volverDe } from './navegacion.ts'

test('EL CONTEXTO SE ENCIENDE POR PREFIJO CON BARRA, no por «empieza con»', () => {
  // El defecto que atrapa: `startsWith('/obra/tareas')` enciende «Tareas» estando en
  // `/obra/tareas-viejas`, y la barra señala una pantalla en la que no estamos.
  assert.equal(contextoActivo('/obra/tareas'), '/obra/tareas')
  assert.equal(contextoActivo('/obra/tareas/abc'), '/obra/tareas')
  assert.equal(contextoActivo('/obra/tareas-viejas'), null)
})

test('LAS PANTALLAS QUE SE ABREN DESDE OTRA NO ENCIENDEN NINGÚN CONTEXTO', () => {
  // El defecto que atrapa: `/obra/avance-masivo` empieza con `/obra/avance`, que AHORA es un
  // contexto. Sin el corte por barra, el masivo encendería «Avance» en la barra de abajo.
  assert.equal(contextoActivo('/obra/avance-masivo'), null)
  assert.equal(contextoActivo('/obra/frente'), null)
})

// CAMBIO DE REGLA DECLARADO (Design 23/08): eran tres contextos porque el cuarto del contrato viejo
// («Más») no tenía pantalla. El canónico J01 dibuja «Hoy · Tareas · Avance · Gente» y Avance sí la
// tiene: J03. Los dos tests de abajo afirmaban lo contrario y se actualizan, no se borran.
test('SON CUATRO CONTEXTOS, y Avance es uno de ellos', () => {
  assert.equal(CONTEXTOS.length, 4)
  assert.deepEqual(CONTEXTOS.map((c) => c.label), ['Hoy', 'Tareas', 'Avance', 'Gente'])
})

test('LA MISMA RUTA SON DOS PANTALLAS: J03 lleva barra, el formulario de una tarea lleva flecha', () => {
  // El defecto que atrapa: `/obra/avance?actividad=…` se abre desde Tareas y necesita volver. Si el
  // contexto se decidiera sólo por el `pathname`, esa pantalla quedaría con barra y sin salida.
  assert.equal(contextoActivo('/obra/avance'), '/obra/avance')
  assert.equal(contextoActivo('/obra/avance', true), null)
  assert.equal(volverDe('/obra/avance', 'messina'), null)
  assert.equal(volverDe('/obra/avance', 'messina', true), '/obra/tareas?obra=messina')
})

test('SIN OBRA NO SE ESCRIBE UN «?obra=» VACÍO', () => {
  // El defecto que atrapa: un parámetro presente y vacío se lee después como «ninguna obra», que es
  // distinto de «todavía no elegí».
  assert.equal(conObra('/obra/hoy', null), '/obra/hoy')
  assert.equal(conObra('/obra/hoy', ''), '/obra/hoy')
  assert.equal(conObra('/obra/hoy', 'san-francisco'), '/obra/hoy?obra=san-francisco')
})

test('LOS PARÁMETROS EXTRA VIAJAN JUNTO A LA OBRA', () => {
  assert.equal(
    conObra('/obra/avance', 'messina', { actividad: 'a1' }),
    '/obra/avance?obra=messina&actividad=a1',
  )
})

test('UNA OBRA QUE NO ES SUYA CAE A LA PRIMERA SUYA, no a una pantalla vacía', () => {
  // El defecto que atrapa: abrir la obra pedida sin verificarla dibuja cero filas —la base no le da
  // nada— y eso se lee como «esta obra no tiene tareas».
  const suyas = [{ id: 'san-francisco' }, { id: 'quattropani' }]
  assert.equal(obraElegida(suyas, 'ajena'), 'san-francisco')
  assert.equal(obraElegida(suyas, 'quattropani'), 'quattropani')
  assert.equal(obraElegida(suyas, null), 'san-francisco')
})

test('SIN NINGUNA OBRA DEVUELVE NULL: no se inventa una', () => {
  assert.equal(obraElegida([], 'san-francisco'), null)
})

test('LA FLECHA VUELVE A UN DESTINO DECLARADO, con la obra puesta', () => {
  // El defecto que atrapa: `avance-masivo` empieza con `/obra/avance` — evaluado en el otro orden,
  // la flecha del masivo llevaba a Tareas, que no es de donde se abre.
  assert.equal(volverDe('/obra/avance-masivo', 'messina'), '/obra/hoy?obra=messina')
  assert.equal(volverDe('/obra/avance', 'messina', true), '/obra/tareas?obra=messina')
  assert.equal(volverDe('/obra/frente', 'messina'), '/obra/hoy?obra=messina')
})

test('LAS PANTALLAS CON BARRA NO LLEVAN FLECHA', () => {
  assert.equal(volverDe('/obra/hoy', 'messina'), null)
  assert.equal(volverDe('/obra/tareas', 'messina'), null)
})
