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

test('las dos pantallas del portal se retiraron: ya no encienden nada', () => {
  // Duplicaban las solapas 31 y 32 de la ficha del cliente y se borraron el 26/08/2026. Si alguien
  // las devuelve, este test se pone rojo y hay que discutirlo antes de tener dos veces lo mismo.
  assert.equal(areaActiva('/administracion/portal'), null)
  assert.equal(areaActiva('/administracion/cronograma'), null)
  // La ficha del cliente —que es donde eso vive ahora— sí enciende «Clientes».
  assert.equal(areaActiva('/clientes/arcor'), 'clientes')
  // Y siguen siendo SIETE.
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

test('las rutas retiradas del portal ya no figuran entre las del dinero', () => {
  // Se fueron con las pantallas. Dejarlas en la lista haría creer que hay una puerta cerrada donde
  // no hay ninguna puerta, y el próximo que busque dónde se decide el acceso al portal iría ahí.
  // Se ensancha el tipo a `string[]` a propósito: la lista es un literal y preguntarle por una ruta
  // que ya NO contiene es justamente lo que TypeScript rechaza. El test tiene que poder hacer la
  // pregunta; si mañana alguien devuelve la ruta a la lista, la aserción se pone roja igual.
  const soloEconomia: readonly string[] = RUTAS_SOLO_ECONOMIA
  assert.ok(!soloEconomia.includes('/administracion/portal'))
  assert.ok(!soloEconomia.includes('/administracion/cronograma'))
  // Lo que SÍ sigue siendo del dinero: la ficha del cliente, que es donde eso se administra ahora.
  assert.equal(puedeVerRuta('jefe_obra', '/clientes'), true)
})
