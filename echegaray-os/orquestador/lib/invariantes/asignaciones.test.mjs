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

// ═══ NINGÚN TRAMO TERMINA DESPUÉS DEL CIERRE DE SU OBRA (09/09/2026) ════════════════════════════
// Desde que la obra cerrada conserva su historial anterior al cierre, hace falta el otro lado del
// control: que el historial no se pase de la fecha en que la obra terminó. Sin esta regla, un
// recorte mal hecho dejaría a alguien «en Galpón 9» una semana después de que Galpón 9 cerró.
const OBRAS_CON_FIN = [
  { id: 'le-galpon-9', estado: 'cerrada', fecha_fin: '2026-09-03' },
  { id: 'le-comedor', estado: 'activa', fecha_fin: null },
]

test('verde: el tramo termina el día del cierre', () => {
  const r = revisarAsignaciones({ asignaciones: [a({ obra_id: 'le-galpon-9', hasta: '2026-09-03' })], obras: OBRAS_CON_FIN })
  assert.deepEqual(r.hallazgos, [])
})

test('ROJO: el tramo termina después del cierre de su obra', () => {
  const r = revisarAsignaciones({ asignaciones: [a({ obra_id: 'le-galpon-9', hasta: '2026-09-08' })], obras: OBRAS_CON_FIN })
  assert.equal(r.hallazgos.length, 1)
  assert.equal(r.hallazgos[0].regla, REGLAS.TERMINA_DESPUES_DEL_CIERRE)
  assert.match(r.hallazgos[0].detalle, /2026-09-08.*cerró el 2026-09-03/)
})

test('una vigente sobre obra cerrada con fecha grita UNA vez, no dos', () => {
  const r = revisarAsignaciones({ asignaciones: [a({ obra_id: 'le-galpon-9', hasta: null })], obras: OBRAS_CON_FIN })
  assert.deepEqual(r.hallazgos.map((h) => h.regla), [REGLAS.VIGENTE_EN_OBRA_CERRADA])
})

test('obra ACTIVA con fecha de fin cargada: no es hallazgo aunque el tramo la pase', () => {
  const r = revisarAsignaciones({
    asignaciones: [a({ obra_id: 'le-comedor', hasta: '2026-12-31' })],
    obras: [{ id: 'le-comedor', estado: 'activa', fecha_fin: '2026-06-30' }],
  })
  assert.deepEqual(r.hallazgos, [])
})
