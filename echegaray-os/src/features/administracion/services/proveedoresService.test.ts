// LO COMPRADO A UN PROVEEDOR — derivado, y con la ausencia dicha.
//
// La ficha del proveedor muestra «Comprado» sumando lo que `proveedor_nombre_resuelto` ya calcula
// sobre `costos_obra`. Dos formas de mentir sin lanzar un error:
//
//   1. DECIR «$ 0» CUANDO NO HAY NINGÚN NOMBRE VINCULADO. «$ 0» afirma que se le compró por cero;
//      la verdad es que todavía ningún texto del Sheet apunta a este proveedor. Son cosas distintas
//      y la segunda es un trabajo pendiente de canonicalización, no un dato económico.
//   2. MOSTRAR LOS NOMBRES EN CUALQUIER ORDEN. La lista existe para confirmar que las grafías se
//      unificaron; la que más pesa tiene que ir primero.

import test from 'node:test'
import assert from 'node:assert/strict'
import { agruparComprado, coincideProveedor, condicionesDe, resumirCompras } from './proveedoresService.ts'
import type { NombreResuelto, Proveedor } from '../types/index.ts'

const n = (nombre_norm: string, comprobantes: number, total: number, via: NombreResuelto['via']): NombreResuelto => ({
  nombre_norm, comprobantes, total, estado: 'vinculado', proveedor_id: 'p1',
  proveedor_nombre: 'Corralón del Centro', via, alias_id: via === 'resolucion_manual' ? 'a1' : null,
})

test('sin nombres vinculados, lo comprado es una AUSENCIA y no un cero', () => {
  const r = resumirCompras([])
  assert.equal(r.comprado, null)
  assert.notEqual(r.comprado, 0)
  assert.equal(r.comprobantes, 0)
  assert.deepEqual(r.nombres, [])
})

test('lo comprado suma sus nombres y los ordena por lo que pesan', () => {
  const r = resumirCompras([
    n('CORR CENTRO', 3, 1_200_000, 'resolucion_manual'),
    n('CORRALON DEL CENTRO', 40, 30_000_000, 'exacto'),
    n('CORRALON CENTRO SRL', 12, 7_212_900, 'resolucion_manual'),
  ])
  assert.equal(r.comprado, 38_412_900)
  assert.equal(r.comprobantes, 55)
  assert.deepEqual(r.nombres.map((x) => x.nombre_norm),
    ['CORRALON DEL CENTRO', 'CORRALON CENTRO SRL', 'CORR CENTRO'])
  // De dónde salió cada vínculo: escrito IGUAL que el maestro, o resuelto por una persona. No es lo
  // mismo para auditarlo, y por eso viaja hasta la pantalla.
  assert.deepEqual(r.nombres.map((x) => x.manual), [false, true, true])
})

test('un total que llega como cadena se suma, no se concatena', () => {
  const filas = [n('A', 1, 0, 'exacto'), n('B', 1, 0, 'exacto')]
  ;(filas[0] as unknown as { total: unknown }).total = '100.50'
  ;(filas[1] as unknown as { total: unknown }).total = '200.25'
  assert.equal(resumirCompras(filas).comprado, 300.75)
})

// ═══ LA CARTERA (canónico 22) ═══
//
// Tres formas de mentir en el listado, y una prueba para cada una:
//
//   1. SUMARLE A UN PROVEEDOR LOS TEXTOS QUE LA RESOLUCIÓN DESCARTÓ. `proveedor_nombre_resuelto`
//      guarda también los `no_es_proveedor` —el impuesto, el retiro, el nombre que no era nadie—.
//      Agrupar sin mirar el estado le regala esas compras a un proveedor real.
//   2. DECIR «$ 0» EN EL PIE cuando ninguna fila tiene compras leídas. Es el mismo defecto que ya
//      cubre `resumirCompras`, ahora en la fila de total: un 0 afirma que no se compró.
//   3. BUSCAR CON UN `ilike`. Comparaba byte a byte: «corralon» no encontraba «Corralón Sur», y el
//      CUIT tipeado con guiones no encontraba al que la base guarda sin ellos.

const cartera = (id: string, cuit: string | null): Proveedor => ({
  id, nombre: id, razon_social: null, cuit, notas: null, activo: true,
})

const resuelto = (
  proveedor_id: string | null, comprobantes: number, total: number,
  estado: NombreResuelto['estado'] = 'vinculado',
): NombreResuelto => ({
  nombre_norm: `${proveedor_id}-${comprobantes}`, comprobantes, total, estado,
  proveedor_id, proveedor_nombre: null, via: 'exacto', alias_id: null,
})

test('agrupar lo comprado NO le suma a un proveedor los textos marcados «no es proveedor»', () => {
  const mapa = agruparComprado([
    resuelto('p1', 3, 1_000),
    resuelto('p1', 2, 500),
    resuelto('p1', 9, 9_000_000, 'no_es_proveedor'),
    resuelto(null, 4, 400),
  ])
  assert.deepEqual(mapa.get('p1'), { comprobantes: 5, total: 1_500 })
  assert.equal(mapa.size, 1)
})

test('un proveedor sin compras NO entra al mapa: la tabla escribe ausencia, no cero', () => {
  const mapa = agruparComprado([resuelto('p1', 1, 100)])
  assert.equal(mapa.has('p2'), false)
  assert.notEqual(mapa.get('p2'), 0)
})

// ═══ EL FILTRO POR TEXTO, QUE DEJÓ DE SER UN `ilike` ═══
//
// Los tres casos de abajo son los que la consulta de Postgres NO resolvía. El primero es el que se
// vio en pantalla: buscar «corralon» devolvía cero filas teniendo «Corralón Sur» cargado, porque
// `ilike` compara byte a byte y la tilde es otro byte. Nadie escribe los acentos cuando busca.

test('buscar sin tildes encuentra al que las tiene — el defecto del `ilike`', () => {
  const p = { ...cartera('p1', null), nombre: 'Corralón Sur' }
  assert.equal(coincideProveedor(p, 'corralon'), true)
  assert.equal(coincideProveedor(p, 'CORRALON'), true)
  assert.equal(coincideProveedor(p, 'corralón'), true)
})

test('el CUIT se busca por sus dígitos: la base lo guarda sin guiones y la gente lo tipea con ellos', () => {
  const p = cartera('p1', '30708390557')
  assert.equal(coincideProveedor(p, '30-70839055-7'), true)
  assert.equal(coincideProveedor(p, '30708390557'), true)
  assert.equal(coincideProveedor(p, '7083905'), true)
  assert.equal(coincideProveedor(p, '99-99999999-9'), false)
})

test('sin búsqueda NO se vacía la lista, y un proveedor sin CUIT no coincide con cualquier número', () => {
  const p = cartera('p1', null)
  assert.equal(coincideProveedor(p, undefined), true)
  assert.equal(coincideProveedor(p, '   '), true)
  // Un `''.includes('')` mal puesto haría que un proveedor sin CUIT apareciera en toda búsqueda
  // numérica: el que busca un CUIT vería fichas que no lo tienen.
  assert.equal(coincideProveedor(p, '3070'), false)
})

test('la razón social también busca: es el nombre con el que llega la factura', () => {
  const p = { ...cartera('p1', null), nombre: 'Hierros del Centro', razon_social: 'Aceros Cuyanos SA' }
  assert.equal(coincideProveedor(p, 'cuyanos'), true)
})

// ═══ EL PREDICADO QUE COMPARTEN LA LISTA Y EL AVISO ═══
//
// El defecto que atrapa: que «sin CUIT» se escriba dos veces. El aviso de la primera línea dice
// «14» y su enlace cae en la lista filtrada por el MISMO predicado; si uno tratara el CUIT vacío
// como presente y el otro no, la pantalla mandaría a resolver un trabajo que no muestra.

test('el CUIT VACÍO cuenta como ausencia igual que el nulo', () => {
  const cs = condicionesDe({ sinCuit: true })
  assert.ok(cs.some((c) => c.op === 'or' && c.filtro === 'cuit.is.null,cuit.eq.'),
    'el predicado dejó de contemplar el CUIT vacío')
})

test('sin filtro explícito se listan los ACTIVOS: un archivado no es cartera', () => {
  assert.deepEqual(condicionesDe({}), [{ op: 'eq', columna: 'activo', valor: true }])
  assert.deepEqual(condicionesDe({ activo: 'archivados' }), [{ op: 'eq', columna: 'activo', valor: false }])
  assert.deepEqual(condicionesDe({ activo: 'todos' }), [])
})

test('el aviso y la lista salen del MISMO predicado, condición por condición', () => {
  // Si algún día la lista y el conteo dejaran de compartir `condicionesDe`, este test seguiría
  // pasando — por eso el otro control es el estructural: acá se fija el contrato del predicado.
  assert.deepEqual(condicionesDe({ activo: 'activos', sinCuit: true }), [
    { op: 'eq', columna: 'activo', valor: true },
    { op: 'or', filtro: 'cuit.is.null,cuit.eq.' },
  ])
})
