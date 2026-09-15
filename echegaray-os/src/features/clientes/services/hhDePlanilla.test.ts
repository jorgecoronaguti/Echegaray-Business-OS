// LAS HH DE OBRA DEL CRM SON TODAS LAS HORAS TRABAJADAS DE `registros_hh` (dueño, 14/09/2026).
//
// ═══ QUÉ DEFECTOS ATRAPA ═══
//
//  1 · QUE UNA FILA TRABAJADA DE LA APP NO SUME. Es el defecto medido en Quattropani 2026: la ficha
//      daba 565 h y la tabla —y la solapa Horas— 644. `web:presencia-defecto` y `web:obra` cuentan.
//  2 · QUE UNA AUSENCIA O LICENCIA SUME HORAS, venga de donde venga.
//  3 · QUE UN DÍA EN DOS OBRAS SE CUENTE UNA SOLA VEZ: se suman, como en Horas.
//  4 · QUE UNA OBRA SIN NINGUNA HORA TRABAJADA DIGA «0 h». Es `null`.
//  5 · QUE EL JEFE DE OBRA SUME, de la app o de JORNALES, o que reaparezca como «sin respaldo» (dueño, 14/09/2026).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { armarSinRespaldo, fraseSinRespaldo, hhDeObraCRM, origenesHH, type FilaHH } from './hhDePlanilla.ts'

const f = (o: Partial<FilaHH>): FilaHH => ({
  personaId: 'quiroga', nombre: 'QUIROGA SEBASTIAN', fecha: '2026-08-17', horas: 9, tipoHora: 'normal',
  fuente: 'sheet:jornales', ...o,
})

// QUATTROPANI COMO ESTÁ EN LA BASE (recorte): planilla, jefe, presencia completada por la app y web:obra.
const QUATTROPANI: FilaHH[] = [
  f({}),
  f({ personaId: 'reta', nombre: 'RETA RAMON', fecha: '2026-08-18', horas: 8 }),
  f({ fecha: '2026-09-10', horas: 9, tipoHora: 'extra_50' }),
  f({ personaId: 'maldonado', nombre: 'MALDONADO BATISTA', fecha: '2026-09-01', horas: 9, fuente: 'web:asistencia-obra', esJefe: true }),
  f({ personaId: 'reta', nombre: 'RETA RAMON', fecha: '2026-09-11', horas: 8, fuente: 'web:presencia-defecto' }),
  f({ personaId: 'aguero', nombre: 'AGUERO CRISTIAN', fecha: '2026-08-16', horas: 2, fuente: 'web:obra' }),
  // UNA LICENCIA NO ES TRABAJO: no suma aunque venga de JORNALES.
  f({ fecha: '2026-08-20', horas: 9, tipoHora: 'licencia' }),
]

test('LA PRESENCIA COMPLETADA POR LA APP Y web:obra SUMAN horas, personas, inicio y última carga', () => {
  const r = hhDeObraCRM(QUATTROPANI)
  assert.equal(r.hh, 36, '26 de JORNALES + 8 de presencia-defecto + 2 de web:obra; el jefe no suma')
  assert.equal(r.personas, 3)
  assert.equal(r.inicio, '2026-08-16', 'Agüero cargó el 16/08 desde la app: ése es el primer día')
  assert.equal(r.ultima, '2026-09-11', 'la presencia completada del 11/09 es la última carga')
  assert.deepEqual(r.sinRespaldo, [], 'ninguna hora trabajada queda afuera')
  assert.equal(fraseSinRespaldo(r.sinRespaldo), null)
})

test('cada fuente de la app, por separado, cuenta; el jefe de obra no', () => {
  assert.deepEqual(origenesHH([
    f({ fuente: 'web:presencia-defecto' }),
    f({ fuente: 'web:obra' }),
    f({ fuente: 'web:correccion-horas', tipoHora: 'extra_100' }),
    f({ fuente: 'web:asistencia-obra', esJefe: false }),
    f({ fuente: 'web:asistencia-obra', esJefe: true }),
    f({ fuente: 'JORNALES' }),
  ]), ['app', 'app', 'app', 'app', null, 'app'])
  assert.equal(hhDeObraCRM([f({ fuente: 'web:presencia-defecto', horas: 8 })]).hh, 8)
})

test('UNA AUSENCIA O UNA LICENCIA NO SUMA, de la app ni de la planilla', () => {
  const filas = [
    f({ fuente: 'web:presencia-defecto', tipoHora: 'ausencia', horas: 8 }),
    f({ fuente: 'web:ausencia-de-la-persona', tipoHora: 'licencia', horas: 8 }),
    f({ fuente: 'web:asistencia-obra', tipoHora: 'licencia', horas: 8, esJefe: true }),
    f({ tipoHora: 'ausencia', horas: 0 }),
  ]
  // Las de JORNALES viajan (marcan la celda del desglose); las de la app no están en la vista.
  assert.deepEqual(origenesHH(filas), [null, null, null, 'jornales'])
  const r = hhDeObraCRM(filas)
  assert.equal(r.hh, null, 'sin ninguna hora trabajada no hay «0 h»')
  assert.equal(r.personas, 0)
  assert.equal(r.inicio, null)
})

test('DOS OBRAS EL MISMO DÍA SE SUMAN, como en Horas', () => {
  const r = hhDeObraCRM([
    f({ personaId: 'reta', fecha: '2026-09-11', horas: 4, fuente: 'web:obra' }),
    f({ personaId: 'reta', fecha: '2026-09-11', horas: 4, fuente: 'web:presencia-defecto' }),
  ])
  assert.equal(r.hh, 8)
  assert.equal(r.personas, 1)
})

test('lo que viaja de SQL se convierte, y un numeric como texto sigue siendo número', () => {
  assert.deepEqual(armarSinRespaldo([
    { persona_id: 'm', nombre: 'MALDONADO', horas: '80', dias: ['2026-09-02', '2026-09-01'] },
    { persona_id: 'x', nombre: 'X', horas: 0, dias: [] },
  ]), [{ personaId: 'm', nombre: 'MALDONADO', horas: 80, dias: ['2026-09-01', '2026-09-02'] }])
  assert.deepEqual(armarSinRespaldo(null), [])
})

test('EL JEFE DE OBRA NO SUMA NI DE JORNALES, y no aparece como sin respaldo', () => {
  const r = hhDeObraCRM([
    f({ personaId: 'nievas', nombre: 'NIEVAS VILLEGAS', horas: 10, esJefe: true }),
    f({ personaId: 'nievas', nombre: 'NIEVAS VILLEGAS', fecha: '2026-09-02', horas: 9, fuente: 'web:asistencia-obra', esJefe: true }),
    f({ personaId: 'reta', horas: 8 }),
  ])
  assert.equal(r.hh, 8, 'sólo el obrero')
  assert.equal(r.personas, 1)
  assert.deepEqual(r.sinRespaldo, [], 'el jefe no cuenta por decisión, no por falta de planilla')
})
