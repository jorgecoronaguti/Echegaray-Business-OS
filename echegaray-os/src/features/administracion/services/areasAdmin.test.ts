import test from 'node:test'
import assert from 'node:assert/strict'
import { areaActiva, DESTINOS, destinosVisibles, hayFiloAntes } from './areasAdmin.ts'
import { RUTAS_SOLO_ECONOMIA, puedeVerRuta } from '../../auth/types/areas.ts'

// LA BARRA DE NIVEL 2 — TRES destinos en dos grupos, desde que Proveedores se fue adentro de
// Compras (dueño, 16/09/2026).
//
// Lo que estas pruebas impiden: que la barra vuelva a ser diez tablas en fila, que un destino se
// dibuje para quien el middleware va a rebotar, y —sobre todo— que la barra se apague adentro de
// las rutas que perdieron su solapa (Pendientes, Asistencia y ahora Proveedores).

test('son SIETE destinos en DOS grupos: Presupuestos volvió al área, Proveedores sigue adentro de Compras', () => {
  // El dueño lo pidió el 16/09/2026: «poné todo el módulo proveedores dentro de compras como
  // sección». Si vuelve a aparecer en la barra, hay DOS puertas al mismo módulo y la sección de
  // Compras deja de ser la única respuesta a dónde vive Proveedores.
  assert.deepEqual(
    DESTINOS.map((d) => d.titulo),
    // PRESUPUESTOS VA ÚLTIMO (dueño, 21/09/2026: «mover "presupuestos" a después de impuestos»).
    // El orden lo fijó él mirando la barra, así que es el orden y no una consecuencia de otra cosa:
    // si alguien lo mueve, esto da rojo y tiene que venir con una decisión suya.
    // Documentos y Fuentes NO están: el dueño las sacó de la barra el 23/09/2026 («quitalas de todo»).
    ['Clientes', 'Personal', 'Compras', 'Impuestos', 'Presupuestos'],
  )
  assert.equal(DESTINOS.some((d) => d.clave === 'proveedores'), false)
  assert.deepEqual([...new Set(DESTINOS.map((d) => d.grupo))], ['quien', 'registro'])
})

test('«Trabajo», «Base maestra», «Documentos» y «Fuentes» no son destinos de la barra', () => {
  // Decisiones declaradas, no olvidos: si alguien los devuelve a la barra, esto se pone rojo y hay
  // que discutirlo. Documentos y Fuentes las sacó el dueño el 23/09/2026 («quitalas de todo»).
  const claves = DESTINOS.map((d) => d.clave)
  assert.ok(!claves.includes('trabajo'))
  assert.ok(!claves.includes('base-maestra'), 'no vuelve como solapa: la absorbió Presupuestos')
  assert.ok(!claves.includes('documentos'))
  assert.ok(!claves.includes('fuentes'))
})

test('el filo va SÓLO donde cambia el grupo, y sobre la lista ya filtrada por rol', () => {
  const todas = [...DESTINOS]
  assert.deepEqual(todas.map((_, i) => hayFiloAntes(todas, i)), [false, false, true, false, false])

  // El filo se calcula sobre la lista YA filtrada: nunca puede quedar uno abriendo la barra, que
  // es lo que pasaría el día que un destino sea sólo de quien ve economía y el cálculo mire la
  // lista completa.
  for (const rol of ['direccion', 'administracion', 'jefe_obra', null] as const) {
    assert.equal(hayFiloAntes(destinosVisibles(rol), 0), false, `filo colgando para ${rol}`)
  }
})

test('el jefe de obra ve Personal y Compras; Clientes es sólo de Administración (dueño, 24/09/2026)', () => {
  // Una compra es COSTO, no PRECIO. Lo que el jefe no ve es cuánto se vendió la obra, y eso no está
  // en ninguna de estas tres pantallas. Proveedores no salió de su alcance: entró a Compras, y que
  // siga viéndolo lo comprueba `seccionesDeCompras.test.ts` sobre las cuatro secciones.
  assert.deepEqual(
    destinosVisibles('jefe_obra').map((d) => d.clave),
    ['personas'], // (dueño, 24/09/2026: el jefe no entra a Clientes, Compras, Impuestos, Presupuestos ni Liquidación)
  )
  assert.ok(!destinosVisibles('jefe_obra').some((d) => d.clave === 'documentos'), '/documentos sigue en RUTAS_SOLO_ECONOMIA')
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

test('lo que perdió su solapa enciende la sección que lo reclama', () => {
  // ÉSTE es el defecto que la reducción puede introducir: Pendientes y Asistencia eran de
  // «Trabajo», y sin la absorción la barra se apaga entera al entrar en ellas — la pantalla deja de
  // decir dónde está parado el que la mira.
  assert.equal(areaActiva('/administracion/pendientes'), 'compras')
  assert.equal(areaActiva('/administracion/pendientes?f=algo'), 'compras')
  assert.equal(areaActiva('/administracion/personas/correcciones'), 'personas')
})

test('TODO Proveedores enciende Compras: la lista, sus dos colas y cada ficha', () => {
  // Es la mudanza del 16/09/2026 mirada desde la barra. Sin la absorción, entrar a un proveedor
  // dejaría las tres solapas apagadas y nadie sabría de qué módulo salió esa pantalla.
  assert.equal(areaActiva('/administracion/proveedores'), 'compras')
  assert.equal(areaActiva('/administracion/proveedores?vista=resolver'), 'compras')
  assert.equal(areaActiva('/administracion/proveedores?vista=deuda'), 'compras')
  assert.equal(areaActiva('/administracion/proveedores/abc-123'), 'compras')
  assert.equal(areaActiva('/administracion/proveedores/abc-123?vista=documentos'), 'compras')
})

test('Impuestos es plata de la empresa: el jefe de obra no ve la solapa, Dirección y Administración sí (16/09/2026)', () => {
  // Si alguien la saca de RUTAS_SOLO_ECONOMIA, el jefe ve una solapa cuya base (ve_economia) le
  // devuelve cero filas: una pantalla que diría «nada que pagar» cuando lo que pasa es que no puede ver.
  assert.equal(puedeVerRuta('jefe_obra', '/administracion/impuestos'), false)
  assert.ok(destinosVisibles('direccion').some((d) => d.clave === 'impuestos'))
  assert.ok(destinosVisibles('administracion').some((d) => d.clave === 'impuestos'))
  assert.equal(areaActiva('/administracion/impuestos'), 'impuestos')
})

test('cada sección se enciende en sus subrutas y no en las de al lado', () => {
  assert.equal(areaActiva('/administracion/personas'), 'personas')
  assert.equal(areaActiva('/administracion/personas/juan-perez'), 'personas')
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
  // `/administracion/base-maestra` SÍ enciende, desde el 21/09: la absorbió Presupuestos, porque
  // tareas tipo y recursos son la materia con la que se cotiza.
  assert.equal(areaActiva('/administracion/base-maestra/recursos'), 'presupuestos')
  assert.equal(areaActiva('/documentos'), null, 'sin solapa desde el 23/09')
  assert.equal(areaActiva('/integraciones'), null, 'sin solapa desde el 23/09')
  assert.equal(areaActiva('/administracion/usuarios'), null)
  assert.equal(areaActiva('/obras'), null)
  assert.equal(DESTINOS.length, 5)
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
  assert.equal(puedeVerRuta('jefe_obra', '/clientes'), false, 'Clientes es sólo de Administración (24/09/2026)')
})
