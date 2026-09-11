// UNA PROYECCIÓN NO PUEDE SER NEGATIVA — y la pestaña publicaba −$763.364,80.
//
// `Estructura!O16` («Ropa y seguridad») decía que el año iba a gastar $763.364,80 MENOS de lo ya
// gastado. La causa, medida el 11/09/2026 sobre el archivo vivo: la columna `Proyectado` es
// `Total 2026 − Total real`, `Total real` suma las doce AUXILIARES (el real de cada mes) y
// `Total 2026` las doce visibles. El mes FUTURO mostraba la proyección a secas, así que un real ya
// cargado en octubre (Compras f639 · MARIANA SA, cheque f141) con proyección 0 —el sub-rubro no llega
// a MIN_MESES meses cerrados— salía por la resta con el signo al revés.
//
// Estos tests EVALÚAN la fórmula, no leen su texto: lo que se afirma es el número que publica la
// celda. El evaluador es el mismo que usa el resto del repo (`evaluar-formula-sheet.mjs`).
import test from 'node:test'
import assert from 'node:assert/strict'
import { CRITERIO, celdasDelAnio } from './estructura-filas.mjs'
import { evaluarFormula } from './evaluar-formula-sheet.mjs'

const letra = (i) => { let s = ''; for (let n = i; n >= 0; n = Math.floor(n / 26) - 1) s = String.fromCharCode(65 + (n % 26)) + s; return s }
const COL = { mes0: 1, aux0: 17, nmeses: 14, prom: 15, filaCab: 5 }
const FILA = 7
const HOY = new Date(Date.UTC(2026, 8, 11)) // 11/09/2026, como el día de la medición
const SERIAL = (a, m) => Math.round((Date.UTC(a, m - 1, 1) - Date.UTC(1899, 11, 30)) / 86400000)

/**
 * La hoja mínima que la celda visible necesita: los doce encabezados de mes, las doce AUXILIARES con
 * el real, y las dos celdas del promedio. Se ponen NÚMEROS en las auxiliares a propósito: lo que se
 * mide es la regla de qué se muestra, no el SUMIFS contra Compras (que tiene sus propios tests).
 */
function hoja({ reales, nmeses, prom }) {
  const h = {}
  for (let m = 0; m < 12; m++) {
    h[`${letra(COL.mes0 + m)}${COL.filaCab}`] = SERIAL(2026, m + 1)
    h[`${letra(COL.aux0 + m)}${FILA}`] = reales[m] ?? 0
  }
  h[`${letra(COL.nmeses)}${FILA}`] = nmeses
  h[`${letra(COL.prom)}${FILA}`] = prom
  return h
}

const evaluar = (formula, h) => evaluarFormula(formula, { hoja: h, hojas: { Parámetros: {} }, hoy: HOY })

/** Las doce visibles evaluadas, más los dos totales que derivan de ellas. */
function publicado({ reales, nmeses = 0, prom = 0 }) {
  const { visible } = celdasDelAnio({ fila: FILA, criterio: CRITERIO.subrubro, col: COL, letra })
  const h = hoja({ reales, nmeses, prom })
  const vis = visible.map((c) => evaluar(c, h))
  const totalReal = reales.reduce((a, x) => a + (x ?? 0), 0)
  const totalAnio = vis.reduce((a, x) => a + x, 0)
  return { vis, totalReal, totalAnio, proyectado: totalAnio - totalReal }
}

// El caso vivo: sólo enero ($1.002.589,76) y septiembre ($400.343,30) y octubre ($763.364,80), con
// dos meses con gasto — por debajo de MIN_MESES, así que la proyección es 0 en los doce meses.
const ROPA = { 0: 1002589.76, 8: 400343.30, 9: 763364.80 }
const realesRopa = Array.from({ length: 12 }, (_, m) => ROPA[m] ?? 0)

test('el real ya cargado en un mes FUTURO se muestra, no se pierde', () => {
  const p = publicado({ reales: realesRopa })
  assert.equal(p.vis[9], 763364.80, 'octubre tiene $763.364,80 cargados: la celda los muestra')
})

test('y por eso el Proyectado ya no puede dar negativo', () => {
  const p = publicado({ reales: realesRopa })
  assert.equal(p.proyectado, 0, 'sin proyección propia y con el real cubierto, Proyectado es cero')
  assert.ok(p.proyectado >= 0, `una proyección negativa no existe (dio ${p.proyectado})`)
})

test('EL INVARIANTE, sobre 12 escenarios: Total 2026 >= Total real, y Proyectado >= 0', () => {
  const escenarios = []
  for (let m = 0; m < 12; m++) {
    const reales = Array(12).fill(0)
    reales[m] = 1000000            // un único real, en cada uno de los doce meses
    escenarios.push({ reales, nmeses: 0, prom: 0 })            // sin tendencia: proyección 0
    escenarios.push({ reales, nmeses: 6, prom: 250000 })       // con tendencia por debajo del real
    escenarios.push({ reales, nmeses: 6, prom: 4000000 })      // y con tendencia por encima
  }
  for (const e of escenarios) {
    const p = publicado(e)
    assert.ok(p.totalAnio >= p.totalReal - 0.005,
      `Total 2026 (${p.totalAnio}) quedó por debajo de Total real (${p.totalReal})`)
    assert.ok(p.proyectado >= -0.005, `Proyectado dio ${p.proyectado}`)
  }
})

test('el mes CERRADO sigue mostrando lo que pasó, aunque la tendencia diga más', () => {
  const reales = Array(12).fill(0); reales[0] = 100
  const p = publicado({ reales, nmeses: 6, prom: 9999999 })
  assert.equal(p.vis[0], 100, 'enero está cerrado: manda el real, no el pronóstico')
})

test('el mes ABIERTO sin nada cargado sigue mostrando la proyección entera', () => {
  const reales = Array(12).fill(0)
  const p = publicado({ reales, nmeses: 6, prom: 500000 })
  assert.equal(p.vis[11], 500000, 'diciembre no tiene real: se muestra la proyección')
  assert.equal(p.proyectado, p.totalAnio, 'y toda esa plata es proyección')
})
