import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EFECTIVO_ESCRITORIO, INICIO_JEFE_ESCRITORIO, caraDeEscritorioDelJefe } from './caraDelJefe.ts'

const cara = (ruta: string, recordada?: string | null) => {
  const u = new URL(ruta, 'https://x')
  return caraDeEscritorioDelJefe(u.pathname, u.searchParams, recordada)
}

test('J01 en la PC es la portada de escritorio, con la obra que traía', () => {
  assert.equal(cara('/obra/hoy'), INICIO_JEFE_ESCRITORIO)
  assert.equal(cara('/obra/hoy?obra=pisos-industriales'), '/obras/hoy?obra=pisos-industriales')
  assert.equal(cara('/obra/hoy', 'quattropani'), '/obras/hoy?obra=quattropani', 'sin ?obra= usa la recordada')
})

test('cada contexto de la barra del teléfono tiene su par en la ficha de escritorio', () => {
  assert.equal(cara('/obra/tareas?obra=q'), '/obras/q?vista=tareas')
  assert.equal(cara('/obra/personas?obra=q'), '/obras/q?vista=personal')
  assert.equal(cara('/obra/avance?obra=q'), '/obras/q')
  assert.equal(cara('/obra/avance-masivo?obra=q'), '/obras/q?vista=tareas&sub=parte')
  assert.equal(cara('/obra/frente?obra=q&frente=f1'), '/obras/q?vista=tareas')
  assert.equal(
    cara('/obra/avance?obra=q&actividad=8f0c2a3e-1b2c-4d5e-8f90-123456789abc'),
    '/obras/q/avance/8f0c2a3e-1b2c-4d5e-8f90-123456789abc',
    'el formulario de UNA tarea va a la pantalla de avance de esa tarea',
  )
})

test('sin obra en la URL ni recordada, las pantallas de una obra caen en la portada (ahí se elige)', () => {
  assert.equal(cara('/obra/tareas'), INICIO_JEFE_ESCRITORIO)
  assert.equal(cara('/obra/personas', null), INICIO_JEFE_ESCRITORIO)
  assert.equal(cara('/obra/tareas', 'quattropani'), '/obras/quattropani?vista=tareas')
})

test('un id que no tiene forma de id no viaja a la URL de destino', () => {
  assert.equal(cara('/obra/tareas?obra=../../clientes'), INICIO_JEFE_ESCRITORIO)
  assert.equal(cara('/obra/hoy?obra=%3Cscript%3E'), INICIO_JEFE_ESCRITORIO)
})

test('Mi efectivo: lo que se mira y se firma tiene cara de PC; rendir y devolver siguen en el teléfono', () => {
  assert.equal(cara('/obra/efectivo?obra=q'), EFECTIVO_ESCRITORIO)
  assert.equal(cara('/mi-informacion/efectivo'), EFECTIVO_ESCRITORIO)
  assert.equal(cara('/mi-informacion/efectivo/rendiciones'), EFECTIVO_ESCRITORIO)
  assert.equal(cara('/mi-informacion/efectivo/rendiciones/abc'), EFECTIVO_ESCRITORIO)
  assert.equal(cara('/mi-informacion/efectivo/firmar?entrega=e-1'), `${EFECTIVO_ESCRITORIO}?firmar=e-1`)
  assert.equal(cara('/mi-informacion/efectivo/rendir'), null)
  assert.equal(cara('/mi-informacion/efectivo/devolver'), null)
})

test('lo que no es del teléfono del jefe no se toca', () => {
  for (const r of ['/obras', '/obras/q', '/obras/hoy', '/administracion/personas', '/herramientas', '/campo/herramientas', '/obrador', '/mi-informacion']) {
    assert.equal(cara(r), null, r)
  }
})

test('la portada de escritorio no es la cartera: el jefe la puede abrir', async () => {
  const { puedeVerRuta } = await import('./areas.ts')
  assert.equal(puedeVerRuta('jefe_obra', INICIO_JEFE_ESCRITORIO), true)
  assert.equal(puedeVerRuta('jefe_obra', EFECTIVO_ESCRITORIO), true)
  assert.equal(puedeVerRuta('jefe_obra', '/obras'), false, 'la cartera sigue cerrada al jefe (24/09)')
})
