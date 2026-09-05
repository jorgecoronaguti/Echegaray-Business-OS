import test from 'node:test'
import assert from 'node:assert/strict'
import { areaActiva, DESTINOS, destinosVisibles, hayFiloAntes } from './areasAdmin.ts'
import { RUTAS_SOLO_ECONOMIA, puedeVerRuta } from '../../auth/types/areas.ts'

// LA BARRA DE NIVEL 2 — cuatro destinos en dos grupos (handoff CRM / Administración v4).
//
// Lo que estas pruebas impiden: que la barra vuelva a ser diez tablas en fila, que un destino se
// dibuje para quien el middleware va a rebotar, y —sobre todo— que la barra se apague adentro de
// las dos colas que perdieron su solapa (Pendientes y Asistencia).

test('son CUATRO destinos en DOS grupos, en el orden del handoff v4', () => {
  assert.deepEqual(
    DESTINOS.map((d) => d.titulo),
    ['Clientes', 'Personal', 'Proveedores', 'Compras'],
  )
  assert.deepEqual([...new Set(DESTINOS.map((d) => d.grupo))], ['quien', 'registro'])
})

test('«Trabajo», «Base maestra» y «Documentos» ya no son destinos', () => {
  // Es una decisión declarada del handoff v4, no un olvido: si alguien los devuelve a la barra,
  // esto se pone rojo y hay que discutirlo antes de tener siete hermanos de todo otra vez.
  const claves = DESTINOS.map((d) => d.clave)
  assert.ok(!claves.includes('trabajo'))
  assert.ok(!claves.includes('base-maestra'))
  assert.ok(!claves.includes('documentos'))
})

test('el filo va SÓLO donde cambia el grupo, y sobre la lista ya filtrada por rol', () => {
  const todas = [...DESTINOS]
  assert.deepEqual(todas.map((_, i) => hayFiloAntes(todas, i)), [false, false, false, true])

  // El filo se calcula sobre la lista YA filtrada: nunca puede quedar uno abriendo la barra, que
  // es lo que pasaría el día que un destino sea sólo de quien ve economía y el cálculo mire la
  // lista completa.
  for (const rol of ['direccion', 'administracion', 'jefe_obra', null] as const) {
    assert.equal(hayFiloAntes(destinosVisibles(rol), 0), false, `filo colgando para ${rol}`)
  }
})

test('el jefe de obra ve los cuatro: ninguno es precio', () => {
  // Una compra es COSTO, no PRECIO. Lo que el jefe no ve es cuánto se vendió la obra, y eso no está
  // en ninguna de estas cuatro pantallas.
  assert.deepEqual(
    destinosVisibles('jefe_obra').map((d) => d.clave),
    ['clientes', 'personas', 'proveedores', 'compras'],
  )
})

test('sin rol todavía cargado se falla CERRADO', () => {
  // Una solapa que aparece medio segundo y desaparece es peor que una que tarda en aparecer.
  for (const d of destinosVisibles(null)) {
    assert.ok(puedeVerRuta(null, d.href), `${d.href} se dibuja sin saber quién mira`)
  }
})

test('la barra y la puerta usan el MISMO portero', () => {
  // Si mañana alguien agrega una ruta económica a la barra y se olvida de la lista, el jefe la ve y
  // el middleware lo rebota — un botón que existe, se puede apretar y lleva a nada.
  for (const d of DESTINOS.filter((x) => !puedeVerRuta('jefe_obra', x.href))) {
    assert.ok(
      RUTAS_SOLO_ECONOMIA.some((r) => d.href === r || d.href.startsWith(`${r}/`)),
      `${d.href} no se le dibuja al jefe pero no está declarada en RUTAS_SOLO_ECONOMIA`,
    )
  }
})

// ═══ DÓNDE ESTOY PARADO ═══

test('las dos colas que perdieron su solapa encienden la sección que las reclama', () => {
  // ÉSTE es el defecto que la reducción puede introducir: Pendientes y Asistencia eran de
  // «Trabajo», y sin la absorción la barra se apaga entera al entrar en ellas — la pantalla deja de
  // decir dónde está parado el que la mira.
  assert.equal(areaActiva('/administracion/pendientes'), 'compras')
  assert.equal(areaActiva('/administracion/pendientes?f=algo'), 'compras')
  assert.equal(areaActiva('/administracion/asistencia'), 'personas')
})

test('cada sección se enciende en sus subrutas y no en las de al lado', () => {
  assert.equal(areaActiva('/administracion/personas'), 'personas')
  assert.equal(areaActiva('/administracion/personas/juan-perez'), 'personas')
  assert.equal(areaActiva('/administracion/proveedores?vista=resolver'), 'proveedores')
  assert.equal(areaActiva('/administracion/compras'), 'compras')
})

test('la ficha de un cliente sigue estando DENTRO de Clientes', () => {
  assert.equal(areaActiva('/clientes'), 'clientes')
  assert.equal(areaActiva('/clientes/la-estrella'), 'clientes')
  assert.equal(areaActiva('/clientes/arcor'), 'clientes')
})

test('lo que ya no es un destino no enciende ninguna solapa', () => {
  // Las cinco rutas siguen VIVAS y respondiendo: lo único que perdieron es la solapa. Si alguna
  // vuelve a encender algo, es porque volvió a la barra, y eso se discute.
  assert.equal(areaActiva('/administracion'), null)
  assert.equal(areaActiva('/administracion/base-maestra/recursos'), null)
  assert.equal(areaActiva('/documentos'), null)
  assert.equal(areaActiva('/administracion/usuarios'), null)
  assert.equal(areaActiva('/presupuestos'), null)
  assert.equal(areaActiva('/obras'), null)
  assert.equal(DESTINOS.length, 4)
})

test('las dos pantallas del portal se retiraron: ya no encienden nada', () => {
  // Duplicaban las solapas 31 y 32 de la ficha del cliente y se borraron el 26/08/2026.
  assert.equal(areaActiva('/administracion/portal'), null)
  assert.equal(areaActiva('/administracion/cronograma'), null)
})

test('las rutas retiradas del portal ya no figuran entre las del dinero', () => {
  // Se ensancha el tipo a `string[]` a propósito: la lista es un literal y preguntarle por una ruta
  // que ya NO contiene es justamente lo que TypeScript rechaza.
  const soloEconomia: readonly string[] = RUTAS_SOLO_ECONOMIA
  assert.ok(!soloEconomia.includes('/administracion/portal'))
  assert.ok(!soloEconomia.includes('/administracion/cronograma'))
  assert.equal(puedeVerRuta('jefe_obra', '/clientes'), true)
})
