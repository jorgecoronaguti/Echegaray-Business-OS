// EL REPARTO DE HH PLAN — lo único de las acciones masivas que puede estar mal SIN QUE SE VEA.
//
// La acción contesta «cargué 12 actividades» igual si repartió bien que si repartió mal. Un reparto
// que suma 998 donde el administrador escribió 1.000 no rompe nada y no tira un error: desde ese
// momento el desvío de HH de la obra arrastra dos horas que nadie puso, y cuando alguien lo note ya
// no va a haber por dónde empezar a buscar.
//
// Se importa el `.ts` directo, como `cronograma-modelo.test.mjs`: Node le saca los tipos solo.

import test from 'node:test'
import assert from 'node:assert/strict'
import { diasDe, repartirHH } from '../../src/features/obras/services/reparto.ts'

const a = (id, inicio_plan = null, fin_plan = null) => ({ id, inicio_plan, fin_plan })

const suma = (r) => Math.round(r.asignaciones.reduce((s, x) => s + x.hh, 0) * 100) / 100

// ── LA DURACIÓN ─────────────────────────────────────────────────────────────

test('la duracion cuenta los dos extremos: del lunes al lunes es UN dia, no cero', () => {
  assert.equal(diasDe(a('x', '2026-09-01', '2026-09-01')), 1)
  assert.equal(diasDe(a('x', '2026-09-01', '2026-09-05')), 5)
})

test('sin las dos fechas no hay duracion, y no se inventa 1', () => {
  assert.equal(diasDe(a('x', '2026-09-01', null)), null)
  assert.equal(diasDe(a('x', null, '2026-09-05')), null)
  assert.equal(diasDe(a('x')), null)
})

test('una ventana invertida es un dato roto y no pesa en el reparto', () => {
  // Si esto devolviera un negativo, el peso negativo le sacaría horas a las otras y la suma seguiría
  // dando el total: el error quedaría escondido dentro de un resultado que cuadra.
  assert.equal(diasDe(a('x', '2026-09-10', '2026-09-01')), null)
})

// ── EL REPARTO PROPORCIONAL ─────────────────────────────────────────────────

test('reparte proporcional a los dias de plan', () => {
  const r = repartirHH(
    [a('A', '2026-09-01', '2026-09-05'), a('B', '2026-09-01', '2026-09-05'), a('C', '2026-09-01', '2026-09-10')],
    100, 'proporcional',
  )
  assert.equal(r.error, null)
  // 5 + 5 + 10 = 20 dias → 25 / 25 / 50.
  assert.deepEqual(r.asignaciones, [{ id: 'A', hh: 25 }, { id: 'B', hh: 25 }, { id: 'C', hh: 50 }])
})

test('LA SUMA REPARTIDA ES EXACTAMENTE EL TOTAL, aunque no sea divisible', () => {
  // 100 entre 3 partes iguales: 33,33 + 33,33 + 33,33 = 99,99. El centésimo que falta se reparte por
  // resto mayor, y sin eso la obra arranca con una hora menos de la que el administrador escribió.
  const r = repartirHH([a('A'), a('B'), a('C')], 100, 'iguales')
  assert.equal(r.error, null)
  assert.equal(suma(r), 100)
  assert.deepEqual(r.asignaciones.map((x) => x.hh), [33.34, 33.33, 33.33])
})

test('la suma cierra tambien con pesos desparejos y un total feo', () => {
  const r = repartirHH(
    [a('A', '2026-09-01', '2026-09-03'), a('B', '2026-09-01', '2026-09-09'), a('C', '2026-09-01', '2026-09-07')],
    1000.7, 'proporcional',
  )
  assert.equal(r.error, null)
  assert.equal(suma(r), 1000.7)
})

test('el reparto es determinista: la misma entrada da el mismo resultado', () => {
  const entrada = [a('A'), a('B'), a('C'), a('D'), a('E'), a('F'), a('G')]
  const uno = repartirHH(entrada, 1000, 'iguales')
  const otro = repartirHH(entrada, 1000, 'iguales')
  assert.deepEqual(uno.asignaciones, otro.asignaciones)
})

// ── LO QUE QUEDA AFUERA SE DECLARA ──────────────────────────────────────────

test('la que no tiene las dos fechas queda AFUERA del proporcional, con su motivo', () => {
  const r = repartirHH(
    [a('A', '2026-09-01', '2026-09-05'), a('B'), a('C', '2026-09-01', '2026-09-05')],
    100, 'proporcional',
  )
  assert.equal(r.error, null)
  assert.deepEqual(r.asignaciones, [{ id: 'A', hh: 50 }, { id: 'C', hh: 50 }])
  assert.equal(r.fuera.length, 1)
  assert.equal(r.fuera[0].id, 'B')
  assert.match(r.fuera[0].motivo, /sin inicio y fin/)
})

test('en partes iguales SI entran las que no tienen fechas: es el estado de una obra que arranca', () => {
  const r = repartirHH([a('A', '2026-09-01', '2026-09-05'), a('B')], 100, 'iguales')
  assert.equal(r.error, null)
  assert.deepEqual(r.asignaciones, [{ id: 'A', hh: 50 }, { id: 'B', hh: 50 }])
  assert.equal(r.fuera.length, 0)
})

test('proporcional sin NINGUNA fecha NO cae callado a partes iguales', () => {
  // Cambiar de criterio sin decirlo haría creer que se repartió por duración cuando se repartió por
  // cabeza. Se rechaza y se explica qué hacer.
  const r = repartirHH([a('A'), a('B')], 100, 'proporcional')
  assert.equal(r.asignaciones.length, 0)
  assert.match(r.error, /partes iguales/)
})

// ── NUNCA SE ESCRIBE 0 ──────────────────────────────────────────────────────

test('si a alguna le tocaria 0, se RECHAZA el reparto entero', () => {
  // 0 HH plan dice «esta actividad no lleva mano de obra». Sembrar ese cero en 344 filas es fabricar
  // un dato que nadie cargó, y después es indistinguible de uno cargado a propósito.
  const muchas = Array.from({ length: 300 }, (_, i) => a(`A${i}`))
  const r = repartirHH(muchas, 1, 'iguales')
  assert.equal(r.asignaciones.length, 0)
  assert.match(r.error, /0/)
})

test('un total de cero o negativo no reparte nada', () => {
  assert.match(repartirHH([a('A')], 0, 'iguales').error, /mayor que cero/)
  assert.match(repartirHH([a('A')], -5, 'iguales').error, /mayor que cero/)
})

test('sin actividades seleccionadas no hay reparto', () => {
  assert.match(repartirHH([], 100, 'iguales').error, /ninguna actividad/i)
})

test('ninguna asignacion sale en 0 cuando el reparto se acepta', () => {
  const r = repartirHH(Array.from({ length: 344 }, (_, i) => a(`A${i}`)), 3440, 'iguales')
  assert.equal(r.error, null)
  assert.ok(r.asignaciones.every((x) => x.hh > 0), 'ninguna puede quedar en cero')
  assert.equal(suma(r), 3440)
})
