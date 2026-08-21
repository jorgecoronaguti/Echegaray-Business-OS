import test from 'node:test'
import assert from 'node:assert/strict'
import {
  resolverVistaObra, SUBS_TAREAS, hrefCronogramaCalculado, hrefDotacion, hrefSubcontratos,
} from './vistasObra.ts'

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

test('el cronograma calculado y la dotación tienen su propia URL, y no se escribe a mano', () => {
  // Si cada componente arma la ruta con una plantilla suya, el día que cambie la ruta quedan
  // enlaces rotos repartidos. Y la diferencia entre el Gantt guardado y el cronograma calculado
  // tiene que ser visible en la URL: son preguntas distintas sobre la misma fuente.
  assert.equal(hrefCronogramaCalculado('messina'), '/obras/messina/cronograma')
  assert.equal(hrefDotacion('messina'), '/obras/messina/dotacion')
  assert.equal(hrefSubcontratos('messina'), '/obras/messina/subcontratos')
})

// EL DEFECTO QUE ATRAPA: que «Subcontratos» se cuele como sub-vista de Tareas. Si estuviera en
// `SUBS_TAREAS`, `resolverVistaObra` la aceptaría como `?sub=subcontratos` y el workspace abriría
// el árbol de actividades creyendo que muestra los paquetes — la pantalla 10 no existiría y nadie
// vería un error.
test('«Subcontratos» es una pantalla aparte, no una sub-vista del workspace', () => {
  assert.equal(SUBS_TAREAS.some((s) => s.id === ('subcontratos' as string)), false)
  assert.equal(resolverVistaObra('tareas', 'subcontratos').sub, 'arbol')
})

test('«Cronograma» NO es una sub-vista de Tareas: el Gantt de ahí dibuja lo guardado', () => {
  // El alias viejo `?vista=cronograma` sigue cayendo en el Gantt del workspace —eso no se toca,
  // hay marcadores y enlaces vivos— pero la sub-vista se llama «Gantt» a propósito. Llamarla
  // «Cronograma» haría creer que ahí se ve el camino crítico, que se calcula en otra pantalla.
  assert.ok(!SUBS_TAREAS.some((s) => /cronograma/i.test(s.label)))
  assert.equal(SUBS_TAREAS.find((s) => s.id === 'gantt')?.label, 'Gantt')
  assert.deepEqual(resolverVistaObra('cronograma', undefined), { vista: 'tareas', sub: 'gantt' })
})
