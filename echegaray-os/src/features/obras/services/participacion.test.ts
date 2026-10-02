// QUIEN PARTICIPÓ DE UN AVANCE CUENTA EN LA OBRA — HH y cuadrilla (dueño, 02/10/2026).
//
// ═══ LOS DEFECTOS QUE ATRAPA ═══
//
// Hasta hoy ERP Obras armaba la cuadrilla sólo con la asignación vigente de la PERSONA y las HH de
// una tarea sólo con `registros_hh`. Quien figuraba en el parte de una tarea de otra obra no
// aparecía en ninguna de las dos: ni gente, ni horas. Estas pruebas fijan la regla del reparto
// —asistencia (o jornada por defecto) en partes iguales, lo cargado gana, nunca más que la
// asistencia— y que el participante sin asignación entra a la cuadrilla marcado como tal.
//
// Y el defecto del teléfono: el formulario de avance mandaba `hh_<uuid>` y el lector espera
// `horas_<uuid>`. Las horas que el jefe escribía en «Quién lo hizo» se descartaban en silencio.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  cuadrillaConParticipantes, hhDeParticipacionPorTarea, hhQueAgregaLaParticipacion, horasDeParticipacion,
} from './participacion.ts'
import { leerReparto } from './repartoHH.ts'

const JUEVES = '2026-10-01'
const VIERNES = '2026-10-02'
const SABADO = '2026-10-03'
const ANA = 'ana'
const X = 'obra-x'
const Y = 'obra-y'

test('participante sin asignación a la obra: suma HH en la tarea con su asistencia de otra obra', () => {
  const filas = horasDeParticipacion(
    [{ persona_id: ANA, obra_id: X, actividad_id: 't1', fecha: JUEVES, horas: null }],
    // Su asistencia quedó registrada en la obra donde está asignada (Y), sin tarea.
    [{ persona_id: ANA, obra_id: Y, actividad_id: null, fecha: JUEVES, horas: 9 }],
  )
  const deX = hhQueAgregaLaParticipacion(filas, X)
  assert.equal(deX.length, 1)
  assert.equal(deX[0].horas, 9)
  assert.equal(deX[0].origen, 'calculada')
  assert.equal(deX[0].base, 'asistencia')
  assert.deepEqual(hhDeParticipacionPorTarea(filas, X).get('t1'), { horas: 9, calculada: true })
})

test('participante sin asignación aparece en la cuadrilla, marcado y una sola vez', () => {
  const asignados = [{ id: 'beto' }]
  const c = cuadrillaConParticipantes(asignados, [{ id: ANA }, { id: ANA }, { id: 'beto' }])
  assert.deepEqual(c.map((p) => [p.id, p.por_participacion]), [['beto', false], [ANA, true]])
})

test('persona en dos tareas el mismo día: la asistencia se reparte en partes iguales y no se pasa', () => {
  const dos = horasDeParticipacion(
    [
      { persona_id: ANA, obra_id: X, actividad_id: 't1', fecha: JUEVES, horas: null },
      { persona_id: ANA, obra_id: Y, actividad_id: 't2', fecha: JUEVES, horas: null },
    ],
    [{ persona_id: ANA, obra_id: Y, actividad_id: null, fecha: JUEVES, horas: 9 }],
  )
  assert.deepEqual(dos.map((f) => f.horas), [4.5, 4.5])

  const tres = horasDeParticipacion(
    ['t1', 't2', 't3'].map((t) => ({ persona_id: ANA, obra_id: X, actividad_id: t, fecha: JUEVES, horas: null })),
    [{ persona_id: ANA, obra_id: X, actividad_id: null, fecha: JUEVES, horas: 10 }],
  )
  const total = tres.reduce((s, f) => s + (f.horas ?? 0), 0)
  assert.ok(total <= 10, `suma ${total} > 10 de asistencia`)
  assert.equal(tres[0].horas, 3.33)
})

test('HH cargada a mano para esa persona-día-tarea gana y no se duplica', () => {
  const filas = horasDeParticipacion(
    [
      { persona_id: ANA, obra_id: X, actividad_id: 't1', fecha: JUEVES, horas: 7 },
      { persona_id: ANA, obra_id: X, actividad_id: 't2', fecha: JUEVES, horas: null },
    ],
    [
      { persona_id: ANA, obra_id: X, actividad_id: null, fecha: JUEVES, horas: 9 },
      { persona_id: ANA, obra_id: X, actividad_id: 't1', fecha: JUEVES, horas: 6 },
    ],
  )
  const t1 = filas.find((f) => f.actividad_id === 't1')
  assert.equal(t1?.origen, 'cargada')
  assert.equal(t1?.horas, 6)
  // Lo cargado ya lo suma `obra_actividad_hh`: la participación no lo agrega otra vez.
  assert.equal(hhDeParticipacionPorTarea(filas, X).has('t1'), false)
  // Lo que queda de la asistencia va a la otra tarea: 9 − 6.
  assert.equal(filas.find((f) => f.actividad_id === 't2')?.horas, 3)
})

test('el parte con horas por persona se usa tal cual y no es calculado', () => {
  const filas = horasDeParticipacion(
    [{ persona_id: ANA, obra_id: X, actividad_id: 't1', fecha: JUEVES, horas: 5 }], [],
  )
  assert.deepEqual([filas[0].horas, filas[0].origen, filas[0].base], [5, 'parte', null])
})

test('sin asistencia: jornada por defecto, marcada; fin de semana no inventa horas', () => {
  const vie = horasDeParticipacion([{ persona_id: ANA, obra_id: X, actividad_id: 't1', fecha: VIERNES, horas: null }], [])
  assert.deepEqual([vie[0].horas, vie[0].base], [8, 'jornada_defecto'])
  const jue = horasDeParticipacion([{ persona_id: ANA, obra_id: X, actividad_id: 't1', fecha: JUEVES, horas: null }], [])
  assert.equal(jue[0].horas, 9)
  const sab = horasDeParticipacion([{ persona_id: ANA, obra_id: X, actividad_id: 't1', fecha: SABADO, horas: null }], [])
  assert.equal(sab[0].horas, null)
  assert.equal(hhQueAgregaLaParticipacion(sab, X).length, 0)
})

test('las horas de «Quién lo hizo» del teléfono llegan al lector de horas', () => {
  const fuente = readFileSync(new URL('../../jefe/components/FormularioAvance.tsx', import.meta.url), 'utf8')
  const m = /name=\{`([a-z_]+)\$\{p\.id\}`\}/.exec(fuente)
  assert.ok(m, 'no encontré el casillero de horas por persona en FormularioAvance')
  const id = '0f8fad5b-d9cb-469f-a165-70867728950e'
  assert.equal(leerReparto([[`${m[1]}${id}`, '8']]).length, 1, `el formulario manda «${m[1]}», el lector no lo lee`)
})
