import { test } from 'node:test'
import assert from 'node:assert/strict'
import { reglaError, borrarReglas, requestsPara } from './formato-condicional.mjs'

test('la regla de error usa ISERROR relativo a A1 y un solo argumento (sin coma es-AR)', () => {
  const r = reglaError(7, 12, 90)
  const f = r.addConditionalFormatRule.rule.booleanRule.condition.values[0].userEnteredValue
  assert.equal(f, '=ISERROR(A1)')
  assert.ok(!f.includes(','), 'sin coma: rompería en un archivo es-AR')
  assert.equal(r.addConditionalFormatRule.rule.booleanRule.condition.type, 'CUSTOM_FORMULA')
  const rng = r.addConditionalFormatRule.rule.ranges[0]
  assert.deepEqual([rng.sheetId, rng.startRowIndex, rng.startColumnIndex, rng.endColumnIndex, rng.endRowIndex], [7, 0, 0, 12, 90])
})

test('borrar reindexa: siempre el índice 0, tantas veces como reglas haya', () => {
  const d = borrarReglas(3, 5)
  assert.equal(d.length, 5)
  assert.ok(d.every((x) => x.deleteConditionalFormatRule.index === 0 && x.deleteConditionalFormatRule.sheetId === 3))
  assert.equal(borrarReglas(3, 0).length, 0)
})

test('requestsPara deja exactamente una regla: borra todas las viejas y agrega la nueva al final', () => {
  const reqs = requestsPara(9, { cols: 14, hastaFila: 80, reglasExistentes: 2 })
  assert.equal(reqs.length, 3) // 2 borrados + 1 agregado
  assert.ok(reqs.slice(0, 2).every((x) => x.deleteConditionalFormatRule))
  assert.ok(reqs[2].addConditionalFormatRule)
})
