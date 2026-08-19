// LOS EQUIPOS DE UN PARTE, leídos del formulario.

import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { leerEquipos, rotuloEquipo } from './equiposDelParte.ts'

const fd = (o: Record<string, string>) => Object.entries(o) as [string, string][]

test('un renglón con nombre y horas', () => {
  assert.deepEqual(leerEquipos(fd({ equipo_0: 'Hormigonera', equipo_horas_0: '4' })),
    [{ equipo: 'Hormigonera', horas: 4 }])
})

test('un renglón SIN NOMBRE no existe, aunque traiga horas', () => {
  // Son los renglones vacíos que deja el formulario cuando alguien agregó uno de más.
  assert.deepEqual(leerEquipos(fd({ equipo_0: '   ', equipo_horas_0: '6' })), [])
})

test('el nombre sin horas se guarda igual: «se usó» ya es información', () => {
  assert.deepEqual(leerEquipos(fd({ equipo_0: 'Mini excavadora' })),
    [{ equipo: 'Mini excavadora', horas: null }])
})

test('la coma es separador decimal: en un teclado en español es lo que sale', () => {
  assert.deepEqual(leerEquipos(fd({ equipo_0: 'Vibrador', equipo_horas_0: '2,5' })),
    [{ equipo: 'Vibrador', horas: 2.5 }])
})

test('un negativo, un cero o un texto no imputan horas: el equipo entra sin ellas', () => {
  assert.deepEqual(leerEquipos(fd({ equipo_0: 'A', equipo_horas_0: '-3' })), [{ equipo: 'A', horas: null }])
  assert.deepEqual(leerEquipos(fd({ equipo_1: 'B', equipo_horas_1: 'ocho' })), [{ equipo: 'B', horas: null }])
})

test('el mismo equipo en dos renglones es UNO, con las horas sumadas', () => {
  const r = leerEquipos(fd({
    equipo_0: 'Hormigonera', equipo_horas_0: '4',
    equipo_1: 'hormigonera', equipo_horas_1: '2',
  }))
  assert.deepEqual(r, [{ equipo: 'Hormigonera', horas: 6 }])
})

test('el rótulo dice las horas cuando existen y sólo el nombre cuando no', () => {
  assert.equal(rotuloEquipo({ equipo: 'Hormigonera', horas: 4 }), 'Hormigonera 4 h')
  assert.equal(rotuloEquipo({ equipo: 'Hormigonera', horas: null }), 'Hormigonera')
})
