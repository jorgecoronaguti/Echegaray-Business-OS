// M05 · LAS REGLAS DEL PEDIDO DE CORRECCIÓN, Y LOS DOS AGUJEROS QUE TAPAN.
//
//   1. EL DÍA EN CURSO NO SE CORRIGE. Toda la pantalla de asistencia está construida sobre que un
//      día abierto NO publica un total inventado. Un pedido de corrección para hoy sería justo la
//      puerta de atrás a eso, y encima escrita por el propio interesado: «salí a las 18:20» a las
//      dos de la tarde, aprobado a ojo, y las horas quedan fabricadas.
//
//   2. LA SALIDA VA DESPUÉS DE LA ENTRADA. Sin la regla, `mi_asistencia_dia` calcula
//      `salida - entrada` en negativo y el total del mes se ACHICA sin un solo error a la vista.
//      Un número imposible en la base es defecto propio, no un dato raro.
//
// Y la tercera, de pantalla: un día con pedido pendiente deja de ofrecerse. Si se ofreciera, con
// mala señal se piden tres veces lo mismo y Administración resuelve tres pedidos idénticos.
//
// Si alguien saca cualquiera de las tres, uno de estos bloques se pone rojo.

import test from 'node:test'
import assert from 'node:assert/strict'
import { diaAPedirCorreccion, horaCorta, pendienteDe, revisarPedido } from './correccion.ts'
import type { DiaDeAsistencia } from '../types/index.ts'

const dia = (p: Partial<DiaDeAsistencia>): DiaDeAsistencia => ({
  fecha: '2026-08-15', entrada: null, salida: null, incidencias: 0, motivo: null,
  estado: 'falta_salida', minutos: null, obra_id: null, ...p,
})

const BASE = { fecha: '2026-08-15', hora: '18:20', motivo: 'Me quedé sin batería', hoy: '2026-08-21' }

test('un pedido normal pasa', () => {
  assert.deepEqual(revisarPedido(BASE), { ok: true })
})

test('NO se puede pedir corrección de hoy ni de un día futuro', () => {
  for (const fecha of ['2026-08-21', '2026-08-22', '2027-01-01']) {
    const r = revisarPedido({ ...BASE, fecha })
    assert.equal(r.ok, false, `${fecha}: se dejó corregir un día que todavía no terminó`)
  }
})

test('la salida propuesta NO puede ser anterior o igual a la entrada de ese día', () => {
  // La entrada de ese día, como la devuelve Postgres. `minutosDeMomento` la lee con el reloj local,
  // igual que `hora()` — que es lo que la pantalla le muestra a la persona.
  const conEntrada = dia({ entrada: '2026-08-15T08:00:00' })

  const antes = revisarPedido({ ...BASE, hora: '07:30', dia: conEntrada })
  assert.equal(antes.ok, false, 'una salida ANTES de la entrada produce una duración negativa')

  const igual = revisarPedido({ ...BASE, hora: '08:00', dia: conEntrada })
  assert.equal(igual.ok, false, 'una jornada de cero minutos no es una corrección, es un error')

  assert.deepEqual(revisarPedido({ ...BASE, hora: '17:45', dia: conEntrada }), { ok: true })
})

test('sin entrada registrada no se inventa una comparación', () => {
  // El día sin entrada no es `falta_salida` y la pantalla no lo ofrece, pero si la fila llegara sin
  // entrada la regla no puede inventar una hora contra la cual comparar: deja pasar y decide la
  // persona que aprueba.
  assert.deepEqual(revisarPedido({ ...BASE, hora: '06:00', dia: dia({ entrada: null }) }), { ok: true })
})

test('el motivo tiene que decir algo', () => {
  assert.equal(revisarPedido({ ...BASE, motivo: '  ' }).ok, false)
  assert.equal(revisarPedido({ ...BASE, motivo: 'ok' }).ok, false)
  assert.equal(revisarPedido({ ...BASE, motivo: 'x'.repeat(301) }).ok, false)
})

test('la hora tiene que ser una hora', () => {
  for (const hora of ['', '25:00', '18:70', '1820', 'tarde', '8:5']) {
    assert.equal(revisarPedido({ ...BASE, hora }).ok, false, `«${hora}» pasó como hora de salida`)
  }
})

test('se ofrece UN día: el más reciente sin salida', () => {
  const dias = [
    dia({ fecha: '2026-08-18', estado: 'falta_salida' }),
    dia({ fecha: '2026-08-15', estado: 'falta_salida' }),
    dia({ fecha: '2026-08-19', estado: 'completo', minutos: 480 }),
  ]
  assert.equal(diaAPedirCorreccion(dias, [])?.fecha, '2026-08-18')
})

test('un día con pedido PENDIENTE deja de ofrecerse; uno RECHAZADO vuelve', () => {
  const dias = [dia({ fecha: '2026-08-18' }), dia({ fecha: '2026-08-15' })]

  const conPendiente = diaAPedirCorreccion(dias, [{ fecha: '2026-08-18', estado: 'pendiente' }])
  assert.equal(conPendiente?.fecha, '2026-08-15', 'se volvió a ofrecer un día que ya está en la bandeja')

  const conRechazado = diaAPedirCorreccion(dias, [{ fecha: '2026-08-18', estado: 'rechazada' }])
  assert.equal(conRechazado?.fecha, '2026-08-18', 'un rechazo es «así no», no «nunca más»')

  const conAprobada = diaAPedirCorreccion(dias, [{ fecha: '2026-08-18', estado: 'aprobada' }])
  assert.equal(conAprobada?.fecha, '2026-08-15')
})

test('sin ningún día abierto no se ofrece nada', () => {
  assert.equal(diaAPedirCorreccion([dia({ estado: 'completo', minutos: 480 })], []), null)
  assert.equal(diaAPedirCorreccion([], []), null)
})

test('el chip de pendiente es del día, no del primero de la lista', () => {
  const cs = [
    { fecha: '2026-08-15', estado: 'pendiente' },
    { fecha: '2026-08-12', estado: 'rechazada' },
  ]
  assert.equal(pendienteDe(cs, '2026-08-15')?.estado, 'pendiente')
  assert.equal(pendienteDe(cs, '2026-08-12'), null, 'un pedido rechazado se mostraba como pendiente')
  assert.equal(pendienteDe(cs, '2026-08-01'), null)
})

test('la hora de Postgres se muestra sin segundos', () => {
  assert.equal(horaCorta('18:20:00'), '18:20')
  assert.equal(horaCorta(null), null)
  assert.equal(horaCorta('vacío'), null)
})
