// LO QUE ATRAPA: un avatar que afirma gente que no está, y una cuadrilla vacía disfrazada de
// «sin asignar» (o al revés). Los dos mienten sobre cuánta gente hay en la actividad.

import test from 'node:test'
import assert from 'node:assert/strict'
import { cuadrillaDeLaTarea, iniciales } from './contextoTarea.ts'

test('las iniciales toman nombre y APELLIDO, no las dos primeras palabras', () => {
  assert.equal(iniciales('Emiliano González'), 'EG')
  assert.equal(iniciales('Juan Carlos Pérez Molina'), 'JM')
  assert.equal(iniciales('Reta'), 'R')
  assert.equal(iniciales('  '), '?')
})

test('SIN CUADRILLA ASIGNADA devuelve null, no una cuadrilla vacía', () => {
  assert.equal(cuadrillaDeLaTarea({ cuadrilla_id: null, cuadrilla: null }, [], {}, {}), null)
})

test('la cuadrilla trae sus integrantes vigentes con nombre', () => {
  const c = cuadrillaDeLaTarea(
    { cuadrilla_id: 'c2', cuadrilla: 'texto viejo' },
    [{ id: 'c2', nombre: 'Cuadrilla 2' }],
    { c2: ['p1', 'p2'] },
    { p1: 'Emiliano González', p2: 'Ismael Jofré' },
  )
  assert.deepEqual(c, { nombre: 'Cuadrilla 2', integrantes: ['Emiliano González', 'Ismael Jofré'] })
})

test('UN INTEGRANTE SIN NOMBRE NO SE DIBUJA: sería gente afirmada que nadie puede ver', () => {
  // Pasa cuando el plantel se lee con menos permisos que la asignación. Un avatar «?» se cuenta
  // igual que una persona real en «N personas», y eso es inventar dotación.
  const c = cuadrillaDeLaTarea(
    { cuadrilla_id: 'c2', cuadrilla: null },
    [{ id: 'c2', nombre: 'Cuadrilla 2' }],
    { c2: ['p1', 'desconocida'] },
    { p1: 'Emiliano González' },
  )
  assert.deepEqual(c?.integrantes, ['Emiliano González'])
})

test('la cuadrilla vieja en TEXTO sigue nombrándose aunque no tenga id ni gente cargada', () => {
  const c = cuadrillaDeLaTarea({ cuadrilla_id: null, cuadrilla: '2 oficiales + 2 ayudantes' }, [], {}, {})
  assert.deepEqual(c, { nombre: '2 oficiales + 2 ayudantes', integrantes: [] })
})
