#!/usr/bin/env node
// Test de la lib jornales (extractor de la última quincena sobre la planilla de bloques apilados).
import { parseMonto, filasDeBloque, ultimaQuincena } from './jornales.mjs'

let ok = 0, fail = 0
const check = (n, c) => { if (c) ok++; else { fail++; console.error(`FALLA: ${n}`) } }

// Grid sintético: 2 bloques de quincena, total pagado en col índice 4.
const F = ['', '', '', '', '']
const g = [
  ['n', 'Obrero', '', 'Cat', 'total'],          // 0
  ['', '', '', '', ''],                           // 1
  ['', '', '', '', ''],                           // 2 (relleno)
  // bloque 1 (quincena vieja): fila de fechas
  ['', '', '', '5/1', '6/1', '7/1'],              // 3 header (3 fechas en cols 3-5)
  ['1', 'Aguero', '5/1/25', 'OF', '$100.000'],    // 4 empleado
  ['2', 'Bazan', '1/2/25', 'OF', '$200.000'],     // 5 empleado
  ['', 'TOTAL SEMANAL', '', '', '$300.000'],      // 6 corta bloque
  // bloque 2 (última quincena): fila de fechas
  ['', '', '', '1/7', '2/7', '3/7'],              // 7 header
  ['1', 'Navarro', '1/1/26', 'OF', '$448.800'],   // 8
  ['2', 'Reta', '1/1/26', 'OF', '$502.350'],      // 9
  ['3', 'Pastran', '1/1/26', 'OF', '$588.000'],   // 10
  ['', 'TOTAL SEMANAL', '', '', '$1.539.150'],    // 11 corta
]

check('parseMonto es-AR', parseMonto('$7.048.606') === 7048606 && parseMonto('$448.800,00') === 448800 && parseMonto('') === 0)
check('detecta 2 bloques (filas con ≥3 fechas)', filasDeBloque(g).length === 2)
const q = ultimaQuincena(g, 4)
check('toma la ÚLTIMA quincena (1/7)', q.desde === '1/7' && q.hasta === '3/7')
check('cuenta 3 personas del último bloque', q.personas === 3)
check('suma el total del último bloque (no del viejo)', q.total === 1539150)
check('no incluye el bloque viejo (Aguero/Bazan)', !q.detalle.some((d) => d.nombre === 'Aguero'))
check('detalle por persona', q.detalle.length === 3 && q.detalle[0].nombre === 'Navarro' && q.detalle[0].total === 448800)
check('grid sin bloques → null', ultimaQuincena([['a', 'b']], 4) === null)

// Fechas DESORDENADAS en el header (como Obreros real: 16/7,17/7,18/7,6/7…) → desde/hasta por min/max.
const g2 = [
  ['', '', '', '16/7', '17/7', '18/7', '6/7', '7/7', '8/7'], // 0 header, fechas fuera de orden
  ['1', 'Navarro', '', '', '', '', '', '', '', '$473.000'],  // 1 empleado (total en col 9)
  ['', 'TOTAL', '', '', '', '', '', '', '', '$473.000'],      // 2 corta
]
const q2 = ultimaQuincena(g2, 9)
check('desde/hasta por min/max, no primera/última', q2.desde === '6/7' && q2.hasta === '18/7')

console.log(`\njornales.test: ${ok} OK, ${fail} FALLA`)
process.exit(fail ? 1 : 0)
