import { test } from 'node:test'
import assert from 'node:assert/strict'
import { enVentana, hh, resumen, sinFecha } from './horas.ts'

let n = 0
const fila = (p: Partial<{ fecha: string | null; obra_id: string | null; obra: string | null; tipo_hora: string; horas: number }>) => ({
  id: `f${(n += 1)}`,
  fecha: '2026-08-20',
  obra_id: 'comedor',
  obra: 'Comedor La Estrella',
  actividad_id: null,
  actividad: null,
  tipo_hora: 'normal',
  horas: 8,
  notas: null,
  ...p,
})

test('el total del período suma sólo lo TRABAJADO: una ausencia no es trabajo', () => {
  const r = resumen(
    [
      fila({ fecha: '2026-08-18' }),
      fila({ fecha: '2026-08-19', tipo_hora: 'extra_50' }),
      fila({ fecha: '2026-08-17', tipo_hora: 'ausencia' }),
      fila({ fecha: '2026-08-16', tipo_hora: 'licencia' }),
    ],
    '2026-08-01', '2026-08-20',
  )
  // 8 normales + 8 extras. Las 16 de ausencia y licencia NO entran: sumarlas diría que trabajó el
  // día que faltó.
  assert.equal(r.trabajadas, 16)
  assert.equal(r.porTipo.ausencia, 8, 'pero se siguen contando aparte, no se pierden')
  assert.equal(r.porTipo.licencia, 8)
})

test('los días trabajados son días DISTINTOS, no filas', () => {
  // El defecto que atrapa: contar filas infla los días de quien imputó a dos actividades el mismo
  // día — y ese número va al lado del total como si fuera asistencia.
  const r = resumen(
    [
      fila({ fecha: '2026-08-19', horas: 4 }),
      fila({ fecha: '2026-08-19', horas: 4 }),
      fila({ fecha: '2026-08-20', horas: 8 }),
    ],
    '2026-08-01', '2026-08-20',
  )
  assert.equal(r.filas.length, 3)
  assert.equal(r.dias, 2)
  assert.equal(r.trabajadas, 16)
})

test('un día sin imputación NO aparece: la tabla lista lo que existe, no el calendario', () => {
  // El 15 no está en los datos y no puede estar en la salida. Un renglón «15/08 · 0,00» afirmaría
  // que ese día estuvo y no trabajó.
  const r = resumen([fila({ fecha: '2026-08-14' }), fila({ fecha: '2026-08-16' })], '2026-08-01', '2026-08-20')
  assert.deepEqual(r.filas.map((f) => f.fecha), ['2026-08-16', '2026-08-14'])
  assert.equal(r.dias, 2, 'dos días con registro, no los veinte del período')
})

test('un día de ausencia no cuenta como día trabajado', () => {
  const r = resumen(
    [fila({ fecha: '2026-08-19' }), fila({ fecha: '2026-08-18', tipo_hora: 'ausencia' })],
    '2026-08-01', '2026-08-20',
  )
  assert.equal(r.dias, 1)
})

test('la ventana corta por las dos puntas, ambas inclusive', () => {
  const filas = [
    fila({ fecha: '2026-07-31' }),
    fila({ fecha: '2026-08-01' }),
    fila({ fecha: '2026-08-20' }),
    fila({ fecha: '2026-08-21' }),
  ]
  assert.deepEqual(
    enVentana(filas, '2026-08-01', '2026-08-20').map((f) => f.fecha),
    ['2026-08-01', '2026-08-20'],
  )
})

test('una fila SIN FECHA no se mete en el período: se cuenta aparte', () => {
  // Meterla en el mes en curso le sumaría horas a un período al que nadie dijo que pertenecen.
  const filas = [fila({ fecha: null }), fila({ fecha: '2026-08-20' })]
  const r = resumen(filas, '2026-08-01', '2026-08-20')
  assert.equal(r.trabajadas, 8)
  assert.equal(sinFecha(filas), 1)
})

test('las obras se agrupan por id y se rotulan con su nombre; sin obra se dice «sin obra»', () => {
  const r = resumen(
    [
      fila({ obra_id: 'comedor', obra: 'Comedor La Estrella', horas: 8 }),
      fila({ obra_id: 'comedor', obra: 'Comedor La Estrella', horas: 8, fecha: '2026-08-19' }),
      fila({ obra_id: 'escuela', obra: 'Ampliación Escuela 12', horas: 4, fecha: '2026-08-18' }),
      // Una fila sin obra con un nombre colgado de antes se rotularía con esa obra y diría que
      // trabajó donde no trabajó.
      fila({ obra_id: null, obra: 'Comedor La Estrella', horas: 2, fecha: '2026-08-17' }),
    ],
    '2026-08-01', '2026-08-20',
  )
  assert.deepEqual(r.obras, [
    { obraId: 'comedor', obra: 'Comedor La Estrella', horas: 16 },
    { obraId: 'escuela', obra: 'Ampliación Escuela 12', horas: 4 },
    { obraId: '—', obra: 'sin obra', horas: 2 },
  ])
})

test('un período sin una sola imputación da cero horas y cero días, sin filas inventadas', () => {
  const r = resumen([fila({ fecha: '2026-08-20' })], '2026-06-01', '2026-06-30')
  assert.equal(r.trabajadas, 0)
  assert.equal(r.dias, 0)
  assert.equal(r.filas.length, 0)
})

test('las horas se escriben con coma y dos decimales, como en el parte', () => {
  assert.equal(hh(148), '148,00')
  assert.equal(hh(8.5), '8,50')
  assert.equal(hh(1234.5), '1.234,50')
})
