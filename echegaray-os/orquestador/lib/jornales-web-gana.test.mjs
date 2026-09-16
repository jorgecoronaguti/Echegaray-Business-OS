// LO EDITADO A MANO EN LA WEB GANA SIEMPRE — dueño, 14/09/2026: «web gana siempre».
//
// El defecto: una celda de la planilla corregida en la web conserva `fuente_legacy = 'sheet:jornales'`
// (el update es sobre el id) y el importador, que corre cada hora, la volvía a escribir con el valor
// de la planilla. Lo que distingue a esa fila es el autor que el trigger deja en `actualizado_por`.
//
// LA MUTACIÓN QUE PONE ESTO ROJO: ignorar `actualizado_por`, proteger la fila y no el día, o volver a
// dejar que la planilla pise la jornada automática / la carga del jefe. Desde el 16/09/2026 («dejá de
// borrarme los registros») NINGUNA fila `web:*` cede: la planilla completa, no pisa.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  laTocoUnaPersona, separarLoQueGanaLaWeb, pisarLoDeLaWeb, conflictoDeNoVino, SQL_UPSERT, SQL_MOVER, SQL_PISAR_WEB, FUENTE,
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

test('LA JORNADA AUTOMÁTICA Y LA CARGA DEL JEFE TAMBIÉN GANAN, SIN AUTOR (dueño, 16/09/2026)', () => {
  // 11–15/09: 28 filas `web:presencia-defecto` / `web:asistencia-obra` pisadas en su lugar por la
  // planilla; el dueño: «dejá de borrarme los registros en horas de app.ecsas.com.ar».
  for (const m of ['web:presencia-defecto', 'web:asistencia-obra']) {
    assert.equal(laTocoUnaPersona({ fuente_legacy: m }), true, m)
    const r = separarLoQueGanaLaWeb([dePlanilla()], [enLaBase({ fuente_legacy: m })])
    assert.equal(r.filas.length, 0, `${m}: la planilla no entra en ese día`)
    assert.equal(r.existentes.length, 0)
    assert.equal(pisarLoDeLaWeb(r.filas, r.existentes, { hoy: '2026-09-14' }).pisar.length, 0, m)
  }
})

test('LA CARGA DEL JEFE GANA AUNQUE SE VUELVA A GUARDAR; una fila de la planilla corregida a mano también', () => {
  assert.equal(laTocoUnaPersona({ fuente_legacy: 'web:asistencia-obra', actualizado_por: 'u-jefe' }), true)
  assert.equal(laTocoUnaPersona({ fuente_legacy: FUENTE, actualizado_por: 'u-admin' }), true)
})

test('LA WEB DICE QUE NO VINO Y LA PLANILLA TRAE HORAS: no se pisa, queda declarado como CONFLICTO con las dos versiones', () => {
  // Tello y Zogbe, 08/09/2026: «no vino» desde el celular, 9 h en Entrepiso según JORNALES, y el dueño
  // confirmó que SÍ trabajaron. Lo decide una persona; el importador sólo lo muestra.
  const licencia = enLaBase({ fuente_legacy: 'web:ausencia-de-la-persona', tipo_hora: 'licencia', horas: 9, obra_canonica_id: null })
  const r = separarLoQueGanaLaWeb([dePlanilla()], [licencia])
  assert.equal(r.filas.length, 0, 'la planilla no escribe')
  assert.deepEqual(r.ganaLaWeb[0].conflicto, { web: 'licencia 9h', planilla: '9h normal en obra-a' })
  // Sin contradicción no hay conflicto: la web trabajó, o la planilla también dice que no vino.
  assert.equal(separarLoQueGanaLaWeb([dePlanilla()], [enLaBase({ fuente_legacy: 'web:asistencia-obra' })]).ganaLaWeb[0].conflicto, null)
  assert.equal(conflictoDeNoVino([licencia], [dePlanilla({ tipo_hora: 'ausencia', horas: 0 })]), null)
})

test('PISAR UNA FILA DE LA WEB LE SACA EL AUTOR: si no, queda «editada a mano» para siempre', () => {
  // Auditoría 14/09/2026: el trigger conserva el autor viejo sin sesión, y las 4 filas pisadas el
  // 11/09 aparecían como correcciones humanas y congelaban su día.
  assert.match(SQL_PISAR_WEB, /actualizado_por = null/)
})

test('LAS TRES ESCRITURAS TIENEN LA GUARDA EN SQL (segunda cerradura contra la carrera)', () => {
  for (const [nombre, sql] of Object.entries({ SQL_UPSERT, SQL_MOVER, SQL_PISAR_WEB })) {
    assert.match(sql, /actualizado_por is null/, nombre)
    assert.doesNotMatch(sql, /`/, `${nombre} sin backticks sueltos`)
  }
})
