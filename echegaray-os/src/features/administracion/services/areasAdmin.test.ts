import test from 'node:test'
import assert from 'node:assert/strict'
import { areaActiva, DESTINOS, destinosVisibles, hayFiloAntes } from './areasAdmin.ts'
import { RUTAS_SOLO_ECONOMIA, puedeVerRuta } from '../../auth/types/areas.ts'

// LA BARRA DE NIVEL 2 — siete destinos en tres grupos (00 · Home Navegación v2).
//
// Lo que estas pruebas impiden: que la barra vuelva a ser diez tablas en fila, que un destino se
// dibuje para quien el middleware va a rebotar, y —sobre todo— que la barra se apague adentro de
// las pantallas que «Trabajo» absorbió.

test('son SIETE destinos en TRES grupos, en el orden del mockup', () => {
  assert.deepEqual(
    DESTINOS.map((d) => d.titulo),
    ['Trabajo', 'Clientes', 'Personal', 'Proveedores', 'Compras', 'Base maestra', 'Documentos'],
  )
  assert.deepEqual([...new Set(DESTINOS.map((d) => d.grupo))], ['trabajo', 'quien', 'registro'])
})

test('el filo va SÓLO donde cambia el grupo, y sobre la lista ya filtrada por rol', () => {
  const todas = [...DESTINOS]
  assert.deepEqual(todas.map((_, i) => hayFiloAntes(todas, i)), [false, true, false, false, true, false, false])

  // El jefe de obra no ve Documentos. Si el filo se calculara sobre la lista completa, quedaría uno
  // colgando al final de SU barra, separando nada de nada.
  const suyas = destinosVisibles('jefe_obra')
  assert.equal(hayFiloAntes(suyas, suyas.length - 1), false)
})

test('el jefe de obra ve sus destinos y ninguno del precio', () => {
  const suyas = destinosVisibles('jefe_obra').map((d) => d.clave)
  assert.deepEqual(suyas, ['trabajo', 'clientes', 'personas', 'proveedores', 'compras', 'base-maestra'])
  assert.ok(!suyas.includes('documentos'), 'el catálogo de Drive entero es de quien ve economía')
})

test('sin rol todavía cargado se falla CERRADO', () => {
  // Una solapa que aparece medio segundo y desaparece es peor que una que tarda en aparecer.
  assert.ok(!destinosVisibles(null).some((d) => d.clave === 'documentos'))
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

test('«Trabajo» sigue encendida adentro de lo que absorbió', () => {
  // ÉSTE es el defecto que la reagrupación puede introducir: Pendientes y Asistencia perdieron su
  // solapa, y sin la absorción la barra se apaga entera al entrar en ellas — la pantalla deja de
  // decir dónde está parado el que la mira.
  assert.equal(areaActiva('/administracion'), 'trabajo')
  assert.equal(areaActiva('/administracion/pendientes'), 'trabajo')
  assert.equal(areaActiva('/administracion/asistencia'), 'trabajo')
  assert.equal(areaActiva('/administracion/pendientes?f=algo'), 'trabajo')
})

test('«Trabajo» NO se enciende por ser prefijo de las demás rutas del área', () => {
  // `/administracion` es prefijo de `/administracion/personas`: sin el caso exacto, la entrada
  // quedaría encendida en las cinco pantallas del área a la vez.
  assert.equal(areaActiva('/administracion/personas'), 'personas')
  assert.equal(areaActiva('/administracion/personas/juan-perez'), 'personas')
  assert.equal(areaActiva('/administracion/proveedores?vista=resolver'), 'proveedores')
  assert.equal(areaActiva('/administracion/base-maestra/recursos'), 'base-maestra')
})

test('la ficha de un cliente sigue estando DENTRO de Clientes', () => {
  assert.equal(areaActiva('/clientes'), 'clientes')
  assert.equal(areaActiva('/clientes/la-estrella'), 'clientes')
  assert.equal(areaActiva('/documentos'), 'documentos')
})

test('Usuarios ya no es una sección del área: no enciende ninguna solapa', () => {
  // Bajó al menú de la cuenta (v2). Es una decisión declarada, no un olvido: si alguien la devuelve
  // a la barra, este test se pone rojo y hay que discutirlo.
  assert.equal(areaActiva('/administracion/usuarios'), null)
  // Y Presupuestos subió a nivel 1: tampoco enciende una solapa de nivel 2.
  assert.equal(areaActiva('/presupuestos'), null)
  assert.equal(areaActiva('/obras'), null)
})

test('las dos pantallas del portal encienden «Clientes» sin ser un octavo destino', () => {
  // El defecto que esto impide: `areaActiva` leía `absorbe` SÓLO en el destino `trabajo`. Con el
  // campo declarado para todos y leído para uno, una pantalla colgada de otra solapa apagaba la
  // barra entera — y la única alternativa era agregar un destino que el mockup no tiene.
  assert.equal(areaActiva('/administracion/portal'), 'clientes')
  assert.equal(areaActiva('/administracion/cronograma'), 'clientes')
  assert.equal(areaActiva('/administracion/cronograma?obra=abc'), 'clientes')
  // Y siguen siendo SIETE: la absorción no agrega solapas.
  assert.equal(DESTINOS.length, 7)
})

test('absorber no le roba la ruta a «Trabajo» ni a los demás', () => {
  // `/administracion` sigue siendo Trabajo aunque Clientes absorba dos rutas que empiezan igual.
  assert.equal(areaActiva('/administracion'), 'trabajo')
  assert.equal(areaActiva('/administracion/pendientes'), 'trabajo')
  assert.equal(areaActiva('/administracion/personas'), 'personas')
  // Y lo que nadie absorbe sigue sin encender nada.
  assert.equal(areaActiva('/administracion/usuarios'), null)
})

test('el portal es una ruta del dinero: el jefe de obra no la abre', () => {
  // Decidir quién ve la plata de un cliente es economía. La solapa que la absorbe (Clientes) SÍ la
  // ve el jefe, así que sin esta línea el enlace de la pantalla de Clientes lo llevaría a un rebote.
  assert.equal(puedeVerRuta('jefe_obra', '/administracion/portal'), false)
  assert.equal(puedeVerRuta('jefe_obra', '/administracion/cronograma'), false)
  assert.equal(puedeVerRuta('administracion', '/administracion/portal'), true)
  assert.ok(RUTAS_SOLO_ECONOMIA.includes('/administracion/portal'))
})
