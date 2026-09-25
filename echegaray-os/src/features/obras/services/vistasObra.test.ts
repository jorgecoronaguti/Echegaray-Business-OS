import test from 'node:test'
import assert from 'node:assert/strict'
import {
  resolverVistaObra, rutaHermana, SUBS_TAREAS, pantallasDeTrabajo, VISTAS_OBRA, hrefCronograma, hrefDeVista, hrefDotacion,
  hrefEconomia, hrefSubcontratos,
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

// ═══ CAMBIO DE REGLA DECLARADO (22/08/2026 · overhaul UX) ═══
// Lista, Tablero y Próximos se RETIRARON: eran representaciones del mismo dataset. Sus URLs viejas
// no caen en el default silencioso (el árbol): abren el Cronograma, que es donde vive lo que
// mostraban.
test('las sub-vistas retiradas caen en el Cronograma, no en el árbol', () => {
  assert.deepEqual(resolverVistaObra('cronograma', 'lista'), { vista: 'tareas', sub: 'gantt' })
  assert.deepEqual(resolverVistaObra('tareas', 'tablero'), { vista: 'tareas', sub: 'gantt' })
  assert.deepEqual(resolverVistaObra('tareas', 'proximos'), { vista: 'tareas', sub: 'gantt' })
})

test('Tareas sin sub abre en el árbol, que es el workspace nuevo', () => {
  assert.deepEqual(resolverVistaObra('tareas', undefined), { vista: 'tareas', sub: 'arbol' })
})

test('una vista inventada a mano cae en Resumen, no en una pantalla en blanco', () => {
  assert.equal(resolverVistaObra('lo-que-sea', undefined).vista, 'resumen')
  assert.equal(resolverVistaObra(undefined, undefined).vista, 'resumen')
})

test('las cinco solapas siguen resolviendo a sí mismas', () => {
  for (const v of ['resumen', 'tareas', 'personal', 'operacion', 'documentos']) {
    assert.equal(resolverVistaObra(v, undefined).vista, v)
  }
})

// ═══ «ECONOMÍA» SALIÓ DE LA OBRA (23/09/2026) ═══
// El dueño: «saca economía de las obras». La solapa no existe más; la pantalla sí, en
// Administración, y la URL vieja —que está en links de chat, marcadores y eventos del CRM— va a
// parar ahí, no a Resumen en silencio.
test('Economía no es solapa de la obra, y `?vista=economia` lleva a Administración', () => {
  assert.equal(VISTAS_OBRA.some((v) => v.id === ('economia' as string)), false)
  assert.equal(hrefEconomia('quattropani'), '/administracion/obras/quattropani')
  assert.equal(rutaHermana('economia', 'quattropani'), '/administracion/obras/quattropani')
  // Si alguien la volviera a meter en VISTAS_OBRA, `resolverVistaObra` la aceptaría y la página
  // no tendría nada que dibujar: cae en Resumen como cualquier vista desconocida.
  assert.equal(resolverVistaObra('economia', undefined).vista, 'resumen')
})

test('un destino nombrado desde un dato se traduce en un solo lugar', () => {
  // Las líneas de plan contra real y el CRM guardan `vista` como nombre; los tres sitios que las
  // dibujaban armaban `?vista=` a mano y un `?vista=economia` a mano hoy cae en Resumen.
  assert.equal(hrefDeVista('messina', 'economia'), '/administracion/obras/messina')
  assert.equal(hrefDeVista('messina', 'compras'), '/obras/messina?vista=operacion&sub=compras')
  assert.equal(hrefDeVista('messina', 'personal'), '/obras/messina?vista=personal')
  assert.equal(hrefDeVista('messina', 'gantt'), '/obras/messina?vista=gantt')
})

test('el cronograma, la dotación y los subcontratos tienen su URL, y no se escribe a mano', () => {
  // Si cada componente arma la ruta con una plantilla suya, el día que cambie la ruta quedan
  // enlaces rotos repartidos. El cronograma vive DENTRO del workspace desde el 24/08/2026: la ruta
  // propia (`/obras/<obra>/cronograma`) redirige acá.
  assert.equal(hrefCronograma('messina'), '/obras/messina?vista=tareas&sub=gantt')
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

// ═══ CAMBIO DE REGLA DECLARADO (22/08/2026 · overhaul UX) ═══
// La sub-vista pasó a llamarse «Cronograma»: con Lista/Tablero/Próximos retiradas ya no compite
// con nada, y «Gantt» nombraba la herramienta en vez del trabajo. La distinción con la secuencia
// CALCULADA (camino crítico, `/obras/<obra>/cronograma`) vive como enlace dentro de la vista.
test('el workspace queda en tres sub-vistas: Tareas, Cronograma y Parte diario', () => {
  assert.deepEqual(SUBS_TAREAS.map((s) => s.id), ['arbol', 'gantt', 'planilla', 'parte'])
  assert.equal(SUBS_TAREAS.find((s) => s.id === 'gantt')?.label, 'Cronograma')
  assert.deepEqual(resolverVistaObra('cronograma', undefined), { vista: 'tareas', sub: 'gantt' })
})

test('`?vista=dotacion` lleva a la 08, no cae en Resumen en silencio', () => {
  // EL DEFECTO QUE ATRAPA (auditoría del 24/08): la 08 vive en una ruta hermana y su nombre no
  // estaba en ninguna tabla, así que `resolverVistaObra` lo mandaba a Resumen sin decir nada —
  // quien seguía el link concluía que la pantalla no existía.
  assert.equal(rutaHermana('dotacion', 'quattropani'), '/obras/quattropani/dotacion')
  assert.equal(resolverVistaObra('dotacion', undefined).vista, 'resumen')
})

test('una vista del workspace NO se desvía a otra ruta', () => {
  for (const v of ['resumen', 'tareas', 'personal', 'operacion', 'documentos', 'gantt', undefined]) {
    assert.equal(rutaHermana(v, 'quattropani'), null, `${v} no tiene ruta hermana`)
  }
})

// ═══ H1 DEL DISEÑO ERP OBRAS (23/09/2026) ═══
test('el árbol de Trabajo se rotula «Tareas» (serie B); el id `arbol` no cambia (marcadores, chat, tests)', () => {
  assert.equal(SUBS_TAREAS.find((s) => s.id === 'arbol')?.label, 'Tareas')
})

test('`?vista=items` (diseño 04b) abre el árbol de Ítems; `sub=planilla` es una pantalla de Trabajo', () => {
  assert.deepEqual(resolverVistaObra('items', undefined), { vista: 'tareas', sub: 'arbol' })
  assert.deepEqual(resolverVistaObra('tareas', 'planilla'), { vista: 'tareas', sub: 'planilla' })
  assert.deepEqual(pantallasDeTrabajo('x', 'planilla').map((p) => p.id), ['arbol', 'gantt', 'planilla', 'parte', 'subcontratos'])
})
