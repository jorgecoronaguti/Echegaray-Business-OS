// LA PLANILLA MANDA SOBRE LA WEB. Y SOBRE NADA MÁS.
//
// ═══ EL DEFECTO, MEDIDO EN PRODUCCIÓN EL 11/09/2026 ═══
//
// Dueño, textual: *«la carga de hs se está cruzando con lo que hace cada uno asignado a cada día»* y
// *«liquidación de hs no sirve si no me lo dejás con la carga de información que cuenta sheet
// jornales»*. `registros_hh` de la 1ª de septiembre, por día y fuente:
//
//   01 al 07/09   sheet:jornales manda
//   08/09         web:asistencia-obra 17 filas · 155 h   ← la planilla ya no entra
//   09/09         web:presencia-defecto 14 · 126 h + asistencia-obra 3 · 27 h
//   10/09         web:presencia-defecto 13 · 124 h
//   11/09         web:presencia-defecto 15 · 120 h       ← las 8 h × 15 personas de diferencia
//
// `separarConflictos` trata a CUALQUIER fila de otra fuente como intocable: desde el primer día que
// alguien tocó la app, la planilla dejó de poder corregir ese día y la pantalla mostraba la jornada
// automática por asignación.
//
// LA MUTACIÓN QUE PONE ESTO ROJO: volver a tratar `web:*` como intocable, pisar una fuente que no es
// la web, o emparejar filas por orden de llegada en vez de por `tipo_hora`.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { esDeLaWeb, pisarLoDeLaWeb, rastroDePisada, FUENTE } from './jornales-a-registros-hh.mjs'

const HOY = '2026-09-11'
/** Una fila que produjo la planilla para (p1, 08/09). */
const dePlanilla = (extra = {}) => ({
  persona_id: 'p1', fecha: '2026-09-08', obra_canonica_id: 'obra-a',
  horas: 9, tipo_hora: 'normal', notas: null, ...extra,
})
/** Una fila que ya está en la base. */
const enLaBase = (extra = {}) => ({
  id: 'r1', persona_id: 'p1', fecha: '2026-09-08', obra_canonica_id: 'obra-b',
  horas: 8.8, tipo_hora: 'normal', fuente_legacy: 'web:presencia-defecto', ...extra,
})

test('`esDeLaWeb` PREGUNTA POR EL PREFIJO, no por una lista cerrada', () => {
  // Una lista escrita a mano dejaría de conocer la marca de la pantalla siguiente EN SILENCIO: esa
  // fila pasaría a ser «de otra fuente» y la planilla dejaría de mandar sobre ella.
  for (const f of ['web:presencia-defecto', 'web:asistencia-obra', 'web:ausencia-de-la-persona',
    'web:correccion-ausencia', 'web:correccion-horas', 'web:grilla-quincena', 'web:lo-que-venga']) {
    assert.equal(esDeLaWeb(f), true, f)
  }
  for (const f of ['sheet:jornales', 'bot:comprobantes', '', null, undefined, 'webhook:x']) {
    assert.equal(esDeLaWeb(f), false, String(f))
  }
})

test('LA JORNADA AUTOMÁTICA SE PISA CON LO QUE DICE LA PLANILLA, EN SU LUGAR', () => {
  // EL CASO EXACTO DEL 11/09: `web:presencia-defecto` 8,8 h contra 9 h de la planilla.
  const { pisar, intocables } = pisarLoDeLaWeb([dePlanilla()], [enLaBase()], { hoy: HOY })
  assert.equal(intocables.length, 0)
  assert.equal(pisar.length, 1)
  assert.equal(pisar[0].id, 'r1', 'MISMO id: no se borra ni se duplica, se actualiza')
  assert.equal(pisar[0].fila.horas, 9)
  assert.equal(pisar[0].fila.obra_canonica_id, 'obra-a', 'y la obra pasa a ser la que resolvió la planilla')
  assert.equal(pisar[0].rastro, 'pisó web:presencia-defecto 8.8h el 2026-09-11')
})

test('LA CARGA DEL JEFE DESDE LA OBRA TAMBIÉN SE PISA', () => {
  // `web:asistencia-obra` son las 17 filas del 08/09. El jefe carga el día para pagar la obra; el
  // dueño carga la quincena para pagar el jornal. Cuando los dos hablan del mismo día, manda él.
  const { pisar } = pisarLoDeLaWeb(
    [dePlanilla({ horas: 12 })],
    [enLaBase({ fuente_legacy: 'web:asistencia-obra', horas: 9 })],
    { hoy: HOY },
  )
  assert.equal(pisar.length, 1)
  assert.equal(pisar[0].fila.horas, 12)
  assert.match(pisar[0].rastro, /pisó web:asistencia-obra 9h/)
})

test('UNA AUSENCIA DE LA PLANILLA PISA UNA PRESENCIA DE LA WEB, Y CAMBIA EL TIPO', () => {
  // EL DEFECTO QUE ATRAPA: pisar sólo las horas y dejar `tipo_hora = 'normal'`. El día contaría como
  // trabajado con 0 h — ni ausencia para el cierre, ni jornal para la obra.
  const { pisar } = pisarLoDeLaWeb(
    [dePlanilla({ horas: 0, tipo_hora: 'ausencia', obra_canonica_id: null })],
    [enLaBase({ horas: 8.8, tipo_hora: 'normal' })],
    { hoy: HOY },
  )
  assert.equal(pisar[0].fila.tipo_hora, 'ausencia')
  assert.equal(pisar[0].fila.horas, 0)
  assert.equal(pisar[0].fila.obra_canonica_id, null, 'una ausencia no la paga ninguna obra')
})

test('UNA FUENTE QUE NO ES LA WEB NO SE TOCA — SE DECLARA', () => {
  // No sé quién la escribió ni con qué autoridad. Pisarla sería decidir por alguien que no está.
  const { pisar, intocables } = pisarLoDeLaWeb(
    [dePlanilla()], [enLaBase({ fuente_legacy: 'bot:comprobantes' })], { hoy: HOY },
  )
  assert.equal(pisar.length, 0)
  assert.equal(intocables.length, 1)
  assert.match(intocables[0].porque, /no escribió la web/)
})

test('UN DÍA MIXTO SE DECLARA ENTERO: pisar la mitad lo haría contar dos veces', () => {
  const { pisar, intocables } = pisarLoDeLaWeb(
    [dePlanilla()],
    [enLaBase(), enLaBase({ id: 'r2', fuente_legacy: 'otro:desconocido', obra_canonica_id: 'obra-c' })],
    { hoy: HOY },
  )
  assert.equal(pisar.length, 0)
  assert.equal(intocables[0].existentes.length, 2)
})

test('N ≠ M NO SE EMPAREJA: el sobrante quedaría sumando al lado', () => {
  // La planilla trae una fila y la web tiene dos (dos obras el mismo día). Pisar una dejaría la otra
  // viva, y el día contaría la jornada de la planilla MÁS lo que quedó de la web.
  const { pisar, intocables } = pisarLoDeLaWeb(
    [dePlanilla()],
    [enLaBase(), enLaBase({ id: 'r2', obra_canonica_id: 'obra-c', fuente_legacy: 'web:asistencia-obra' })],
    { hoy: HOY },
  )
  assert.equal(pisar.length, 0)
  assert.match(intocables[0].porque, /no elijo cuál pisa a cuál/)
})

test('UN DÍA DE NORMAL + EXTRA SE EMPAREJA POR TIPO, NO POR ORDEN DE LLEGADA', () => {
  // EL DEFECTO QUE ATRAPA: aparear por posición convertiría las extras en normales y al revés. Las
  // extras se pagan con recargo: es plata, no una etiqueta.
  const { pisar } = pisarLoDeLaWeb(
    [dePlanilla({ horas: 8, tipo_hora: 'normal' }), dePlanilla({ horas: 4, tipo_hora: 'extra_50' })],
    [
      enLaBase({ id: 'rE', tipo_hora: 'extra_50', horas: 2, fuente_legacy: 'web:asistencia-obra' }),
      enLaBase({ id: 'rN', tipo_hora: 'normal', horas: 9, fuente_legacy: 'web:asistencia-obra' }),
    ],
    { hoy: HOY },
  )
  assert.equal(pisar.length, 2)
  const porId = new Map(pisar.map((x) => [x.id, x.fila]))
  assert.equal(porId.get('rN').tipo_hora, 'normal')
  assert.equal(porId.get('rN').horas, 8)
  assert.equal(porId.get('rE').tipo_hora, 'extra_50')
  assert.equal(porId.get('rE').horas, 4)
})

test('UN DÍA QUE LA PLANILLA NO TIENE NO SE TOCA — la app sigue cargando el día en curso', () => {
  // La planilla no trae nada del 11/09 (el dueño todavía no lo cargó). Esa fila de la web se queda:
  // borrarla o pisarla con nada haría desaparecer el trabajo del día.
  const { pisar, intocables } = pisarLoDeLaWeb(
    [dePlanilla({ fecha: '2026-09-08' })],
    [enLaBase({ id: 'rHoy', fecha: '2026-09-11' })],
    { hoy: HOY },
  )
  assert.equal(pisar.length, 0)
  assert.equal(intocables.length, 0, 'no es un conflicto: la planilla simplemente no habla de ese día')
})

test('UNA FILA QUE YA ES DE LA PLANILLA NO SE PISA A SÍ MISMA', () => {
  const { pisar, intocables } = pisarLoDeLaWeb(
    [dePlanilla()], [enLaBase({ fuente_legacy: FUENTE })], { hoy: HOY },
  )
  assert.equal(pisar.length, 0)
  assert.equal(intocables.length, 0)
})

test('EL RASTRO DICE QUÉ PISÓ Y CUÁNDO', () => {
  // Sin esto, después de la primera corrida nadie puede decir que ese día lo había cargado la app.
  assert.equal(
    rastroDePisada({ fuente_legacy: 'web:asistencia-obra', horas: 9 }, '2026-09-11'),
    'pisó web:asistencia-obra 9h el 2026-09-11',
  )
  assert.equal(
    rastroDePisada({ fuente_legacy: 'web:presencia-defecto', horas: null }, '2026-09-11'),
    'pisó web:presencia-defecto 0h el 2026-09-11',
  )
})
