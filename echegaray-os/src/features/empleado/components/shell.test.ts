import { test } from 'node:test'
import assert from 'node:assert/strict'
import { contextoActivo, esRaiz, inicialesDe } from './shell-logica.ts'

test('una subpantalla mantiene encendido SU contexto', () => {
  // El defecto que atrapa: con una comparación exacta, entrar a «Mis horas» apaga los tres tabs y la
  // barra deja de decir dónde estás — que es lo único que la barra hace.
  assert.equal(contextoActivo('/mi-informacion/horas'), '/mi-informacion')
  assert.equal(contextoActivo('/mi-trabajo/tareas/abc'), '/mi-trabajo')
  assert.equal(contextoActivo('/hoy'), '/hoy')
  assert.equal(contextoActivo('/obras'), null)
})

test('«/mi-trabajo» no enciende «/mi-trabajo-de-otro»', () => {
  assert.equal(contextoActivo('/mi-trabajoso'), null)
})

test('SÓLO LAS TRES RAÍCES LLEVAN BARRA DE CONTEXTOS', () => {
  // El defecto que atrapa: si `esRaiz` se resolviera por prefijo —como `contextoActivo`—, la barra
  // de 58px volvería a aparecer en TODA pantalla de detalle, encima de la última fila de la lista y
  // compitiendo con la flecha de volver. Son dos reglas distintas sobre la misma ruta a propósito.
  assert.equal(esRaiz('/hoy'), true)
  assert.equal(esRaiz('/mi-trabajo'), true)
  assert.equal(esRaiz('/mi-informacion'), true)
  assert.equal(esRaiz('/mi-informacion/horas'), false)
  assert.equal(esRaiz('/mi-trabajo/tareas/abc'), false)
  assert.equal(esRaiz('/obras'), false)
})

test('una pantalla de detalle mantiene su contexto encendido AUNQUE no dibuje la barra', () => {
  // Las dos preguntas conviven: «¿de qué contexto soy?» la sigue contestando `contextoActivo` para
  // el header de escritorio, donde los tres tabs SÍ están siempre.
  assert.equal(esRaiz('/mi-informacion/legajo'), false)
  assert.equal(contextoActivo('/mi-informacion/legajo'), '/mi-informacion')
})

test('las iniciales salen del nombre, y si no hay, del email', () => {
  assert.equal(inicialesDe('Juan Morales', null), 'JM')
  assert.equal(inicialesDe(null, 'jmorales@ecsas.com.ar'), 'JE')
  assert.equal(inicialesDe(null, null), '—')
})
