import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  columnasDePeriodo, mesDeSerial, cadenaDeCaja, subtotales, totalAnual, semanasPorMes, cuadreDeFila,
} from './cash-flow-invariantes.mjs'

// 46023 = 01/01/2026 · 46235 = 01/08/2026 · 46266 = 01/09/2026.
const ENCABEZADO_MENSUAL = ['Período', 46023, 46054, 46082, 'Total 2026', 'Real (Compras)']

test('"Total 2026" y "Nota" NO son períodos: contarlos rompió tres celdas del ancla', () => {
  const cols = columnasDePeriodo(ENCABEZADO_MENSUAL)
  assert.deepEqual(cols.map((c) => c.col), [1, 2, 3])
})

test('un encabezado numérico chico (un contador, un porcentaje) tampoco es un período', () => {
  assert.deepEqual(columnasDePeriodo(['Período', 46023, 12, 0.25]).map((c) => c.col), [1])
})

test('la cadena de caja detecta el mes donde inicio + neto ≠ cierre', () => {
  const cols = columnasDePeriodo(ENCABEZADO_MENSUAL)
  const inicio = [null, 100, 150, 90]
  const neto = [null, 50, -60, 10]
  const cierre = [null, 150, 90, 111] // el tercero debería cerrar en 100
  const fallas = cadenaDeCaja(inicio, neto, cierre, cols)
  assert.equal(fallas.length, 1)
  assert.equal(fallas[0].tipo, 'inicio+neto≠cierre')
  assert.equal(fallas[0].diferencia, 11)
})

test('la cadena de caja detecta el corte: el cierre de un mes no es el inicio del siguiente', () => {
  const cols = columnasDePeriodo(ENCABEZADO_MENSUAL)
  const fallas = cadenaDeCaja([null, 100, 999, 1000], [null, 50, 1, 0], [null, 150, 1000, 1000], cols)
  assert.equal(fallas.length, 1)
  assert.equal(fallas[0].tipo, 'cierre(n)≠inicio(n+1)')
  assert.equal(fallas[0].diferencia, 849)
})

test('antes del ancla el inicio está vacío a propósito: eso no es una falla', () => {
  const cols = columnasDePeriodo(ENCABEZADO_MENSUAL)
  assert.deepEqual(cadenaDeCaja([null, '', '', 90], [null, 5, 5, 10], [null, '', '', 100], cols), [])
})

test('un subtotal que no es la suma de sus hijos queda denunciado con el monto', () => {
  const cols = columnasDePeriodo(ENCABEZADO_MENSUAL)
  const grid = []
  grid[13] = ['(–) Personal', 100, 200, 300] // fila 14
  grid[14] = ['  jornales', 60, 200, 300] // fila 15
  grid[15] = ['  sueldos', 40, 200, 250] // fila 16
  const fallas = subtotales(grid, [{ fila: 14, hijos: [15, 16], concepto: '(–) Personal' }], cols)
  assert.equal(fallas.length, 2)
  assert.equal(fallas[0].diferencia, -200) // febrero: 200 declarado contra 400 de hijos
  assert.equal(fallas[1].diferencia, -250)
})

test('el total del año se compara contra la suma de los períodos, no contra sí mismo', () => {
  const cols = columnasDePeriodo(ENCABEZADO_MENSUAL)
  const grid = []
  grid[5] = ['Cobros', 10, 20, 30, 62] // fila 6 · el total dice 62 y la suma es 60
  const fallas = totalAnual(grid, [{ fila: 6, concepto: 'Cobros' }], cols, 4)
  assert.equal(fallas.length, 1)
  assert.equal(fallas[0].diferencia, 2)
  // Un peso de diferencia es redondeo del propio Sheet, no un hallazgo: no se denuncia.
  grid[5][4] = 61
  assert.deepEqual(totalAnual(grid, [{ fila: 6, concepto: 'Cobros' }], cols, 4), [])
})

test('la semana que arranca en diciembre de 2025 no es del año, y la que cruza queda marcada', () => {
  // 46020 = lunes 29/12/2025 · 46027 = 05/01/2026 · 46048 = 26/01/2026 (cruza a febrero)
  const { porMes, cruzadas } = semanasPorMes([
    { col: 1, serial: 46020 }, { col: 2, serial: 46027 }, { col: 3, serial: 46048 },
  ], 2026)
  assert.equal(porMes.get(1).length, 3) // la de 29/12 cae en enero porque su semana termina en enero
  assert.equal(cruzadas.length, 2)
  assert.deepEqual(mesDeSerial(46048), { anio: 2026, mes: 1 })
})

test('el cuadre por fila informa la diferencia por mes y la del año', () => {
  const cols = columnasDePeriodo(['Período', 46023, 46054])
  const { porMes } = semanasPorMes([
    { col: 1, serial: 46027 }, { col: 2, serial: 46034 }, { col: 3, serial: 46055 },
  ], 2026)
  const mensual = ['x', 100, 500]
  const semanal = ['x', 40, 50, 100]
  const r = cuadreDeFila(mensual, semanal, cols, porMes)
  assert.equal(r.meses[0].diferencia, 10) // enero: 100 contra 90
  assert.equal(r.meses[1].diferencia, 400)
  assert.equal(r.diferenciaAnio, 410)
})
