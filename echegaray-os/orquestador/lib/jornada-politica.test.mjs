import { test } from 'node:test'
import assert from 'node:assert/strict'
import { detectarBloques, bloquePorFecha, trabajadoresDeBloque, diaSemanaIso } from './jornales-estructura.mjs'
import {
  calibrarJornada, horasJornadaCompleta, normalizarHorasManuales, horasDeEstado, estadoDeHoras,
  JORNADA_PISO, HORAS_AUSENTE, ESTADO,
} from './jornada-politica.mjs'
import { gridJornales, FECHA_HOY, FECHA_SABADO } from './jornales-fixture.mjs'

const grid = gridJornales()
const bloques = detectarBloques(grid, { anio: 2026 })
const julio = bloquePorFecha(bloques, FECHA_HOY)
const enero = bloquePorFecha(bloques, '2026-01-05')
const calJulio = calibrarJornada(grid, julio, trabajadoresDeBloque(grid, julio))
const calEnero = calibrarJornada(grid, enero, trabajadoresDeBloque(grid, enero))

test('la jornada se CALIBRA del bloque: julio da 9h de lunes a jueves y 8h el viernes', () => {
  assert.equal(calJulio.porDia[1].horas, 9)
  assert.equal(calJulio.porDia[4].horas, 9) // jueves
  assert.equal(calJulio.porDia[5].horas, 8) // viernes
  assert.equal(calJulio.porDia[1].origen, 'calibrado')
})

test('el mismo archivo en enero daba 8h — por eso la regla no es una constante', () => {
  assert.equal(calEnero.porDia[1].horas, 8)
  assert.equal(calEnero.porDia[1].origen, 'calibrado')
  assert.notEqual(calEnero.porDia[1].horas, calJulio.porDia[1].horas)
})

test('sábado y domingo quedan MANUAL: el archivo no muestra una regla única', () => {
  assert.equal(calJulio.porDia[6].horas, null)
  assert.equal(calJulio.porDia[0].horas, null)
  assert.equal(JORNADA_PISO[6], null)
  assert.equal(JORNADA_PISO[0], null)
})

test('la calibración ignora fórmulas (horas extra) y ceros (ausencias)', () => {
  // el jueves 16/7 tiene una celda con =8+6 → 14 no debe ganarle a 9
  assert.equal(calJulio.porDia[4].horas, 9)
  const dist = calJulio.porDia[4].distribucion.map(([h]) => h)
  assert.ok(!dist.includes(14), 'una fórmula de horas extra no define la jornada')
  assert.ok(!dist.includes(0), 'un 0 es ausencia, no jornada')
})

test('sin muestras suficientes se declara el PISO, no se inventa evidencia', () => {
  const cal = calibrarJornada(grid, julio, trabajadoresDeBloque(grid, julio), { muestrasMin: 999 })
  assert.equal(cal.porDia[1].origen, 'piso')
  assert.equal(cal.porDia[1].horas, JORNADA_PISO[1])
})

test('horasJornadaCompleta marca requiere_manual cuando no hay número defendible', () => {
  const jueves = horasJornadaCompleta(4, calJulio)
  assert.equal(jueves.horas, 9)
  assert.equal(jueves.requiere_manual, false)
  const sabado = horasJornadaCompleta(6, calJulio)
  assert.equal(sabado.requiere_manual, true)
  assert.equal(sabado.horas, null)
})

test('normalizarHorasManuales acepta coma y punto y acota el rango', () => {
  assert.deepEqual(normalizarHorasManuales('5,5'), { ok: true, horas: 5.5 })
  assert.deepEqual(normalizarHorasManuales('4.25'), { ok: true, horas: 4.25 })
  assert.deepEqual(normalizarHorasManuales(0), { ok: true, horas: 0 })
  assert.equal(normalizarHorasManuales('').ok, false)
  assert.equal(normalizarHorasManuales('ocho').motivo, 'no_numerico')
  assert.equal(normalizarHorasManuales(NaN).motivo, 'no_numerico')
  assert.equal(normalizarHorasManuales('25').motivo, 'mayor_al_maximo')
  assert.equal(normalizarHorasManuales('-1').motivo, 'menor_al_minimo')
})

test('presente de lunes a viernes usa la jornada calibrada de ESE día', () => {
  const lun = horasDeEstado('presente', { diaSemana: 1, calibracion: calJulio })
  assert.deepEqual({ ok: lun.ok, horas: lun.horas }, { ok: true, horas: 9 })
  const vie = horasDeEstado('presente', { diaSemana: 5, calibracion: calJulio })
  assert.equal(vie.horas, 8)
})

test('presente en sábado NO se resuelve solo: pide horas', () => {
  const sab = horasDeEstado('presente', { diaSemana: 6, calibracion: calJulio })
  assert.equal(sab.ok, false)
  assert.equal(sab.motivo, 'jornada_requiere_manual')
})

test('ausente escribe 0 — nunca deja la celda vacía', () => {
  const a = horasDeEstado('ausente', { diaSemana: 4, calibracion: calJulio })
  assert.deepEqual({ ok: a.ok, horas: a.horas }, { ok: true, horas: 0 })
  assert.equal(HORAS_AUSENTE, 0)
})

test('jornada parcial toma las horas manuales normalizadas', () => {
  const p = horasDeEstado('parcial', { diaSemana: 4, calibracion: calJulio, horasManuales: '5,5' })
  assert.equal(p.horas, 5.5)
  const mal = horasDeEstado('parcial', { diaSemana: 4, calibracion: calJulio, horasManuales: '99' })
  assert.equal(mal.ok, false)
  assert.equal(mal.motivo, 'mayor_al_maximo')
})

test('un estado desconocido se rechaza (no cae en un default silencioso)', () => {
  assert.equal(horasDeEstado('P', { diaSemana: 4, calibracion: calJulio }).motivo, 'estado_desconocido')
  assert.equal(horasDeEstado('', {}).motivo, 'estado_desconocido')
})

test('estadoDeHoras precarga la interfaz sin reinterpretar el dato', () => {
  const d = diaSemanaIso(FECHA_HOY)
  assert.equal(estadoDeHoras(9, { diaSemana: d, calibracion: calJulio }), ESTADO.PRESENTE)
  assert.equal(estadoDeHoras(0, { diaSemana: d, calibracion: calJulio }), ESTADO.AUSENTE)
  assert.equal(estadoDeHoras(5.5, { diaSemana: d, calibracion: calJulio }), ESTADO.PARCIAL)
  assert.equal(estadoDeHoras(null, { diaSemana: d, calibracion: calJulio }), null, 'vacía no es un estado')
})

test('en sábado, 8h no se toma como "presente" porque no hay jornada de referencia', () => {
  const d = diaSemanaIso(FECHA_SABADO)
  assert.equal(d, 6)
  assert.equal(estadoDeHoras(8, { diaSemana: d, calibracion: calJulio }), ESTADO.PARCIAL)
})
