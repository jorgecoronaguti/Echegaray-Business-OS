// LAS HH DEL CRM SON LAS DE JORNALES (dueño, 13/09/2026).
//
// ═══ QUÉ DEFECTOS ATRAPA ═══
//
//  1 · QUE UNA FILA `web:*` SUME HH, PERSONAS O MUEVA EL INICIO. Es el defecto medido en Quattropani:
//      114 h y cinco personas de la app que la planilla no tiene.
//  2 · QUE LO DE LA APP SE BORRE EN SILENCIO. Tiene que salir aparte, con persona y días.
//  3 · QUE UNA OBRA SÓLO CON FILAS DE LA APP DIGA «0 h». Es `null`.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { armarSinRespaldo, fraseSinRespaldo, hhDeObraCRM, type FilaHH } from './hhDePlanilla.ts'

const f = (o: Partial<FilaHH>): FilaHH => ({
  personaId: 'quiroga', nombre: 'QUIROGA SEBASTIAN', fecha: '2026-08-17', horas: 9, tipoHora: 'normal',
  fuente: 'sheet:jornales', ...o,
})

// QUATTROPANI COMO ESTÁ EN LA BASE (recorte): dos personas de la planilla y cuatro cargas de la app.
const QUATTROPANI: FilaHH[] = [
  f({}),
  f({ personaId: 'reta', nombre: 'RETA RAMON', fecha: '2026-08-18', horas: 8 }),
  f({ fecha: '2026-09-10', horas: 9, tipoHora: 'extra_50' }),
  f({ personaId: 'maldonado', nombre: 'MALDONADO BATISTA', fecha: '2026-09-01', horas: 9, fuente: 'web:asistencia-obra' }),
  f({ personaId: 'maldonado', nombre: 'MALDONADO BATISTA', fecha: '2026-09-02', horas: 9, fuente: 'web:asistencia-obra' }),
  f({ personaId: 'reta', nombre: 'RETA RAMON', fecha: '2026-09-11', horas: 8, fuente: 'web:presencia-defecto' }),
  f({ personaId: 'aguero', nombre: 'AGUERO CRISTIAN', fecha: '2026-08-16', horas: 2, fuente: 'web:obra' }),
  // UNA LICENCIA DE LA PLANILLA NO ES TRABAJO: no suma aunque venga de JORNALES.
  f({ fecha: '2026-08-20', horas: 9, tipoHora: 'licencia' }),
]

test('LA APP NO SUMA HH, NI PERSONAS, NI MUEVE EL INICIO', () => {
  const r = hhDeObraCRM(QUATTROPANI)
  assert.equal(r.hh, 26)
  assert.equal(r.personas, 2, 'las personas son las de la planilla')
  // Agüero cargó el 16/08 desde la app: el inicio sigue siendo el primer día de la planilla.
  assert.equal(r.inicio, '2026-08-17')
  assert.equal(r.ultima, '2026-09-10', 'la presencia por defecto del 11/09 no es la última carga')
})

test('LO DE LA APP NO SE BORRA: sale aparte, con persona y días', () => {
  const r = hhDeObraCRM(QUATTROPANI)
  assert.deepEqual(r.sinRespaldo.map((s) => [s.nombre, s.horas, s.dias]), [
    ['MALDONADO BATISTA', 18, ['2026-09-01', '2026-09-02']],
    ['RETA RAMON', 8, ['2026-09-11']],
    ['AGUERO CRISTIAN', 2, ['2026-08-16']],
  ])
  assert.equal(fraseSinRespaldo(r.sinRespaldo),
    '28 h cargadas en la app sin respaldo en JORNALES (MALDONADO BATISTA 18 h · 01/09, 02/09; '
    + 'RETA RAMON 8 h · 11/09; AGUERO CRISTIAN 2 h · 16/08)')
})

test('UNA OBRA SÓLO CON CARGAS DE LA APP NO DICE 0 h', () => {
  const r = hhDeObraCRM([f({ fuente: 'web:presencia-defecto' })])
  assert.equal(r.hh, null)
  assert.equal(r.personas, 0)
  assert.equal(r.inicio, null)
  assert.equal(r.sinRespaldo.length, 1)
})

test('SIN NADA AFUERA NO HAY FRASE: el control puede decir que no', () => {
  assert.equal(fraseSinRespaldo(hhDeObraCRM([f({})]).sinRespaldo), null)
})

test('lo que viaja de SQL se convierte, y un numeric como texto sigue siendo número', () => {
  assert.deepEqual(armarSinRespaldo([
    { persona_id: 'm', nombre: 'MALDONADO', horas: '80', dias: ['2026-09-02', '2026-09-01'] },
    { persona_id: 'x', nombre: 'X', horas: 0, dias: [] },
  ]), [{ personaId: 'm', nombre: 'MALDONADO', horas: 80, dias: ['2026-09-01', '2026-09-02'] }])
  assert.deepEqual(armarSinRespaldo(null), [])
})
