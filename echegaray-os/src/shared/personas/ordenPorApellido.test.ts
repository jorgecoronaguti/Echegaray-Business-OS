import { test } from 'node:test'
import assert from 'node:assert/strict'
import { claveDeOrden, compararPorApellido, nombreDePersona } from './nombre.ts'

// EL DEFECTO (dueño, 28/09/2026: «se ha roto el orden por apellido del personal en toda la app»):
// desde el 24/09 se MUESTRA «Emiliano Maldonado» (`nombre_para_mostrar`) y varias listas ordenaban
// por ese mismo texto, o sea por nombre de pila. Se muestra igual; se ordena por el legajo.

const PLANTEL = [
  { nombre_completo: 'MALDONADO BATISTA EMILIANO MIGUEL', nombre_para_mostrar: 'Emiliano Maldonado' },
  { nombre_completo: 'NIEVAS VILLEGAS JUAN PABLO', nombre_para_mostrar: 'Juan Pablo Nievas' },
  { nombre_completo: 'ABALLAY DIEGO', nombre_para_mostrar: 'Diego Aballay' },
  { nombre_completo: 'CORONA GUTIERREZ JORGE', nombre_para_mostrar: 'Jorge Corona' },
]

test('compararPorApellido ordena por el legajo: Aballay, Corona, Maldonado, Nievas', () => {
  const orden = [...PLANTEL].sort(compararPorApellido).map(nombreDePersona)
  assert.deepEqual(orden, ['Diego Aballay', 'Jorge Corona', 'Emiliano Maldonado', 'Juan Pablo Nievas'])
})

test('el fixture sí distingue: ordenar por lo que se muestra da OTRO orden (el del bug)', () => {
  const porPila = PLANTEL.map(nombreDePersona).sort((a, b) => a.localeCompare(b, 'es'))
  assert.deepEqual(porPila, ['Diego Aballay', 'Emiliano Maldonado', 'Jorge Corona', 'Juan Pablo Nievas'])
})

test('la clave ignora tildes y mayúsculas; sin legajo cae en el nombre para mostrar', () => {
  assert.ok(compararPorApellido({ nombre_completo: 'ÁLVAREZ JUAN' }, { nombre_completo: 'bazán pedro' }) < 0)
  assert.equal(claveDeOrden({ nombre_completo: null, nombre_para_mostrar: 'Pedro Gómez' }), 'pedro gomez')
  assert.equal(claveDeOrden(null), '')
})

// LA Ñ ES OTRA LETRA, NO UNA N CON TILDE. `sinTildes` descomponía en NFD y borraba todo el rango
// combinante, así que «Ñañez» quedaba «nanez» y se metía entre «Nava» y «Nuñez». En español va
// después de la N entera: Nava, Nuñez, Nuzzo, Ñañez.
test('la Ñ ordena después de la N: Nava, Nuñez, Nuzzo, Ñañez', () => {
  const legajos = ['ÑAÑEZ PEDRO', 'NUZZO ANA', 'NUÑEZ JUAN', 'NAVA LUIS'].map((nombre_completo) => ({ nombre_completo }))
  const orden = [...legajos].sort(compararPorApellido).map((p) => p.nombre_completo)
  assert.deepEqual(orden, ['NAVA LUIS', 'NUÑEZ JUAN', 'NUZZO ANA', 'ÑAÑEZ PEDRO'])
  assert.equal(claveDeOrden({ nombre_completo: 'ÑAÑEZ PEDRO' }), 'ñañez pedro')
})

test('las demás tildes se siguen ignorando, también la de una vocal con virgulilla', () => {
  assert.equal(claveDeOrden({ nombre_completo: 'GÓMEZ ÁLVAREZ JOSÉ' }), 'gomez alvarez jose')
  assert.equal(claveDeOrden('João Müller'), 'joao muller')
})
