import { test } from 'node:test'
import assert from 'node:assert/strict'
import { planDeRestauracion, SQL_RESTAURAR, MARCA_RESTAURADA } from './restaurar-hh-desde-web.mjs'

const P = 'p1'
const fila = (o = {}) => ({
  id: 'r1', persona_id: P, fecha: '2026-09-08', obra_canonica_id: 'sf-mamposteria', tipo_hora: 'normal', horas: '9.00',
  fuente_legacy: 'sheet:jornales', actualizado_por: null, ...o,
})
const presente = (obra, o = {}) => ({ persona_id: P, fecha: '2026-09-08', obra_canonica_id: obra, estado: 'presente', origen: 'declarada', motivo: null, ...o })

test('el jefe declaró presente en OTRA obra: la fila de la planilla se repone en esa obra, con sus horas', () => {
  const { restaurar, conflictos, chocan } = planDeRestauracion({ hh: [fila()], asistencia: [presente('quattropani')] })
  assert.deepEqual(restaurar.map((r) => [r.id, r.obra_web, r.obra_jornales, r.horas]), [['r1', 'quattropani', 'sf-mamposteria', 9]])
  assert.equal(conflictos.length + chocan.length, 0)
})

test('misma obra, o sin marca del día, o sin obra declarada: no hay nada que restaurar', () => {
  assert.equal(planDeRestauracion({ hh: [fila()], asistencia: [presente('sf-mamposteria')] }).restaurar.length, 0)
  assert.equal(planDeRestauracion({ hh: [fila()], asistencia: [] }).restaurar.length, 0)
  assert.equal(planDeRestauracion({ hh: [fila()], asistencia: [presente(null)] }).restaurar.length, 0)
})

test('la web dice que NO vino y la planilla trae horas: CONFLICTO listado, nunca se escribe', () => {
  const { restaurar, conflictos } = planDeRestauracion({
    hh: [fila()], asistencia: [presente('la-estrella', { estado: 'licencia', motivo: 'accidente' })],
  })
  assert.equal(restaurar.length, 0)
  assert.deepEqual(conflictos.map((c) => [c.id, c.web]), [['r1', 'licencia accidente (declarada)']])
})

test('una fila de la web, una con autor o una licencia de la planilla no se tocan', () => {
  const asistencia = [presente('quattropani')]
  assert.equal(planDeRestauracion({ hh: [fila({ fuente_legacy: 'web:asistencia-obra' })], asistencia }).restaurar.length, 0)
  assert.equal(planDeRestauracion({ hh: [fila({ actualizado_por: 'u1' })], asistencia }).restaurar.length, 0)
  assert.equal(planDeRestauracion({ hh: [fila({ tipo_hora: 'licencia' })], asistencia }).restaurar.length, 0)
})

test('si ya hay una fila de esa persona, día, tipo y obra declarada, mover chocaría con el índice único: se lista, no se mueve', () => {
  const { restaurar, chocan } = planDeRestauracion({
    hh: [fila(), fila({ id: 'r2', obra_canonica_id: 'quattropani', fuente_legacy: 'web:grilla-quincena' })],
    asistencia: [presente('quattropani')],
  })
  assert.equal(restaurar.length, 0)
  assert.deepEqual(chocan.map((c) => c.id), ['r1'])
})

test('la fecha de la base llega como Date y se compara como día', () => {
  const { restaurar } = planDeRestauracion({
    hh: [fila({ fecha: new Date('2026-09-08T00:00:00Z') })], asistencia: [presente('quattropani', { fecha: new Date('2026-09-08T00:00:00Z') })],
  })
  assert.equal(restaurar.length, 1)
})

test('el SQL sólo toca filas de la planilla sin autor, deja la marca que la web protege y escribe el autor', () => {
  assert.match(SQL_RESTAURAR, /fuente_legacy = 'sheet:jornales' and actualizado_por is null/)
  assert.match(SQL_RESTAURAR, new RegExp(`fuente_legacy = '${MARCA_RESTAURADA}'`))
  assert.match(SQL_RESTAURAR, /actualizado_por = \$3::uuid/)
  assert.doesNotMatch(SQL_RESTAURAR, /set[^;]*horas\s*=/)
})
