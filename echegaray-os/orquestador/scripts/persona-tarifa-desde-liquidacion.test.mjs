// LO QUE ESTOS TESTS ATRAPAN — cada uno nombra el defecto que se pone rojo si se revierte.
//
// El núcleo es puro a propósito: reconstruye OCHO MESES de tarifas con las que después se valoriza
// la mano de obra de trece obras. Un error acá no se ve — da un número plausible.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { origenDeTramo, planDeTramos, tramosDeTarifa } from './persona-tarifa-desde-liquidacion.mjs'

const q = (desde, valor_hora) => ({ desde, valor_hora })

test('una tarifa que no cambia es UN tramo, no uno por quincena', () => {
  const { tramos } = tramosDeTarifa([
    q('2026-01-01', 4950), q('2026-01-16', 4950), q('2026-02-01', 4950),
  ])
  assert.deepEqual(tramos, [{ desde: '2026-01-01', valor_hora: 4950 }])
})

test('cada cambio abre un tramo con la fecha de SU quincena', () => {
  const { tramos } = tramosDeTarifa([
    q('2026-01-01', 4000), q('2026-01-16', 4000), q('2026-02-01', 4500), q('2026-02-16', 4500),
  ])
  assert.deepEqual(tramos, [
    { desde: '2026-01-01', valor_hora: 4000 },
    { desde: '2026-02-01', valor_hora: 4500 },
  ])
})

// ═══ EL DEFECTO CARO: COLAPSAR POR VALOR EN VEZ DE POR CAMBIO CONSECUTIVO ═══
//
// Un `distinct on (valor_hora)` —o un Set de valores ya vistos— devolvería DOS tramos acá y el
// segundo 5.000 heredaría el `desde` de enero. Consecuencia concreta: la hora de agosto se
// valorizaría con el tramo de enero, el de abril quedaría tapado, y el número saldría plausible.
test('volver a un valor ya cobrado abre un tramo NUEVO', () => {
  const { tramos } = tramosDeTarifa([
    q('2026-01-01', 5000), q('2026-02-01', 5500), q('2026-03-01', 5000),
  ])
  assert.equal(tramos.length, 3)
  assert.deepEqual(tramos.map((t) => t.desde), ['2026-01-01', '2026-02-01', '2026-03-01'])
  assert.deepEqual(tramos.map((t) => t.valor_hora), [5000, 5500, 5000])
})

// `persona_tarifa_positiva` es un CHECK de la base: un cero tiraría la transacción entera y se
// llevaría las tarifas de todos los demás. Pero el motivo de fondo es otro: una tarifa en cero
// liquida a esa persona en $ 0 con la misma cara que un importe correcto.
test('un valor no positivo o nulo no abre tramo, y se informa aparte', () => {
  const r = tramosDeTarifa([q('2026-01-01', 0), q('2026-01-16', null), q('2026-02-01', 4950)])
  assert.deepEqual(r.tramos, [{ desde: '2026-02-01', valor_hora: 4950 }])
  assert.deepEqual(r.sinValor, ['2026-01-01', '2026-01-16'])
})

// Y NO CIERRA EL TRAMO ANTERIOR: un hueco en el medio no es un cambio de tarifa. Si lo cerrara,
// la quincena siguiente abriría un tramo repetido con el mismo valor.
test('un hueco en el medio no parte el tramo en dos', () => {
  const { tramos } = tramosDeTarifa([q('2026-01-01', 4950), q('2026-01-16', null), q('2026-02-01', 4950)])
  assert.deepEqual(tramos, [{ desde: '2026-01-01', valor_hora: 4950 }])
})

test('sin quincenas no hay tramos — no se inventa una tarifa de arranque', () => {
  assert.deepEqual(tramosDeTarifa([]), { tramos: [], sinValor: [] })
})

test('el origen de cada fila nombra la quincena de la que salió', () => {
  assert.equal(origenDeTramo('2026-03-16'), 'liquidacion_linea sellada quincena 2026-03-16')
})

// ═══ LAS 19 FILAS DEL 01/09 NO SE PISAN ═══
//
// `persona_tarifa_una_por_dia` es UNIQUE (persona_id, desde) y `update` está revocado: un insert
// sobre un par existente tira y se lleva la transacción. Si este filtro se revierte, la corrida
// falla entera — o peor, si alguien lo «arregla» con un upsert, reliquida una quincena cerrada.
test('un tramo cuyo (persona, desde) ya existe se saltea, no se pisa', () => {
  const porPersona = new Map([['p1', [q('2026-01-01', 4000), q('2026-09-01', 5000)]]])
  const plan = planDeTramos(porPersona, new Set(['p1|2026-09-01']), new Map([['p1', 'Pérez']]))
  assert.deepEqual(plan.insertar.map((f) => f.desde), ['2026-01-01'])
  assert.deepEqual(plan.salteadas.map((f) => f.desde), ['2026-09-01'])
})

test('el plan mantiene el tramo aunque su fecha coincida con otra persona', () => {
  const porPersona = new Map([
    ['p1', [q('2026-01-01', 4000)]],
    ['p2', [q('2026-01-01', 5000)]],
  ])
  const plan = planDeTramos(porPersona, new Set(['p1|2026-01-01']), new Map())
  assert.deepEqual(plan.insertar.map((f) => [f.persona_id, f.valor_hora]), [['p2', 5000]])
})

test('el informe por persona cuenta cuántos tramos son nuevos', () => {
  const porPersona = new Map([['p1', [q('2026-01-01', 4000), q('2026-02-01', 4500), q('2026-03-01', 4800)]]])
  const plan = planDeTramos(porPersona, new Set(['p1|2026-02-01']), new Map([['p1', 'Pérez']]))
  assert.equal(plan.porPersona[0].tramos.length, 3)
  assert.equal(plan.porPersona[0].nuevos, 2)
  assert.equal(plan.porPersona[0].quincenas, 3)
})
