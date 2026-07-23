import test from 'node:test'
import assert from 'node:assert/strict'
import { auditarPatron, seccion, sub, total, ES_SECCION_NUM } from './patron-pestana.mjs'

/** Una pestaña que cumple la gramática entera, para usar de base en cada caso. */
const buena = () => [
  ['Cargas sociales'],
  ['Qué se declara, qué se paga y qué va a salir · fuente: F931 del Drive · al 23/07/2026'],
  [],
  ['LA POSICIÓN', 'Monto', 'Origen'],
  [total('Deuda previsional en planes'), 7958394, 'Compras'],
  [sub('vence este mes'), 473767, 'Compras'],
  [],
  [seccion(1, 'Declarado en la DDJJ F931 — ¿cuánto generó la nómina?'), '', ''],
  ['Concepto', 'Monto', 'Origen'],
  ['Aportes Seguridad Social', 981497, 'F931 de enero'],
  [total('Total declarado'), 981497, ''],
  [],
  [seccion(2, 'Pagado — ¿cuánto salió de la caja?'), '', ''],
  ['Concepto', 'Monto', 'Origen'],
  ['F931', 500000, 'Compras'],
]

test('una pestaña que cumple la gramática no tiene hallazgos', () => {
  assert.deepEqual(auditarPatron(buena()), [])
})

test('los helpers producen exactamente lo que las reglas reconocen', () => {
  const m = seccion(3, 'planes de pago').match(ES_SECCION_NUM)
  assert.equal(m[1], '3')
  assert.equal(m[2], 'PLANES DE PAGO')
  assert.equal(sub('vence'), '   · vence')
  assert.equal(total('Total'), '⇒ Total')
})

test('exige título en oración y subtítulo con fuente y fecha', () => {
  const f = buena(); f[0] = ['CARGAS SOCIALES']; f[1] = []
  const r = auditarPatron(f).map((x) => x.regla)
  assert.ok(r.includes('titulo-versalita'))
  assert.ok(r.includes('sin-subtitulo'))
})

test('detecta una sección salteada y una repetida', () => {
  const f = buena()
  f[12][0] = seccion(4, 'Pagado — ¿cuánto salió de la caja?')
  const r = auditarPatron(f)
  assert.ok(r.some((x) => x.regla === 'seccion-desordenada' && x.fila === 13))
  f[12][0] = seccion(2, 'Declarado en la DDJJ F931 — ¿cuánto generó la nómina?')
  assert.ok(auditarPatron(f).some((x) => x.regla === 'seccion-repetida'))
})

test('un bloque en versalita sin número, después del hero, es un bloque suelto', () => {
  const f = buena()
  f.push(['LO QUE SALE DE LA CAJA — no es el devengado del mes'])
  const r = auditarPatron(f)
  assert.ok(r.some((x) => x.regla === 'bloque-sin-numero'))
  // Pero el hero (antes de la sección 1) es la excepción: no se marca.
  assert.ok(!r.some((x) => x.regla === 'bloque-sin-numero' && x.fila === 4))
})

test('varios anchos de grilla en la misma pestaña es el defecto "descuadrado"', () => {
  const f = buena()
  f.push([], [seccion(3, 'SAC y vacaciones')], ['Concepto', 'ene', 'feb', 'mar', 'abr', 'Total'],
    [], [seccion(4, 'Proyección')], ['Concepto', 'jul', 'ago', 'sep'])
  const m = auditarPatron(f).find((x) => x.regla === 'anchos-mezclados')
  assert.ok(m && /3, 4, 6/.test(m.detalle))
})

test('un #REF! o un #VALUE! vivo se reporta como rotura, no como estética', () => {
  const f = buena(); f[9][1] = '#VALUE!'
  const r = auditarPatron(f)
  assert.ok(r.some((x) => x.regla === 'error-de-formula' && x.fila === 10))
})

test('un número flotando sin rótulo en A ni en B no se entiende', () => {
  const f = buena(); f.push(['', '', 456])
  assert.ok(auditarPatron(f).some((x) => x.regla === 'fila-sin-concepto'))
  // Pero un listado agrupado rotula en B cuando el nombre lo puso la fila de grupo: eso sí se lee.
  const g = buena(); g.push(['', 'FA 0001-000123', 456])
  assert.ok(!auditarPatron(g).some((x) => x.regla === 'fila-sin-concepto'))
})

test('un ledger crudo al final es la única excepción al ancho único', () => {
  const f = buena()
  f.push([], [seccion(3, 'El registro, cheque por cheque')],
    ['Tipo', 'Nro', 'Fecha', 'Proveedor', 'Monto', 'Comp', 'Debitado', 'Unidad'])
  assert.ok(!auditarPatron(f).some((x) => x.regla === 'anchos-mezclados'))
  // Dos cuadros de anchos distintos, en cambio, sí descuadran la pestaña.
  f.push([], [seccion(4, 'Otro cuadro')], ['Concepto', 'ene', 'feb', 'mar', 'abr'])
  assert.ok(auditarPatron(f).some((x) => x.regla === 'anchos-mezclados'))
})

test('un nombre en versalita con importes al lado es un dato, no un título de bloque', () => {
  const f = buena(); f.push(['PEDRO TELLO', 1234567, 'Compras'])
  assert.ok(!auditarPatron(f).some((x) => x.regla === 'bloque-sin-numero'))
})

test('una nota larga en el medio de la grilla desparrama la fila', () => {
  const f = buena()
  f[9][1] = 'El F931 de un mes vence al mes siguiente, así que lo que sale de caja es el devengado anterior'
  assert.ok(auditarPatron(f).some((x) => x.regla === 'nota-en-el-medio' && x.fila === 10))
  // La misma nota en la ÚLTIMA columna es correcta y no se marca.
  const g = buena(); g[9][2] = 'El F931 de un mes vence al mes siguiente, así que lo que sale de caja es el devengado anterior'
  assert.ok(!auditarPatron(g).some((x) => x.regla === 'nota-en-el-medio'))
})

test('una pestaña vacía se reporta entera, sin reventar', () => {
  assert.deepEqual(auditarPatron([]), [{ fila: 0, regla: 'vacia', detalle: 'La pestaña no tiene contenido.' }])
})
