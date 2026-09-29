import { test } from 'node:test'
import assert from 'node:assert/strict'
import { claveDeOrden, compararPorApellido, nombreDePersona } from './nombre.ts'

// EL DEFECTO (dueño, 28/09/2026: «se ha roto el orden por apellido del personal en toda la app») y su
// reverso (29/09: «primero apellido y después nombre»). Desde el 24/09 se MOSTRABA «Emiliano Maldonado»
// y las listas que ordenaban por ese texto quedaban por nombre de pila. Desde el 29/09 lo curado es
// «Maldonado Emiliano»: se muestra y se ordena por lo mismo, y el legajo queda para los papeles.

const PLANTEL = [
  { nombre_completo: 'MALDONADO BATISTA EMILIANO MIGUEL', nombre_para_mostrar: 'Maldonado Emiliano' },
  { nombre_completo: 'NIEVAS VILLEGAS JUAN PABLO', nombre_para_mostrar: 'Nievas Juan Pablo' },
  { nombre_completo: 'ABALLAY DIEGO', nombre_para_mostrar: 'Aballay Diego' },
  { nombre_completo: 'CORONA GUTIERREZ JORGE', nombre_para_mostrar: 'Corona Jorge' },
]

test('compararPorApellido ordena por apellido: Aballay, Corona, Maldonado, Nievas', () => {
  const orden = [...PLANTEL].sort(compararPorApellido).map(nombreDePersona)
  assert.deepEqual(orden, ['Aballay Diego', 'Corona Jorge', 'Maldonado Emiliano', 'Nievas Juan Pablo'])
})

test('lo que se muestra ya empieza por apellido: ordenar el texto mostrado da el mismo orden', () => {
  const porTexto = PLANTEL.map(nombreDePersona).sort((a, b) => a.localeCompare(b, 'es'))
  assert.deepEqual(porTexto, [...PLANTEL].sort(compararPorApellido).map(nombreDePersona))
})

// «Facundo Butierrez»: su legajo está cargado al revés (nombre primero), o sea que el legajo lo ordena
// por la F. Con la clave leída del curado («Butierrez Facundo») va en la B. Si `claveDeOrden` vuelve a
// preferir el legajo, este test se pone rojo.
test('la clave sale del nombre curado: un legajo cargado al revés no manda a nadie a otra letra', () => {
  const butierrez = { nombre_completo: 'FACUNDO BUTIERREZ', nombre_para_mostrar: 'Butierrez Facundo' }
  const otros = [{ nombre_completo: 'CORONA GUTIERREZ JORGE', nombre_para_mostrar: 'Corona Jorge' },
    { nombre_completo: 'AGUERO CRISTIAN DOMINGO', nombre_para_mostrar: 'Aguero Cristian' }]
  assert.deepEqual([butierrez, ...otros].sort(compararPorApellido).map(nombreDePersona),
    ['Aguero Cristian', 'Butierrez Facundo', 'Corona Jorge'])
})

test('la clave ignora tildes y mayúsculas; sin curado cae en el legajo', () => {
  assert.ok(compararPorApellido({ nombre_completo: 'ÁLVAREZ JUAN' }, { nombre_completo: 'bazán pedro' }) < 0)
  assert.equal(claveDeOrden({ nombre_completo: null, nombre_para_mostrar: 'Gómez Pedro' }), 'gomez pedro')
  assert.equal(claveDeOrden({ nombre_completo: 'GÓMEZ PEDRO', nombre_para_mostrar: null }), 'gomez pedro')
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
