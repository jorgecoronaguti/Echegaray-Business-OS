import test from 'node:test'
import assert from 'node:assert/strict'
import { INICIO_JEFE_TELEFONO, destinoDeLaHome, solapaActiva, solapasDeNav } from './navegacion.ts'
import { INICIO_JEFE_TELEFONO as INICIO_COMPARTIDO } from '../../../shared/auth/areas.ts'
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

// ═══ PRESUPUESTOS VOLVIÓ A NIVEL 2 (dueño, 21/09/2026) ═══
//
// *«"presupuestos" es una sección dentro de CRM admin».* Había subido a nivel 1 el 25/08 por el
// mockup v2; el dueño lo revirtió mirando la barra. Presupuestos no vuelve a la barra, y
// `/presupuestos` vuelve a pintar «Administración» —igual que `/clientes` y `/documentos`—, que es
// la regla que la corrección del 24/08 había fijado para todas las rutas de primer nivel.
// ═══ HERRAMIENTAS, AL FINAL (dueño, 21/09/2026) ═══
// «Administración · Obras · Analíticas · Herramientas», y para todos los niveles con los mismos permisos.
// ═══ HERRAMIENTAS ANTES QUE ANALÍTICAS (dueño, 23/09/2026) ═══
test('Administración ve CUATRO solapas: Presupuestos es sección del área y Herramientas va antes que Analíticas', () => {
  assert.deepEqual(claves('direccion'), ['administracion', 'obras', 'herramientas', 'analiticas'])
  assert.deepEqual(claves('administracion'), ['administracion', 'obras', 'herramientas', 'analiticas'])
  assert.ok(!claves('direccion').includes('presupuestos'), 'no puede volver a la barra de la aplicación sin una decisión del dueño')
})

test('el jefe de obra NO ve Presupuestos: un presupuesto ES precio', () => {
  // La ruta sigue en `RUTAS_SOLO_ECONOMIA` y la base cierra `cotizaciones_select` con
  // `ve_economia()`. Que haya bajado de nivel no le abre la puerta a nadie.
  assert.equal(puedeVerRuta('jefe_obra', '/presupuestos'), false)
  assert.deepEqual(claves('jefe_obra'), ['obras', 'herramientas'], 'el jefe en la PC: Obras · Herramientas (25/09/2026)')
  assert.deepEqual(claves('campo'), ['obras', 'herramientas'], 'permisos iguales: el empleado también ve Herramientas')
  assert.deepEqual(claves(null), ['obras'], 'sin perfil se cae al nivel MENOS privilegiado')
  assert.deepEqual(claves('cliente'), ['obras'], 'el cliente del portal no ve el inventario')
})

test('Herramientas y la puerta del QR (/h/<código>) encienden Herramientas', () => {
  assert.equal(activa('/herramientas'), 'herramientas')
  assert.equal(activa('/herramientas/inventario'), 'herramientas')
  assert.equal(activa('/h/HER-0042'), 'herramientas')
  assert.equal(activa('/herramientas-viejas'), null)
  assert.equal(activa('/hoy', 'campo'), 'obras')
})

test('cada ruta de primer nivel dice dónde estás', () => {
  assert.equal(activa('/presupuestos'), 'administracion')
  assert.equal(activa('/presupuestos/casa-luna/partida/3'), 'administracion')
  assert.equal(activa('/analiticas'), 'analiticas')
  assert.equal(activa('/analiticas-2025'), null)
  // LO QUE NO CAMBIA de la corrección del 24/08: éstas siguen pintando Administración, y desde el
  // 21/09 también Presupuestos, que había sido la única excepción.
  assert.equal(activa('/documentos'), 'administracion')
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

test('el empleado está en Obras en sus pantallas propias, que no empiezan con /obras', () => {
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

// ═══ `/flujo-caja` SE RETIRÓ (27/08/2026) ═══
//
// El dueño: *«hay una de flujo-caja que está deprecada y se accede por error o saliendo de una
// página»*. Era el destino del redirect de `/` y no tenía un solo enlace: se entraba sin querer y
// no había vuelta. La decisión del 09/07 —«el home es el espejo del Sheet»— queda sin efecto.
test('nadie aterriza en /flujo-caja: la ruta se retiró', () => {
  for (const rol of ['direccion', 'administracion', 'jefe_obra', 'campo'] as const) {
    assert.notEqual(destinoDeLaHome(rol), '/flujo-caja', `${rol} todavía aterriza en la ruta retirada`)
  }
  assert.equal(destinoDeLaHome(null), '/obras')
})

// ═══ CAMBIO DE CONTRATO (dueño, 24/09/2026): UN NIVEL, UN INICIO, EN CUALQUIER APARATO ═══
//
// Hasta hoy Dirección y Administración entraban a `/administracion` (→ Clientes) en escritorio y a
// `/obras` en el teléfono, y el jefe a `/administracion` (→ Personal) en escritorio y a `/obra/hoy` en
// el teléfono. Medido en producción: un iPad o el «sitio de escritorio» del iPhone mandaban al jefe a
// Personal y al dueño a Clientes, en el mismo teléfono. El dueño: «el inicio no depende de la
// detección del aparato». La función ya no recibe el aparato.
test('quien administra aterriza en Obras, la primera de su barra, desde cualquier aparato', () => {
  assert.equal(destinoDeLaHome('direccion'), '/obras')
  assert.equal(destinoDeLaHome('administracion'), '/obras')
})

test('el resto aterriza en su propia entrada, no en la del dinero', () => {
  assert.equal(destinoDeLaHome('jefe_obra'), '/obra/hoy', 'su inicio es su obra (J01), no Personal')
  assert.equal(destinoDeLaHome('campo'), '/hoy')
  // Sin perfil se cae al nivel MENOS privilegiado, igual que `solapasDeNav`: el modo de fallar de
  // un default permisivo acá es aterrizar a un desconocido en la pantalla de la plata.
  assert.equal(destinoDeLaHome(null), '/obras')
  assert.equal(destinoDeLaHome(undefined), '/obras')
})

test('destinoDeLaHome NO recibe el aparato: el inicio no puede volver a depender del User-Agent', () => {
  // Si alguien le devuelve el segundo parámetro, este test lo nombra: la regla del 24/09 es que
  // el mismo usuario entra al mismo lugar desde un teléfono, un iPad o una computadora.
  assert.equal(destinoDeLaHome.length, 1)
})

test('la solapa «Obras» del jefe lleva a su portada de escritorio: la cartera ya no es suya', () => {
  const obras = solapasDeNav('jefe_obra').find((s) => s.clave === 'obras')
  // 25/09/2026: en la PC la solapa va directo a la cara de computadora (`/obras/hoy`), no a J01.
  assert.equal(obras?.href, '/obras/hoy')
  assert.equal(puedeVerRuta('jefe_obra', obras!.href), true)
  assert.equal(solapasDeNav('direccion').find((s) => s.clave === 'obras')?.href, '/obras')
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

test('la raíz del jefe en el teléfono es UNA: sale de shared/auth y J01 enciende Obras', () => {
  // `features/auth` y `features/jefe` la leen de `shared/auth/areas.ts`: una sola definición.
  assert.equal(INICIO_JEFE_TELEFONO, INICIO_COMPARTIDO)
  assert.equal(INICIO_JEFE_TELEFONO, '/obra/hoy')
  assert.equal(activa('/obra/hoy', 'jefe_obra'), 'obras', 'J01 enciende Obras si alguna vez se dibuja el header')
})

test('«Fuentes» (/integraciones) cuelga de Administración, no de Obras (dueño, 23/09/2026 · duda 6)', () => {
  assert.equal(activa('/integraciones'), 'administracion')
  assert.equal(activa('/integraciones/pedidos-materiales'), 'administracion')
  assert.equal(activa('/integraciones-x'), null)
})

test('el jefe en la PC ve Obras · Herramientas: nunca Administración, Clientes, Compras ni Analíticas (dueño, 25/09/2026)', () => {
  assert.deepEqual(solapasDeNav('jefe_obra').map((s) => s.label), ['Obras', 'Herramientas'])
  // Los demás niveles no cambian.
  assert.deepEqual(solapasDeNav('direccion').map((s) => s.label), ['Administración', 'Obras', 'Herramientas', 'Analíticas'])
  assert.deepEqual(solapasDeNav('administracion').map((s) => s.label), ['Administración', 'Obras', 'Herramientas', 'Analíticas'])
})

test('el jefe que abre Personal desde su obra ve encendida Obras; Clientes no enciende nada', () => {
  const jefe = solapasDeNav('jefe_obra')
  assert.equal(solapaActiva('/administracion/personas', jefe), 'obras')
  assert.equal(solapaActiva('/administracion/personas/asistencia', jefe), 'obras')
  assert.equal(solapaActiva('/obras/hoy', jefe), 'obras')
  assert.equal(solapaActiva('/herramientas/material', jefe), 'herramientas')
  assert.equal(solapaActiva('/clientes', jefe), null)
  // Para quien SÍ tiene Administración, Personal sigue siendo Administración.
  assert.equal(solapaActiva('/administracion/personas', solapasDeNav('administracion')), 'administracion')
})
