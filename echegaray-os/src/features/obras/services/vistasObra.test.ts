import test from 'node:test'
import assert from 'node:assert/strict'
import { resolverVistaObra } from './vistasObra.ts'

// LAS URLS VIEJAS ESTÁN EN LINKS MANDADOS POR CHAT, EN MARCADORES Y EN LOS TESTS. Ninguna puede
// caer en el default silencioso, que mandaría a Resumen a alguien que pidió el cronograma.
test('planificación y ejecución van al workspace de Tareas', () => {
  assert.equal(resolverVistaObra('planificacion', undefined).vista, 'tareas')
  assert.equal(resolverVistaObra('ejecucion', undefined).vista, 'tareas')
})

// ═══ EL ALIAS DECIDE TAMBIÉN CON QUÉ VISTA ABRE ═══
// `?vista=ejecucion` tiene que caer en el parte diario. Resolviendo la vista sin la sub-vista
// caería en el árbol —que no tiene el formulario del parte— y sin un solo error: la pantalla
// abriría, mostraría actividades, y el formulario que la persona venía a usar no estaría.
test('cada alias abre en la vista que la URL vieja mostraba', () => {
  assert.deepEqual(resolverVistaObra('ejecucion', undefined), { vista: 'tareas', sub: 'parte' })
  assert.deepEqual(resolverVistaObra('cronograma', undefined), { vista: 'tareas', sub: 'gantt' })
  assert.deepEqual(resolverVistaObra('gantt', undefined), { vista: 'tareas', sub: 'gantt' })
})

test('la sub-vista explícita de una URL vieja se respeta', () => {
  assert.deepEqual(resolverVistaObra('cronograma', 'lista'), { vista: 'tareas', sub: 'lista' })
  assert.deepEqual(resolverVistaObra('cronograma', 'tablero'), { vista: 'tareas', sub: 'tablero' })
})

test('Tareas sin sub abre en el árbol, que es el workspace nuevo', () => {
  assert.deepEqual(resolverVistaObra('tareas', undefined), { vista: 'tareas', sub: 'arbol' })
})

test('una vista inventada a mano cae en Resumen, no en una pantalla en blanco', () => {
  assert.equal(resolverVistaObra('lo-que-sea', undefined).vista, 'resumen')
  assert.equal(resolverVistaObra(undefined, undefined).vista, 'resumen')
})

test('las seis solapas siguen resolviendo a sí mismas', () => {
  for (const v of ['resumen', 'tareas', 'personal', 'operacion', 'economia', 'documentos']) {
    assert.equal(resolverVistaObra(v, undefined).vista, v)
  }
})
