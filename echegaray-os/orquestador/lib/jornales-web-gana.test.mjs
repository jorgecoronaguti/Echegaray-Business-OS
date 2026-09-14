// LO EDITADO A MANO EN LA WEB GANA SIEMPRE — dueño, 14/09/2026: «web gana siempre».
//
// El defecto: una celda de la planilla corregida en la web conserva `fuente_legacy = 'sheet:jornales'`
// (el update es sobre el id) y el importador, que corre cada hora, la volvía a escribir con el valor
// de la planilla. Lo que distingue a esa fila es el autor que el trigger deja en `actualizado_por`.
//
// LA MUTACIÓN QUE PONE ESTO ROJO: ignorar `actualizado_por`, proteger la fila y no el día, o proteger
// también la jornada automática / la carga del jefe (que la planilla sigue pisando, 11/09/2026).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  laTocoUnaPersona, separarLoQueGanaLaWeb, pisarLoDeLaWeb, SQL_UPSERT, SQL_MOVER, SQL_PISAR_WEB, FUENTE,
} from './jornales-a-registros-hh.mjs'

const dePlanilla = (extra = {}) => ({
  persona_id: 'p1', fecha: '2026-09-08', obra_canonica_id: 'obra-a', horas: 9, tipo_hora: 'normal', ...extra,
})
const enLaBase = (extra = {}) => ({
  id: 'r1', persona_id: 'p1', fecha: '2026-09-08', obra_canonica_id: 'obra-a', horas: 7,
  tipo_hora: 'normal', fuente_legacy: FUENTE, actualizado_por: null, ...extra,
})

test('UNA FILA DE LA PLANILLA CORREGIDA EN LA WEB (con autor) NO SE VUELVE A ESCRIBIR', () => {
  const r = separarLoQueGanaLaWeb([dePlanilla()], [enLaBase({ actualizado_por: 'u-admin' })])
  assert.equal(r.filas.length, 0)
  assert.equal(r.existentes.length, 0)
  assert.equal(r.ganaLaWeb.length, 1)
  assert.equal(r.ganaLaWeb[0].dia, 'p1|2026-09-08')
})

test('SIN AUTOR, LA FILA DE LA PLANILLA SIGUE SIENDO DE LA PLANILLA', () => {
  const r = separarLoQueGanaLaWeb([dePlanilla()], [enLaBase()])
  assert.equal(r.filas.length, 1)
  assert.equal(r.ganaLaWeb.length, 0)
})

test('SE PROTEGE EL DÍA ENTERO: la extra de la planilla no se suma al lado de la normal corregida', () => {
  const r = separarLoQueGanaLaWeb(
    [dePlanilla(), dePlanilla({ tipo_hora: 'extra_50', horas: 2 }), dePlanilla({ fecha: '2026-09-09' })],
    [enLaBase({ actualizado_por: 'u-admin' })],
  )
  assert.deepEqual(r.filas.map((f) => f.fecha), ['2026-09-09'])
  assert.equal(r.ganaLaWeb[0].deLaPlanilla.length, 2)
})

test('LAS MARCAS DE CARGA A MANO GANAN AUNQUE NO TENGAN AUTOR (un insert no lo deja)', () => {
  for (const m of ['web:grilla-quincena', 'web:correccion-horas', 'web:correccion-ausencia', 'web:ausencia-de-la-persona']) {
    assert.equal(laTocoUnaPersona({ fuente_legacy: m }), true, m)
  }
})

test('LA JORNADA AUTOMÁTICA Y LA CARGA DEL JEFE, SIN TOCAR, LA SIGUE PISANDO LA PLANILLA', () => {
  for (const m of ['web:presencia-defecto', 'web:asistencia-obra']) {
    assert.equal(laTocoUnaPersona({ fuente_legacy: m }), false, m)
    const base = [enLaBase({ fuente_legacy: m })]
    const r = separarLoQueGanaLaWeb([dePlanilla()], base)
    assert.equal(pisarLoDeLaWeb(r.filas, r.existentes, { hoy: '2026-09-14' }).pisar.length, 1, m)
  }
  // …pero si alguien la corrigió después, tiene autor y gana.
  assert.equal(laTocoUnaPersona({ fuente_legacy: 'web:presencia-defecto', actualizado_por: 'u' }), true)
})

test('LAS TRES ESCRITURAS TIENEN LA GUARDA EN SQL (segunda cerradura contra la carrera)', () => {
  for (const [nombre, sql] of Object.entries({ SQL_UPSERT, SQL_MOVER, SQL_PISAR_WEB })) {
    assert.match(sql, /actualizado_por is null/, nombre)
    assert.doesNotMatch(sql, /`/, `${nombre} sin backticks sueltos`)
  }
})
