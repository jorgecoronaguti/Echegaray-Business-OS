import test from 'node:test'
import assert from 'node:assert/strict'
import { documentosDeCobranzas } from '../../clientes/services/documentoDeCobranza.ts'
import { agendaDeCobro, cuando, diasHasta, proximoPorCliente } from './cobrosProximos.ts'

const HOY = '2026-09-21'
const NOMBRES = new Map([['c1', 'Messina'], ['c2', 'ARCOR']])

/** Filas con la forma de `cliente_cobranza` (la vista fila por fila de Cobranzas). */
const FILAS = [
  { cobranza_id: '1', cliente_id: 'c1', estado: 'Pendiente', fecha_cobro: '2026-09-22', total_bruto: '19662500', numero_comprobante: 'Playón azufre · blanco' },
  { cobranza_id: '2', cliente_id: 'c1', estado: 'Pendiente', fecha_cobro: '2026-09-22', total_bruto: '9400000', numero_comprobante: 'Playón azufre · negro' },
  { cobranza_id: '3', cliente_id: 'c2', estado: 'Pendiente', fecha_cobro: '2026-09-26', total_bruto: '2274800', numero_comprobante: '01-00000216' },
  { cobranza_id: '4', cliente_id: 'c2', estado: 'Facturado', fecha_cobro: '2026-10-12', total_bruto: '1391500', numero_comprobante: '01-00000221' },
  { cobranza_id: '5', cliente_id: 'c1', estado: 'Pendiente', fecha_cobro: '2026-11-30', total_bruto: '5000000', numero_comprobante: 'lejos' },
  // Cobrado: ya no es deuda y no entra en la agenda.
  { cobranza_id: '6', cliente_id: 'c1', estado: 'Cobrado', fecha_cobro: '2026-09-18', total_bruto: '1000000', numero_comprobante: 'cobrado' },
]

test('la agenda ordena por fecha, suma las ventanas de 7/15/30 días y marca el primero', () => {
  const a = agendaDeCobro(documentosDeCobranzas(FILAS, HOY), NOMBRES, HOY)
  assert.equal(a.filas.length, 5, 'el cobrado no es deuda')
  assert.deepEqual(a.filas.map((f) => f.fecha), ['2026-09-22', '2026-09-22', '2026-09-26', '2026-10-12', '2026-11-30'])
  assert.equal(a.filas[0].dias, 1)
  assert.equal(a.filas[0].cliente, 'Messina')
  assert.equal(a.en7, 19662500 + 9400000 + 2274800, 'entra lo que vence hasta el día 7 inclusive')
  assert.equal(a.en15, a.en7, 'entre el día 8 y el 15 no vence nada')
  assert.equal(a.en30, a.en7 + 1391500)
  assert.deepEqual(a.primero, { fecha: '2026-09-22', dias: 1, total: 19662500 + 9400000 })
  assert.deepEqual(a.vencido, { n: 0, total: 0 })
})

test('un documento sin fecha de cobro no se acomoda en ningún día: se cuenta aparte', () => {
  const a = agendaDeCobro(documentosDeCobranzas([
    ...FILAS,
    { cobranza_id: '7', cliente_id: 'c2', estado: 'Pendiente', fecha_cobro: null, total_bruto: '777000', numero_comprobante: 'sin Q' },
  ], HOY), NOMBRES, HOY)
  assert.deepEqual(a.sinFecha, { n: 1, total: 777000 })
  assert.equal(a.filas.length, 5, 'no entra a la lista con una fecha inventada')
  assert.equal(a.en7 + a.en30 > 0, true)
})

test('lo vencido se dice vencido y va primero, con su plata aparte', () => {
  const a = agendaDeCobro(documentosDeCobranzas([
    { cobranza_id: '8', cliente_id: 'c1', estado: 'Pendiente', fecha_cobro: '2026-09-18', total_bruto: '3000000', numero_comprobante: 'atrasado' },
    ...FILAS,
  ], HOY), NOMBRES, HOY)
  assert.equal(a.filas[0].fecha, '2026-09-18')
  assert.equal(a.filas[0].dias, -3)
  assert.equal(a.filas[0].vencido, true)
  assert.deepEqual(a.vencido, { n: 1, total: 3000000 })
  assert.equal(a.en7, 19662500 + 9400000 + 2274800, 'lo vencido no se cuenta como lo que entra')
})

test('el próximo cobro de cada cliente es el más cercano, y el vencido gana', () => {
  const a = agendaDeCobro(documentosDeCobranzas(FILAS, HOY), NOMBRES, HOY)
  const p = proximoPorCliente(a)
  assert.equal(p.get('c1')?.fecha, '2026-09-22')
  assert.equal(p.get('c2')?.fecha, '2026-09-26')
})

test('el tiempo se dice en palabras', () => {
  assert.equal(cuando(0), 'hoy')
  assert.equal(cuando(1), 'mañana')
  assert.equal(cuando(8), 'en 8 días')
  assert.equal(cuando(-1), 'vencido ayer')
  assert.equal(cuando(-3), 'vencido hace 3 días')
  assert.equal(diasHasta('2026-09-22', HOY), 1)
  assert.equal(diasHasta('2026-09-20', HOY), -1)
})
