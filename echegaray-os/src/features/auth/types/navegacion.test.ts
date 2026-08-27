import test from 'node:test'
import assert from 'node:assert/strict'
import { destinoDeLaHome, solapaActiva, solapasDeNav } from './navegacion.ts'
import { puedeVerRuta } from './areas.ts'

// LA BARRA DE NIVEL 1 — «dónde estoy» en las rutas de primer nivel.
//
// Esta regla YA SE ROMPIÓ UNA VEZ (24/08, commit fdfdb03e): `/presupuestos`, `/documentos` y
// `/flujo-caja` no pintaban ninguna solapa, así que la navegación no decía dónde estabas parado. Se
// arregló en el componente, con una expresión regular adentro de un archivo `'use client'` que
// `node --test` no podía mirar. Ahora la regla es una función pura y esto es lo que la fija.

const claves = (rol: Parameters<typeof solapasDeNav>[0]) => solapasDeNav(rol).map((s) => s.clave)
const activa = (ruta: string, rol: Parameters<typeof solapasDeNav>[0] = 'direccion') =>
  solapaActiva(ruta, solapasDeNav(rol))

test('Administración ve TRES solapas: Presupuestos subió a nivel 1', () => {
  assert.deepEqual(claves('direccion'), ['administracion', 'obras', 'presupuestos'])
  assert.deepEqual(claves('administracion'), ['administracion', 'obras', 'presupuestos'])
})

test('el jefe de obra NO ve Presupuestos: un presupuesto ES precio', () => {
  // La ruta está en `RUTAS_SOLO_ECONOMIA` y la base cierra `cotizaciones_select` con
  // `ve_economia()`. Dibujarle la solapa sería una pantalla más ancha que la base.
  assert.deepEqual(claves('jefe_obra'), ['administracion', 'obras'])
  assert.deepEqual(claves('campo'), ['obras'])
  assert.deepEqual(claves(null), ['obras'], 'sin perfil se cae al nivel MENOS privilegiado')
})

test('cada ruta de primer nivel dice dónde estás', () => {
  assert.equal(activa('/presupuestos'), 'presupuestos')
  assert.equal(activa('/presupuestos/casa-luna/partida/3'), 'presupuestos')
  // LO QUE NO CAMBIA de la corrección del 24/08: estas tres siguen pintando Administración.
  assert.equal(activa('/documentos'), 'administracion')
  assert.equal(activa('/flujo-caja'), 'administracion')
  assert.equal(activa('/clientes/la-estrella'), 'administracion')
  assert.equal(activa('/administracion/pendientes'), 'administracion')
  // Y `/obra` (el workspace del jefe) sigue pintando Obras.
  assert.equal(activa('/obra'), 'obras')
  assert.equal(activa('/obras/le-comedor/tareas'), 'obras')
  // `/control-obras` salió de la expresión el 27/08/2026 con la ruta: la reemplazó `/obras`, que ya
  // estaba primera en la misma alternancia. Si alguien la devuelve sin la pantalla, la barra dice
  // «Obras» para una URL que contesta 404.
  assert.equal(activa('/control-obras'), null)
})

test('un prefijo no es una ruta: `/clientes-vip` no es Clientes', () => {
  // La expresión anterior no exigía el corte, así que cualquier ruta que EMPEZARA con esas letras
  // encendía la solapa. Hoy no existe `/obras-viejas`, pero el día que exista no puede heredar el
  // «dónde estoy» de otra área.
  assert.equal(activa('/clientes-vip'), null)
  assert.equal(activa('/presupuestos-2025'), null)
})

test('con una sola solapa, esa es la activa esté donde esté', () => {
  // El nivel Obras no dibuja una barra de un elemento: dibuja el nombre del área. Y `/campo` o
  // `/mi-informacion` no empiezan con `/obras`, así que sin este caso se apagaría sola.
  assert.equal(activa('/campo', 'campo'), 'obras')
  assert.equal(activa('/mi-informacion/recibos', 'campo'), 'obras')
})

// ═══ LA HOME TIENE QUE SER ALCANZABLE, Y NADIE PUEDE REBOTAR AL ENTRAR ═══
//
// El defecto de fondo era doble y llevaba nueve meses puesto: `/` mandaba a `/flujo-caja` para
// TODOS, y `/flujo-caja` no estaba enlazada desde ninguna parte de `src/`. O sea, la única pantalla
// a la que el sistema te lleva solo era la única a la que no podías volver — y para tres de los
// cuatro niveles ni siquiera era su pantalla: rebotaban.

test('nadie aterriza en una pantalla que su rol no puede abrir', () => {
  // Éste es EL defecto. Con el destino fijo en `/flujo-caja`, un jefe de obra hacía `/` →
  // `/flujo-caja` → `/obras` y un empleado `/` → `/flujo-caja` → `/hoy`: dos y tres saltos para
  // llegar a una pantalla que el sistema ya sabía cuál era. Si alguien vuelve a poner un destino
  // fijo, este test se pone rojo para el rol que no lo puede abrir.
  for (const rol of ['direccion', 'administracion', 'jefe_obra', 'campo'] as const) {
    const destino = destinoDeLaHome(rol)
    assert.equal(puedeVerRuta(rol, destino), true, `${rol} aterriza en ${destino}, que su rol no abre`)
  }
})

test('quien ve economía sigue aterrizando en el Flujo de Caja', () => {
  // La decisión del dueño del 09/07/2026 —«el home es el espejo del Sheet»— no cambió: lo que
  // cambió es que ahora sólo la recibe quien puede abrirla.
  assert.equal(destinoDeLaHome('direccion'), '/flujo-caja')
  assert.equal(destinoDeLaHome('administracion'), '/flujo-caja')
})

test('el resto aterriza en su propia entrada, no en la del dinero', () => {
  assert.equal(destinoDeLaHome('jefe_obra'), '/administracion', 'su área es Administración, no Obras')
  assert.equal(destinoDeLaHome('campo'), '/hoy')
  // Sin perfil se cae al nivel MENOS privilegiado, igual que `solapasDeNav`: el modo de fallar de
  // un default permisivo acá es aterrizar a un desconocido en la pantalla de la plata.
  assert.equal(destinoDeLaHome(null), '/obras')
  assert.equal(destinoDeLaHome(undefined), '/obras')
})

test('el destino de la home es una solapa que ese rol tiene dibujada, o su pantalla propia', () => {
  // Lo que hace alcanzable a la home es que la marca lleve a `/`. Lo que hace que la home no sea
  // un callejón es que el destino esté EN la barra —o sea la pantalla propia del empleado, que no
  // tiene barra—. Si un rol aterrizara en algo que no está en ningún lado, volvemos al agujero.
  for (const rol of ['direccion', 'administracion', 'jefe_obra'] as const) {
    const destino = destinoDeLaHome(rol)
    const enLaBarra = solapasDeNav(rol).some((s) => s.href === destino)
    const laPintaUnaSolapa = solapaActiva(destino, solapasDeNav(rol)) !== null
    assert.ok(enLaBarra || laPintaUnaSolapa, `${rol} aterriza en ${destino}, que no enciende ninguna solapa`)
  }
})
