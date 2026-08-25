import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CONTEXTOS, contextoActivo, esRaiz, inicialesDe } from './shell-logica.ts'

test('una subpantalla mantiene encendido SU contexto', () => {
  // El defecto que atrapa: con una comparación exacta, entrar a «Mis documentos» apaga los cuatro
  // tabs y la barra deja de decir dónde estás — que es lo único que la barra hace.
  assert.equal(contextoActivo('/mi-informacion/documentos'), '/mi-informacion')
  assert.equal(contextoActivo('/mi-trabajo/tareas/abc'), '/mi-trabajo')
  assert.equal(contextoActivo('/hoy'), '/hoy')
  assert.equal(contextoActivo('/obras'), null)
})

test('«/mi-trabajo» no enciende «/mi-trabajo-de-otro»', () => {
  assert.equal(contextoActivo('/mi-trabajoso'), null)
})

test('«HORAS» LE GANA A «YO», PORQUE ES SU PROPIA PESTAÑA (M02/M06/M09)', () => {
  // El defecto que atrapa: `contextoActivo` resuelve por prefijo y devuelve la PRIMERA coincidencia.
  // Si en CONTEXTOS «/mi-informacion» quedara antes que «/mi-informacion/horas», estar parado en Mis
  // horas encendería la pestaña «Yo» —la barra señalaría un lugar donde no estás— y la pestaña
  // Horas no se encendería nunca. Es un reordenamiento inocente de una lista literal: nada más lo
  // detecta.
  assert.equal(contextoActivo('/mi-informacion/horas'), '/mi-informacion/horas')
  assert.deepEqual(CONTEXTOS.map((c) => c.label), ['Hoy', 'Trabajo', 'Horas', 'Yo'])
})

test('SÓLO LAS CUATRO RAÍCES LLEVAN BARRA DE CONTEXTOS', () => {
  // El defecto que atrapa: si `esRaiz` se resolviera por prefijo —como `contextoActivo`—, la barra
  // de 58px volvería a aparecer en TODA pantalla de detalle, encima de la última fila de la lista y
  // compitiendo con la flecha de volver. Son dos reglas distintas sobre la misma ruta a propósito.
  assert.equal(esRaiz('/hoy'), true)
  assert.equal(esRaiz('/mi-trabajo'), true)
  assert.equal(esRaiz('/mi-informacion'), true)
  assert.equal(esRaiz('/mi-informacion/horas'), true)
  assert.equal(esRaiz('/mi-informacion/documentos'), false)
  assert.equal(esRaiz('/mi-trabajo/tareas/abc'), false)
  assert.equal(esRaiz('/obras'), false)
})

test('una pantalla de detalle mantiene su contexto encendido AUNQUE no dibuje la barra', () => {
  // Las dos preguntas conviven y son distintas: `esRaiz` decide si se DIBUJA la barra y
  // `contextoActivo` decide cuál de los cuatro estaría encendido. La segunda tiene que seguir
  // contestando bien aunque hoy no se dibuje nada: es la que enciende la pestaña cuando la persona
  // vuelve a la raíz desde un detalle, y la que rompería en silencio si alguien las unificara.
  assert.equal(esRaiz('/mi-informacion/legajo'), false)
  assert.equal(contextoActivo('/mi-informacion/legajo'), '/mi-informacion')
})

test('las iniciales salen del nombre, y si no hay, del email', () => {
  assert.equal(inicialesDe('Juan Morales', null), 'JM')
  assert.equal(inicialesDe(null, 'jmorales@ecsas.com.ar'), 'JE')
  assert.equal(inicialesDe(null, null), '—')
})
