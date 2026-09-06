import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  citarCuadro2EnCuadro1, citasDelCuadroQuienes, COLUMNAS, cuentasDelCostoDeSalida,
  sumaDeColumna, sumaOGuion, totalDelAnio,
} from './plantel-formulas.mjs'

// ═══ EL DEFECTO QUE ESTOS TESTS ATRAPAN ═══
//
// «Plantel» tenía 400 números pegados y CERO fórmulas (censo del 05/09/2026). Los que son aritmética
// de celdas que ya están en la pestaña se convirtieron en fórmula. Si alguien vuelve a pegarlos, el
// número se congela en la corrida que lo escribió y ninguna suma se rompe — que es exactamente el
// modo de falla contra el que existen estos tests.
//
// Las filas de referencia son las REALES, leídas del archivo el 05/09: cuadro 1 desde la fila 7,
// cuadro 2 desde la 28, cuadro 3 desde la 51, con 17 personas activas.

test('el TOTAL AÑO de una persona suma sus doce meses, no un número que alguien calculó aparte', () => {
  assert.equal(totalDelAnio(28), '=SUM(B28:M28)')
  // La última columna de mes es M: si el rango llegara hasta L, diciembre quedaría afuera del total
  // sin que ninguna celda se ponga en rojo.
  assert.equal(COLUMNAS.devengado.mesUltimo, 'M')
})

test('la cita del cuadro 1 apunta a la fila de ESA persona en el cuadro 2', () => {
  const c = citasDelCuadroQuienes({ filaEnDevengado: 28 })
  assert.equal(c.horas, '=O28')
  assert.equal(c.devengado, '=N28')
})

test('el promedio mensual divide por los meses CON importe, y sin ninguno muestra el hueco', () => {
  const { promedio } = citasDelCuadroQuienes({ filaEnDevengado: 29 })
  // Castillo Carlos (fila 29) tiene dos meses con importe: dividir su devengado por 12 diría que
  // cobra la sexta parte de lo que cobra.
  assert.equal(promedio, '=IF(COUNTIF(B29:M29,">0")=0,"—",N29/COUNTIF(B29:M29,">0"))')
  assert.ok(promedio.includes('"—"'), 'sin meses trabajados tiene que mostrar el guion, no una división por cero')
})

test('citarCuadro2EnCuadro1 convierte índice 0-based en fila 1-based: un renglón de corrimiento publica el devengado de otra persona', () => {
  // El caso real: la primera persona está en la fila 7 (índice 6) y en la 28 (índice 27).
  const destino = Array.from({ length: 30 }, () => Array(17).fill(''))
  citarCuadro2EnCuadro1(destino, { filaQuienes: [6, 7], filaEnDevengado: [27, 28] })
  assert.equal(destino[6][6], '=O28', 'la fila 7 del cuadro 1 tiene que citar la fila 28, no la 27')
  assert.equal(destino[6][7], '=N28')
  assert.equal(destino[7][6], '=O29')
  // Y no escribe donde no le toca: las columnas A–F son del cuadro 1 y no se pisan.
  assert.deepEqual(destino[6].slice(0, 6), ['', '', '', '', '', ''])
})

test('citarCuadro2EnCuadro1 se niega cuando los dos cuadros no tienen la misma gente', () => {
  const destino = [Array(17).fill('')]
  assert.throws(() => citarCuadro2EnCuadro1(destino, { filaQuienes: [0], filaEnDevengado: [] }),
    /1 persona\(s\) en el cuadro 1 y 0 en el cuadro 2/)
})

test('SALE DE LA CAJA suma los cuatro conceptos, y el efectivo es el resto de la liquidación', () => {
  const c = cuentasDelCostoDeSalida(51)
  assert.equal(c.sale, '=SUM(D51:G51)')
  // J−H y NO «sale × (1−50%)»: si alguien corrige la liquidación a mano, el efectivo se mueve con
  // ella. Con el porcentaje, las dos columnas dejarían de sumar lo que el rótulo promete.
  assert.equal(c.efectivo, '=J51-H51')
})

test('el total de un mes sin jornales muestra el hueco, no un cero que se lee como dato', () => {
  assert.equal(sumaOGuion('K', 28, 44), '=IF(SUM(K28:K44)=0,"—",SUM(K28:K44))')
  assert.equal(sumaDeColumna('N', 28, 44), '=SUM(N28:N44)')
})

test('ningún rango de suma sale dado vuelta ni arranca en la fila cero', () => {
  assert.throws(() => sumaDeColumna('B', 44, 28), /está dado vuelta/)
  assert.throws(() => sumaDeColumna('B', 0, 10), /entero ≥ 1/)
  assert.throws(() => totalDelAnio(0), /entero ≥ 1/)
})

// ═══ EL CABLEADO: QUE EL GENERADOR LAS USE ═══
//
// Las fórmulas correctas en un módulo que nadie llama no arreglan la pestaña. Este test mira el
// generador dueño de «Plantel» y falla si vuelve a escribir el número en vez de la fórmula.
const GEN = readFileSync(new URL('../scripts/nomina-pestana.mjs', import.meta.url), 'utf8')
const PLANTEL = GEN.slice(GEN.indexOf('─── DESDE ACÁ, TODO VA A «Plantel» ───'))

test('el generador de «Plantel» publica las columnas derivadas como fórmula', () => {
  assert.ok(PLANTEL.length > 1000, 'no encontré el bloque de «Plantel» en el generador')
  for (const f of ['citarCuadro2EnCuadro1', 'totalDelAnio(', 'cuentasDelCostoDeSalida(', 'sumaOGuion(', 'sumaDeColumna(']) {
    assert.ok(PLANTEL.includes(f), `el bloque de «Plantel» ya no usa ${f}: alguna columna volvió a pegarse`)
  }
  // El síntoma exacto que había: la fila de totales con los acumuladores de JavaScript adentro.
  assert.ok(!/Math\.round\(importeT\)|Math\.round\(horasT\)|Math\.round\(saleTotal\)/.test(PLANTEL),
    'la fila de totales volvió a pegar el acumulador en vez de sumar la columna')
})
