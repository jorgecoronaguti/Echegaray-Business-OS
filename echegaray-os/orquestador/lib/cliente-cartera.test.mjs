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
import {
  separarArchivados, totalesCartera, VISTAS_CARTERA, esVistaCartera,
} from '../../src/features/clientes/services/cartera.ts'
// El módulo entero, para poder afirmar lo que NO exporta: una función retirada por decisión del dueño
// tiene que poder dejar rojo el día que alguien la escribe de nuevo.
import * as cartera from '../../src/features/clientes/services/cartera.ts'

const c = (nombre, activo) => ({ nombre, activo })

/** Una fila de la cartera como la lee la pantalla. Sin CUIT ni contrato, que es el caso incómodo. */
const cli = (nombre, p = {}) => ({
  nombre, activo: true, cuit: null, telefono: '+54 351 512-3344',
  n_obras_activas: 0, contratado: null, ...p,
})

const CARTERA = [
  cli('La Estrella', { cuit: '30716490498', n_obras_activas: 2, contratado: 295886970 }),
  cli('Messina', { cuit: '30620311703', n_obras_activas: 6, contratado: 36540482.65 }),
  cli('Quattropani', { n_obras_activas: 0, contratado: 97650000 }),
  cli('ARCOR', { n_obras_activas: 0, contratado: null }),
  cli('San Francisco', { n_obras_activas: 4, contratado: 299679630 }),
]

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

// ── EL PIE DE LA CARTERA, Y EL FILTRO QUE EL DUEÑO MANDÓ SACAR ─────────────────────────────────
//
// ═══ POR QUÉ ESTE ARCHIVO NO PODÍA NI IMPORTARSE (12/09/2026) ═══
//
// Importaba `recortarCartera` y `avisoDeDatos`, que ya no existen: el commit e3bb12a0 (10/09) las
// retiró por orden del dueño —*«ESTO ESTÁ CADA VEZ PEOR, NO ESTÁS USANDO TU SKILL DE UX»*— junto con
// el chip «Datos faltantes», `faltaUnDatoQueFrena`, `senalesClientes` y el filo ámbar de la fila. El
// motivo está escrito en ese commit: el filtro *«reintroducía las aclaraciones "sin teléfono / sin
// contrato" que el dueño mandó sacar dos veces»*. El archivo entero fallaba con `SyntaxError`, así que
// los seis tests que SÍ siguen valiendo —el archivado y el pie— tampoco corrían.
//
// Los tests del recorte no se «arreglan»: se retiran con su función, y en su lugar queda la AFIRMACIÓN
// DE LA DECISIÓN. Una función borrada vuelve; una decisión sin test vuelve dos veces.

test('el recorte «datos faltantes» NO puede volver: el dueño lo mandó sacar tres veces', () => {
  // Lo que se afirma es la ausencia, y se afirma sobre el módulo —no sobre una pantalla— porque es
  // ahí donde la función volvería a nacer. Las vistas son DOS: todo y activos.
  assert.deepEqual([...VISTAS_CARTERA], ['todo', 'activos'])
  assert.ok(!esVistaCartera('sin-datos'), 'volvió el recorte de datos faltantes (e3bb12a0)')
  for (const ido of ['recortarCartera', 'avisoDeDatos', 'faltaUnDatoQueFrena', 'senalesClientes']) {
    assert.ok(!(ido in cartera), `${ido} volvió al módulo: el dueño lo mandó sacar el 10/09/2026`)
  }
})

test('una vista desconocida no se acepta en silencio: la URL no puede inventar un recorte', () => {
  // `esVistaCartera` es el portero de un parámetro de la URL. Si aceptara cualquier cosa, el día que
  // alguien escriba ?vista=activas —en plural— la lista mostraría todo y nadie vería el error.
  assert.ok(esVistaCartera('todo') && esVistaCartera('activos'))
  for (const mala of ['activas', 'SIN-DATOS', '', undefined]) assert.ok(!esVistaCartera(mala))
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
