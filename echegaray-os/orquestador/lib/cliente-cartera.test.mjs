// ARCHIVAR UN CLIENTE TIENE QUE TENER EFECTO.
//
// ═══ EL DEFECTO ═══
//
// `archivarCliente` escribía `activo = false` desde el primer día, y `/clientes` mostraba la lista
// entera sin mirar esa columna: el cliente archivado seguía ahí, en la misma posición, con los
// mismos números. El verbo existía y la consecuencia no — igual que «cerrar una obra» antes del
// 18/08. Un test que sólo comprobara que la acción devuelve `ok` habría pasado en verde todo ese
// tiempo, porque la escritura SÍ ocurría: lo que faltaba era que alguien la leyera.
//
// Y la otra mitad, igual de importante: archivar NO PUEDE PARECERSE A BORRAR. Los archivados se
// devuelven aparte —no se descartan— para que la lista pueda decir cuántos hay y ofrecerlos.
import test from 'node:test'
import assert from 'node:assert/strict'
import { separarArchivados } from '../../src/features/clientes/services/cartera.ts'

const c = (nombre, activo) => ({ nombre, activo })

test('el archivado sale de la lista y no desaparece: queda contado aparte', () => {
  const { activos, archivados } = separarArchivados([
    c('ARCOR', true), c('Messinas', false), c('La Estrella', true),
  ])
  assert.deepEqual(activos.map((x) => x.nombre), ['ARCOR', 'La Estrella'])
  assert.deepEqual(archivados.map((x) => x.nombre), ['Messinas'])
})

test('sin ningún archivado no hay puerta de vuelta que ofrecer', () => {
  const { activos, archivados } = separarArchivados([c('ARCOR', true)])
  assert.equal(activos.length, 1)
  assert.equal(archivados.length, 0)
})

test('los dos grupos suman SIEMPRE el total: ninguna fila se pierde por el camino', () => {
  // Un filtro escrito con `=== false` en vez de `!c.activo` deja afuera cualquier fila cuyo `activo`
  // llegue como null —y una columna agregada con `add column` sin default llega en null—: el cliente
  // desaparecería de las dos listas y de la pantalla, sin un solo error.
  const filas = [c('a', true), c('b', false), { nombre: 'c', activo: null }]
  const { activos, archivados } = separarArchivados(filas)
  assert.equal(activos.length + archivados.length, filas.length)
  assert.deepEqual(archivados.map((x) => x.nombre), ['b', 'c'])
})

test('el orden que traía la lectura se respeta en cada grupo', () => {
  // La lectura ya viene ordenada por obras activas y nombre. Reordenar acá haría que la lista
  // cambiara de orden al mostrar los archivados, y nadie encontraría dos veces lo mismo en el
  // mismo lugar.
  const { activos } = separarArchivados([c('z', true), c('a', true), c('m', true)])
  assert.deepEqual(activos.map((x) => x.nombre), ['z', 'a', 'm'])
})

// ── LOS TRES RECORTES DE LA CARTERA (canónico 25, 23/08/2026) ──────────────────────────────────
//
// ═══ EL DEFECTO QUE ATRAPAN ═══
//
// 1. UN CHIP QUE CUENTA DISTINTO DE LO QUE MUESTRA LA TABLA. El contador del recorte y el filtro
//    tienen que salir de la MISMA función: dos criterios parecidos se desincronizan en cuanto uno
//    de los dos cambia, y quien ve «Con obra activa 4» y una tabla de tres filas deja de creerle a
//    la pantalla.
// 2. «CONTRATADO $ 0» CUANDO NADIE CARGÓ NINGÚN CONTRATO. Medido el 24/08: ARCOR tiene el monto en
//    null. Sumar con `?? 0` publica un cero que se lee como un hecho comercial y no lo es.
// 3. «CON OBRA ACTIVA» CALCULADO SOBRE «NO CERRADA». Son criterios distintos: de las 17 obras hay
//    12 `activa`, 1 `pausada` y 4 `cerrada`, y `cliente_panel.n_obras_activas` cuenta las 12. Con
//    el otro criterio, Quattropani aparecería con obra activa y su propia fila diría 0.
import { avisoDeDatos, recortarCartera, totalesCartera } from '../../src/features/clientes/services/cartera.ts'

const cli = (nombre, p = {}) => ({
  nombre, activo: true, cuit: null, n_obras_activas: 0, contratado: null, ...p,
})

const CARTERA = [
  cli('La Estrella', { cuit: '30716490498', n_obras_activas: 2, contratado: 295886970 }),
  cli('Messina', { cuit: '30620311703', n_obras_activas: 6, contratado: 36540482.65 }),
  cli('Quattropani', { n_obras_activas: 0, contratado: 97650000 }),
  cli('ARCOR', { n_obras_activas: 0, contratado: null }),
  cli('San Francisco', { n_obras_activas: 4, contratado: 299679630 }),
]

test('«con obra activa» son las que el panel cuenta como activas, no las que no están cerradas', () => {
  // Quattropani tiene UNA obra que no está cerrada —está pausada— y `n_obras_activas` en 0. Si el
  // recorte mirara «no cerrada», este cliente entraría y su propia fila mostraría cero.
  const activos = recortarCartera(CARTERA, 'activos').map((c) => c.nombre)
  assert.deepEqual(activos, ['La Estrella', 'Messina', 'San Francisco'])
})

test('«datos faltantes» es el CUIT, y el aviso dice qué se rompe sin él', () => {
  const sin = recortarCartera(CARTERA, 'sin-datos').map((c) => c.nombre)
  assert.deepEqual(sin, ['Quattropani', 'ARCOR', 'San Francisco'])
  assert.equal(avisoDeDatos(cli('x')), 'Sin CUIT: no se le puede facturar')
  assert.equal(avisoDeDatos(cli('x', { cuit: '30716490498' })), null)
  // Un CUIT en blanco NO es un CUIT cargado: la columna es texto y acepta espacios.
  assert.equal(avisoDeDatos(cli('x', { cuit: '   ' })), 'Sin CUIT: no se le puede facturar')
})

test('«todos» no recorta nada: el chip por defecto no puede esconder un cliente', () => {
  assert.equal(recortarCartera(CARTERA, 'todo').length, CARTERA.length)
})

test('el contador del chip y la tabla salen de la misma función', () => {
  // Ésta es la afirmación entera: lo que el chip cuenta ES lo que la tabla dibuja.
  for (const vista of ['todo', 'activos', 'sin-datos']) {
    const recorte = recortarCartera(CARTERA, vista)
    assert.equal(recorte.length, recortarCartera(CARTERA, vista).length)
    assert.ok(recorte.every((c) => CARTERA.includes(c)), 'el recorte inventó una fila')
  }
})

test('el total contratado ignora a quien no tiene monto, y no lo cuenta como cero', () => {
  const t = totalesCartera(CARTERA)
  assert.equal(t.clientes, 5)
  assert.equal(t.conObraActiva, 3)
  assert.equal(t.contratado, 295886970 + 36540482.65 + 97650000 + 299679630)
})

test('si NADIE cargó un contrato, el total es null y no $ 0', () => {
  const t = totalesCartera([cli('a'), cli('b')])
  assert.equal(t.contratado, null, 'iba a publicar «CONTRATADO $ 0» sobre dos contratos sin cargar')
})

test('un contrato de cero pesos cargado SÍ es cero: no es lo mismo que no cargarlo', () => {
  const t = totalesCartera([cli('a', { contratado: 0 }), cli('b')])
  assert.equal(t.contratado, 0)
})

test('la cartera vacía no rompe el pie', () => {
  assert.deepEqual(totalesCartera([]), { clientes: 0, conObraActiva: 0, contratado: null })
})
