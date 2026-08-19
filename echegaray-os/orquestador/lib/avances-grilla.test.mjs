import assert from 'node:assert/strict'
import { test } from 'node:test'
import { coherencia, fechasDelCalendario, inicioDelCalendario, partesDeLaFila } from './avances-grilla.mjs'

// 46204 = 13/07/2026, el primer día del calendario de «LE - Galpon 9».
const D = (iso) => Math.round(new Date(iso + 'T00:00:00Z').getTime() / 86400000) + 25569
const ENCABEZADO = ['', '#', 'Activity', 'Comment', 'Start', 'End', 'Days', 'Status', 'Days R',
  '% Done', '', D('2026-07-13'), D('2026-07-14'), D('2026-07-15'), D('2026-07-16')]

test('el calendario empieza en la primera columna que es una fecha', () => {
  assert.equal(inicioDelCalendario(ENCABEZADO, 10), 11)
  assert.deepEqual(fechasDelCalendario(ENCABEZADO, 10).slice(11),
    ['2026-07-13', '2026-07-14', '2026-07-15', '2026-07-16'])
})

test('las columnas de la izquierda nunca son un día', () => {
  const f = fechasDelCalendario(ENCABEZADO, 10)
  assert.deepEqual(f.slice(0, 11), Array(11).fill(null))
})

test('una fila sin calendario no da partes', () => {
  assert.deepEqual(fechasDelCalendario(['', '#', 'Activity', 'Start'], 3), [])
  assert.deepEqual(partesDeLaFila([], []), [])
})

test('cada celda con avance es un parte con su fecha', () => {
  const fechas = fechasDelCalendario(ENCABEZADO, 10)
  // Leído sin formato, una celda de porcentaje llega como fracción: 0,7 es 70%.
  const fila = ['', '', 'MONTAJE DE SOPORTES', '', '', '', '', 'Completado', 3, 1, '', '', 0.7, '', 0.3]
  assert.deepEqual(partesDeLaFila(fila, fechas), [
    { fecha: '2026-07-14', pct: 70 },
    { fecha: '2026-07-16', pct: 30 },
  ])
})

test('UNA CELDA VACÍA NO ES UN CERO, PERO UN CERO ESCRITO SÍ ES UN DATO', () => {
  const fechas = fechasDelCalendario(ENCABEZADO, 10)
  const fila = ['', '', 'X', '', '', '', '', '', '', '', '', 0, '', '', 1]
  // El día que se esperaba avanzar y no se avanzó está cargado a propósito con 0%.
  assert.deepEqual(partesDeLaFila(fila, fechas), [
    { fecha: '2026-07-13', pct: 0 },
    { fecha: '2026-07-16', pct: 100 },
  ])
})

test('la coherencia contra el acumulado se declara, no se corrige sola', () => {
  const partes = [{ fecha: '2026-07-14', pct: 70 }, { fecha: '2026-07-16', pct: 30 }]
  assert.deepEqual(coherencia(partes, 100), { suma: 100, diferencia: 0 })
  assert.deepEqual(coherencia(partes, 40), { suma: 100, diferencia: 60 })
  assert.deepEqual(coherencia(partes, null), { suma: 100, diferencia: null })
})
