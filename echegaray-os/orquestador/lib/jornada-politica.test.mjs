import { test } from 'node:test'
import assert from 'node:assert/strict'
import { detectarBloques, bloquePorFecha, trabajadoresDeBloque } from './jornales-estructura.mjs'
import { calibrarJornada, horasJornadaCompleta, JORNADA_PISO } from './jornada-politica.mjs'
import { gridJornales, FECHA_HOY } from './jornales-fixture.mjs'

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

// Los tests de estado→horas, validación de horas manuales y separación normal/extra
// viven ahora en horas-extra.test.mjs: esa capacidad se movió entera a ese módulo.
