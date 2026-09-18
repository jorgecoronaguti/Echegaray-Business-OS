// EL ADELANTO SIN COLUMNA BANCO — la parte pura: el join por contención, el apareo contra el extracto y el veredicto.
//
// MUTACIONES QUE PONEN ESTE ARCHIVO EN ROJO:
//   · volver el join a la igualdad exacta de fechas (el bloque 02/02..14/02 dejaría de caer en 01/02..15/02);
//   · aparear por importe con cualquier salida del banco (un cheque de $200.000 «probaría» un adelanto);
//   · dar «sí» con una sola persona apareada de cuatro;
//   · usar el mismo giro para pagar a dos personas.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  aparearAdelantos, bloquePerteneceA, conceptoNombraA, lineaBloqueada, valoresDelEscenarioA, ventanaDePago,
} from './jornales-banco-adelanto.mjs'

test('el bloque de JORNALES pertenece a la quincena donde EMPIEZA su encabezado, no a la de fechas iguales', () => {
  const q = { desde: '2026-02-01', hasta: '2026-02-15' }
  assert.equal(bloquePerteneceA(q, { desde: '2026-02-02', hasta: '2026-02-14' }), true, 'el bloque real del dueño')
  assert.equal(bloquePerteneceA(q, { desde: '2026-02-01', hasta: '2026-02-15' }), true, 'el bloque calendario')
  assert.equal(bloquePerteneceA(q, { desde: '2026-02-16', hasta: '2026-02-28' }), false, 'la siguiente es otra quincena')
  assert.equal(bloquePerteneceA(q, { desde: '2026-01-30', hasta: '2026-02-14' }), false, 'empieza en la anterior: es la anterior')
  assert.equal(bloquePerteneceA({ desde: '2026-05-16', hasta: '2026-05-31' }, { desde: '2026-05-18', hasta: '2026-05-30' }), true)
  assert.equal(bloquePerteneceA({ desde: '2026-05-01', hasta: '2026-05-15' }, { desde: '2026-05-04', hasta: '2026-05-16' }), true,
    'el bloque 04/05..16/05 se pasa un día del calendario y sigue siendo la 1ª de mayo (la contención lo perdía)')
  assert.equal(bloquePerteneceA({ desde: new Date('2026-03-01T03:00:00Z'), hasta: new Date('2026-03-15T03:00:00Z') },
    { desde: '2026-03-02', hasta: '2026-03-14' }), true, 'las fechas de pg llegan como Date')
})

test('el concepto nombra a la persona por CUIL (sin guiones) o por dos palabras del nombre, sin tildes', () => {
  const p = { cuil: '20-35923266-8', nombre_completo: 'MALDONADO BATISTA EMILIANO MIGUEL' }
  assert.equal(conceptoNombraA('Transferencia inmediata - A emiliano miguel maldona / - var / 20359232668', p), true)
  assert.equal(conceptoNombraA('Transferencia inmediata - A emiliano miguel maldona / - var', p), true, 'por nombre')
  assert.equal(conceptoNombraA('Transferencia inmediata - A cesar hector machuca / - var / 20259382735', p), false)
  assert.equal(conceptoNombraA('Pago haberes - 260603507', p), false)
  assert.equal(conceptoNombraA('A josé pérez', { cuil: null, nombre_completo: 'PEREZ JOSE' }), true, 'las tildes no separan')
})

const linea = (nombre, cuil, adelanto) => ({ linea_id: nombre, persona_id: nombre, nombre_completo: nombre, cuil, planilla_adelanto: adelanto })
const mov = (id, importe, concepto) => ({ id, fecha: '2026-06-03', importe: -importe, concepto })

test('FUERTE: una transferencia con el CUIL de la persona por su adelanto (±1 %)', () => {
  const r = aparearAdelantos([linea('SOSA RAUL', '20-11111111-1', 60000)], [
    mov(1, 60500, 'Transferencia inmediata - A raul sosa / - var / 20111111111'),
  ])
  assert.equal(r.apareos[0].tipo, 'fuerte')
  assert.equal(r.veredicto, 'si')
})

test('un importe que cuadra pero SIN nombre y fuera de un lote de haberes no prueba nada', () => {
  const r = aparearAdelantos([linea('SOSA RAUL', '20-11111111-1', 60000)], [
    mov(1, 60000, 'Transferencia inmediata - A cesar hector machuca / - var / 20259382735'),
    mov(2, 60000, 'Cheque debitado'),
  ])
  assert.equal(r.apareos[0].tipo, 'ninguno')
  assert.equal(r.veredicto, 'no')
})

test('DÉBIL: una línea de un lote de haberes por el importe exacto, una sola; dos iguales es ambiguo', () => {
  const r = aparearAdelantos([linea('A', null, 200000)], [mov(1, 200000, 'Pago haberes - 260915507 260915507')])
  assert.equal(r.apareos[0].tipo, 'debil')
  assert.equal(r.veredicto, 'si')
  const r2 = aparearAdelantos([linea('A', null, 200000)], [
    mov(1, 200000, 'Pago haberes - 260915507 260915507'), mov(2, 200000, 'Pago haberes - 260915507 260915507'),
  ])
  assert.equal(r2.apareos[0].tipo, 'ambiguo')
  assert.equal(r2.veredicto, 'no')
})

test('el veredicto de la quincena es «sí» sólo con TODAS las personas apareadas; «parcial» con alguna; «no» sin ninguna', () => {
  const lineas = [linea('A', '20-11111111-1', 60000), linea('B', '20-22222222-2', 178644), linea('C', '20-33333333-3', 60000)]
  const soloA = [mov(1, 60000, 'Transferencia inmediata - A a / - var / 20111111111')]
  assert.equal(aparearAdelantos(lineas, soloA).veredicto, 'parcial')
  assert.equal(aparearAdelantos(lineas, [mov(1, 1360866, 'Pago haberes - 260603507 260603507')]).veredicto, 'no')
  const todos = [
    mov(1, 60000, 'Transferencia inmediata - A a / - var / 20111111111'),
    mov(2, 178644, 'Transferencia inmediata - A b / - var / 20222222222'),
    mov(3, 60000, 'Transferencia inmediata - A c / - var / 20333333333'),
  ]
  assert.equal(aparearAdelantos(lineas, todos).veredicto, 'si')
  assert.equal(aparearAdelantos([], todos).veredicto, 'no', 'sin líneas no hay nada que afirmar')
})

test('el mismo giro no paga a dos personas', () => {
  const r = aparearAdelantos([linea('A', null, 200000), linea('B', null, 200000)], [mov(1, 200000, 'Pago haberes - 1')])
  assert.deepEqual(r.apareos.map((a) => a.tipo), ['debil', 'ninguno'])
  assert.equal(r.veredicto, 'parcial')
})

test('lo que se escribe: el adelanto pasa a ya_transferido_manual y adelanto_manual queda en 0 (escrito, no vacío)', () => {
  assert.deepEqual(valoresDelEscenarioA({ planilla_adelanto: 178644 }), { ya_transferido_manual: 178644, adelanto_manual: 0 })
})

test('una línea pagada o escrita a mano no se toca', () => {
  assert.equal(lineaBloqueada({ pagada_en: null, ya_transferido_manual: null, adelanto_manual: null }), false)
  assert.equal(lineaBloqueada({ pagada_en: '2026-09-16', ya_transferido_manual: null, adelanto_manual: null }), true)
  assert.equal(lineaBloqueada({ pagada_en: null, ya_transferido_manual: 0, adelanto_manual: null }), true, 'un 0 escrito es un override')
})

test('la ventana de pago arranca en el último día del BLOQUE (no de la quincena calendario) y dura ocho días', () => {
  assert.deepEqual(ventanaDePago({ hasta: '2026-05-31', bloque: { hasta: '2026-05-30' } }), { desde: '2026-05-30', hasta: '2026-06-07' })
  assert.deepEqual(ventanaDePago({ hasta: '2026-06-30' }), { desde: '2026-06-30', hasta: '2026-07-08' })
})
