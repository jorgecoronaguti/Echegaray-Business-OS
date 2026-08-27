// EL DEVENGADO MES A MES. El defecto que atrapa: valorizar enero con el precio de agosto.
import test from 'node:test'
import assert from 'node:assert/strict'
import { COL_OBRA, COL_OFICINA, devengadoPorMes, diaDeCelda, horas, jornal, mesesDe, totalAnio } from './nomina-devengado.mjs'

const clave = (s) => String(s).toLowerCase().trim()

/** Dos quincenas: enero a $1.000 la hora y agosto a $2.000. Misma persona, 10 h en cada una. */
function espejo() {
  const g = []
  const pon = (fila, col, v) => { (g[fila] ??= [])[col] = v }
  // bloque 1 · fila de fechas en el índice 0 (fila 1), personas desde la fila 2
  pon(0, 5, '05/01'); pon(1, 0, '1'); pon(1, 1, 'Perez Juan'); pon(1, 22, '1000'); pon(1, 21, '900'); pon(1, 3, 'OF'); pon(1, 5, '10')
  // bloque 2 · fila de fechas en el índice 3 (fila 4), personas desde la fila 5
  pon(3, 5, '10/08'); pon(4, 0, '1'); pon(4, 1, 'Perez Juan'); pon(4, 22, '2000'); pon(4, 21, '1800'); pon(4, 3, 'OF'); pon(4, 5, '10')
  return g
}
const BLOQUES = [{ inicio: 2, fin: 2, filaFecha: 1 }, { inicio: 5, fin: 5, filaFecha: 4 }]

test('cada mes se valoriza con el precio de SU quincena, no con el último', () => {
  const d = devengadoPorMes(espejo(), BLOQUES, { anio: 2026, clave })
  const p = d.get('perez juan')
  assert.equal(p.meses.get('2026-01').importe, 10_000)
  assert.equal(p.meses.get('2026-08').importe, 20_000)
  assert.equal(totalAnio(p).importe, 30_000)
  assert.equal(totalAnio(p).horas, 20)
})

test('con el mapa de OFICINA el precio sale de otra columna', () => {
  const d = devengadoPorMes(espejo(), BLOQUES, { anio: 2026, clave, col: COL_OFICINA })
  const p = d.get('perez juan')
  assert.equal(p.meses.get('2026-01').importe, 9_000)
  assert.equal(p.categoria, '', 'en oficina la columna 3 es DÍAS TRABAJADO, no la categoría')
})

test('las horas sin precio se cuentan y NO se valorizan en silencio', () => {
  const g = espejo()
  g[4][22] = ''
  g[4][21] = ''
  const p = devengadoPorMes(g, BLOQUES, { anio: 2026, clave }).get('perez juan')
  assert.equal(p.meses.get('2026-08').horas, 10)
  assert.equal(p.meses.get('2026-08').importe, 0)
  assert.equal(p.horasSinPrecio, 10)
})

test('importes y horas en formato es-AR', () => {
  assert.equal(jornal('$ 5.600'), 5600)
  assert.equal(jornal('6.348,50'), 6348.5)
  assert.equal(horas('8,5'), 8.5)
  assert.equal(horas('—'), 0)
})

test('los doce meses salen en orden y con el año pedido', () => {
  const m = mesesDe(2026)
  assert.equal(m.length, 12)
  assert.equal(m[0], '2026-01')
  assert.equal(m[11], '2026-12')
})

test('el mapa de obra y el de oficina NO son el mismo', () => {
  assert.notEqual(COL_OBRA.hora, COL_OFICINA.hora)
  assert.equal(COL_OFICINA.categoria, null)
})

test('la fila de fechas se entiende en los DOS renders: «24/08» y su serial', () => {
  assert.deepEqual(diaDeCelda('24/08'), { dia: 24, mes: 8 })
  assert.deepEqual(diaDeCelda(46258), { dia: 24, mes: 8 })
  assert.equal(diaDeCelda(''), null)
  assert.equal(diaDeCelda('sábado'), null)
  assert.equal(diaDeCelda(8), null, 'un 8 suelto es una hora, no una fecha')
})

test('con la grilla en serial el devengado sale igual que con el texto', () => {
  const g = espejo()
  g[0][5] = 46027   // 05/01/2026
  g[3][5] = 46245   // 11/08/2026
  const p = devengadoPorMes(g, BLOQUES, { anio: 2026, clave }).get('perez juan')
  assert.equal(p.meses.get('2026-01').importe, 10_000)
  assert.equal(p.meses.get('2026-08').importe, 20_000)
})
