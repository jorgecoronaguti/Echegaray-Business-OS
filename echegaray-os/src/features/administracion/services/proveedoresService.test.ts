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
import { resumirCompras } from './proveedoresService.ts'
import type { NombreResuelto } from '../types/index.ts'

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
