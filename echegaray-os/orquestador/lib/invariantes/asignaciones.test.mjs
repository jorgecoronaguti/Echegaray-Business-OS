import test from 'node:test'
import assert from 'node:assert/strict'
import { revisarAsignaciones, REGLAS } from './asignaciones.mjs'

const obras = [{ id: 'sf-mamposteria', estado: 'cerrada' }, { id: 'le-comedor', estado: 'activa' }]
const a = (o) => ({ id: o.id ?? 'x', persona_id: o.persona_id ?? 'p1', persona: o.persona ?? 'AGUERO CRISTIAN', obra_id: o.obra_id, desde: '2026-08-01', hasta: o.hasta ?? null, notas: o.notas ?? '' })

test('verde: una vigente por persona y sobre obra activa', () => {
  const r = revisarAsignaciones({ asignaciones: [a({ obra_id: 'le-comedor' })], obras })
  assert.deepEqual(r.hallazgos, [])
  assert.equal(r.vigentes, 1)
})

test('ROJO: vigente sobre obra cerrada — el control tiene que poder decir que no', () => {
  const r = revisarAsignaciones({ asignaciones: [a({ obra_id: 'sf-mamposteria' })], obras })
  assert.equal(r.hallazgos.length, 1)
  assert.equal(r.hallazgos[0].regla, REGLAS.VIGENTE_EN_OBRA_CERRADA)
  assert.match(r.hallazgos[0].detalle, /sf-mamposteria/)
})

test('cerrada pero con `hasta`: ya no es vigente, no es hallazgo', () => {
  const r = revisarAsignaciones({ asignaciones: [a({ obra_id: 'sf-mamposteria', hasta: '2026-08-31' })], obras })
  assert.deepEqual(r.hallazgos, [])
})

test('ROJO: dos vigentes de la misma persona', () => {
  const r = revisarAsignaciones({
    asignaciones: [a({ id: '1', obra_id: 'le-comedor' }), a({ id: '2', obra_id: 'le-comedor' })],
    obras,
  })
  assert.equal(r.hallazgos.length, 1)
  assert.equal(r.hallazgos[0].regla, REGLAS.DOS_VIGENTES)
  assert.match(r.hallazgos[0].detalle, /2 asignaciones vigentes/)
})

test('dos personas distintas con una vigente cada una: verde', () => {
  const r = revisarAsignaciones({
    asignaciones: [a({ id: '1', obra_id: 'le-comedor' }), a({ id: '2', persona_id: 'p2', obra_id: 'le-comedor' })],
    obras,
  })
  assert.deepEqual(r.hallazgos, [])
})

test('las filas de prueba no disparan nada', () => {
  const r = revisarAsignaciones({
    asignaciones: [
      a({ id: '1', obra_id: 'sf-mamposteria', notas: 'PRUEBA E2E' }),
      a({ id: '2', obra_id: 'ZZ-E2E-obra' }),
    ],
    obras: [...obras, { id: 'ZZ-E2E-obra', estado: 'cerrada' }],
  })
  assert.deepEqual(r.hallazgos, [])
  assert.equal(r.revisadas, 0)
})

test('obra desconocida en el catálogo no se declara cerrada por las dudas', () => {
  const r = revisarAsignaciones({ asignaciones: [a({ obra_id: 'obra-que-no-esta' })], obras })
  assert.deepEqual(r.hallazgos, [])
})
