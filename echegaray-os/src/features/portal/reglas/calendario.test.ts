import test from 'node:test'
import assert from 'node:assert/strict'
import { grillaDelMes, mesVecino, nombreDelMes } from './calendario.ts'

test('septiembre 2026 arranca como lo dibuja el mockup 30: 31 · 1 2 3 4 5 6', () => {
  const g = grillaDelMes(2026, 9)
  assert.deepEqual(g.slice(0, 7).map((d) => d.dia), [31, 1, 2, 3, 4, 5, 6])
  assert.equal(g[0].del_mes, false, 'el 31 es de agosto')
  assert.equal(g[1].fecha, '2026-09-01')
  assert.equal(g[5].finde, true, 'el 5 es sábado')
  assert.equal(g[6].finde, true, 'el 6 es domingo')
  assert.equal(g.length, 42)
})

test('la semana empieza el LUNES, no el domingo', () => {
  // `getDay()` devuelve 0 para domingo: sin corregirlo, todo el calendario se corre un día y los
  // pagos aparecen bajo la columna equivocada. Marzo 2026 empieza DOMINGO — el peor caso.
  const g = grillaDelMes(2026, 3)
  assert.equal(g[6].fecha, '2026-03-01', 'el 1 de marzo de 2026 es domingo: va en la séptima celda')
  assert.equal(g[0].dia, 23, 'la fila arranca el lunes 23 de febrero')
})

test('un mes que empieza lunes no trae relleno adelante', () => {
  // Junio 2026 empieza lunes.
  const g = grillaDelMes(2026, 6)
  assert.equal(g[0].fecha, '2026-06-01')
  assert.equal(g[0].del_mes, true)
})

test('febrero bisiesto cierra sin comerse el 29', () => {
  const g = grillaDelMes(2028, 2)
  const delMes = g.filter((d) => d.del_mes).map((d) => d.dia)
  assert.equal(delMes.length, 29)
  assert.equal(delMes[28], 29)
})

test('la fecha es un día del calendario, no un instante: no se corre por la zona horaria', () => {
  // En Argentina (UTC−3) `new Date('2026-09-01')` es el 31/08 a las 21:00. Si la grilla se armara
  // con fechas locales, el calendario entero empezaría un día antes.
  const g = grillaDelMes(2026, 9)
  assert.ok(g.every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d.fecha)))
  assert.equal(g.find((d) => d.fecha === '2026-09-17')?.dia, 17)
})

test('el mes vecino no devuelve el mes 13 ni el 0', () => {
  assert.deepEqual(mesVecino(2026, 12, 1), { anio: 2027, mes: 1 })
  assert.deepEqual(mesVecino(2026, 1, -1), { anio: 2025, mes: 12 })
  assert.deepEqual(mesVecino(2026, 8, 1), { anio: 2026, mes: 9 })
})

test('el mes se escribe en castellano y con mayúscula', () => {
  assert.equal(nombreDelMes(2026, 9), 'Septiembre')
  assert.equal(nombreDelMes(2026, 1), 'Enero')
})
