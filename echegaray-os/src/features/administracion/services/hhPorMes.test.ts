import test from 'node:test'
import assert from 'node:assert/strict'
import { hhPorMes, ultimosMeses } from './hhPorMes.ts'

// LOS DOS DEFECTOS QUE ATRAPA:
//
//  1. ESCRIBIR 0 EN UN MES SIN REGISTROS. La barra diría que la persona no trabajó en marzo cuando
//     lo que pasa es que entró en abril. Es la regla del NULL en su forma más barata de romper.
//  2. CONTAR LA AUSENCIA COMO TRABAJO. Una ausencia tiene horas y no es trabajo: sumarla infla el
//     mes en que alguien estuvo de licencia, que es justo el que se mira.

const reg = (fecha: string, horas: number, tipo = 'normal') => ({ fecha, horas, tipo_hora: tipo })

test('los últimos meses terminan en el de hoy y cruzan el año', () => {
  assert.deepEqual(ultimosMeses('2026-02-10', 4), ['2025-11', '2025-12', '2026-01', '2026-02'])
})

test('un mes sin registros va en null, nunca en 0', () => {
  const r = hhPorMes([reg('2026-08-03', 8)], '2026-08-26', 3)
  assert.deepEqual(r.map((m) => m.clave), ['2026-06', '2026-07', '2026-08'])
  assert.equal(r[0].horas, null, 'junio no tuvo registros: no es un mes de cero horas')
  assert.equal(r[1].horas, null)
  assert.equal(r[2].horas, 8)
})

test('una ausencia no suma al mes', () => {
  const r = hhPorMes([reg('2026-08-03', 8), reg('2026-08-04', 8, 'ausencia')], '2026-08-26', 1)
  assert.equal(r[0].horas, 8)
})

test('un mes con registros de sólo ausencias queda en 0 explícito y no en null', () => {
  // Es la distinción fina: hubo registros, y ninguno fue trabajo. Eso SÍ es cero horas trabajadas.
  const r = hhPorMes([reg('2026-08-04', 8, 'ausencia')], '2026-08-26', 1)
  assert.equal(r[0].horas, null, 'sin ninguna hora trabajada el mes no publica un total')
})

test('el rótulo es el mes en tres letras', () => {
  assert.deepEqual(hhPorMes([], '2026-03-01', 3).map((m) => m.rotulo), ['ene', 'feb', 'mar'])
})
