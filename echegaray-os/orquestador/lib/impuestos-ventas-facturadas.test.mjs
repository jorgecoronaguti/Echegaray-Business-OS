// LA PROYECCIÓN DE IVA SÓLO MIRA LO FACTURADO — reporte del dueño del 03/09/2026: «las proyecciones
// de IVA están tomando de manera exagerada; lo indicado con B en cobranzas es lo que tiene que
// considerar siempre».
//
// Cobranzas clasifica cada venta en su columna B: `B` facturada, `N` sin factura. Medido sobre las
// 96 filas reales: las 33 filas `N` suman $284.773.901 de neto y tienen IVA CERO las treinta y tres.
// Sumarlas proyectaba $59.802.519 de débito fiscal que nunca se va a devengar.
//
// Las filas de prueba imitan `Cobranzas!B5:J`: 0 = Categoría · 1 = Fecha emisión · 8 = Monto neto.

import test from 'node:test'
import assert from 'node:assert/strict'
import { ventasFacturadasPorMes, CATEGORIA_FACTURADA } from './impuestos-fuentes.mjs'

const fila = (cat, fecha, neto) => [cat, fecha, 'FA', '01-1', 'Civil', 'ARCOR', '', '', neto]

test('una venta sin factura NO entra en la base del IVA débito', () => {
  const { porMes } = ventasFacturadasPorMes([
    fila('B', '02/12/2025', '$ 9.520.000,00'),
    fila('N', '02/12/2025', '$ 5.000.000,00'),
  ])
  assert.equal(porMes['2025-12'], 9520000, 'la fila N no puede sumar: sin factura no hay débito fiscal')
})

test('la categoría se lee de la columna B, no de la fecha ni del monto', () => {
  const { porMes, afuera } = ventasFacturadasPorMes([fila('N', '15/03/2026', '$ 1.000.000,00')])
  assert.deepEqual(porMes, {}, 'una planilla entera de N proyecta cero, no proyecta todo')
  assert.equal(afuera.sinFactura, 1)
})

test('agrupa por mes de EMISIÓN y acumula varias facturas del mismo mes', () => {
  const { porMes } = ventasFacturadasPorMes([
    fila('B', '02/12/2025', '$ 9.520.000,00'),
    fila('B', '15/12/2025', '$ 15.000.000,00'),
    fila('B', '10/01/2026', '$ 1.000.000,00'),
  ])
  assert.deepEqual(porMes, { '2025-12': 24520000, '2026-01': 1000000 })
})

test('una fila sin categoría queda afuera Y se cuenta: un filtro mudo no se distingue de uno roto', () => {
  const { porMes, afuera } = ventasFacturadasPorMes([
    fila('', '02/12/2025', '$ 9.520.000,00'),
    fila('B', '02/12/2025', '$ 1.000.000,00'),
  ])
  assert.equal(porMes['2025-12'], 1000000)
  assert.equal(afuera.sinCategoria, 1, 'tiene que poder decir cuántas quedaron sin clasificar')
})

test('una categoría NUEVA no entra por defecto — se descarta y se cuenta', () => {
  // Si mañana alguien agrega una categoría «M», el riesgo es que se cuele como facturada.
  const { porMes, afuera } = ventasFacturadasPorMes([fila('M', '02/12/2025', '$ 9.520.000,00')])
  assert.deepEqual(porMes, {}, 'sólo entra lo que está explícitamente marcado como facturado')
  assert.equal(afuera.sinFactura, 1)
})

test('la marca se compara sin distinguir mayúsculas ni espacios', () => {
  const { porMes } = ventasFacturadasPorMes([fila(' b ', '02/12/2025', '$ 1.000.000,00')])
  assert.equal(porMes['2025-12'], 1000000)
})

test('una fecha ilegible no se cuela en un mes cualquiera', () => {
  const { porMes, afuera } = ventasFacturadasPorMes([fila('B', 'dic-25', '$ 9.520.000,00')])
  assert.deepEqual(porMes, {})
  assert.equal(afuera.sinFecha, 1)
})

test('la constante nombra la marca real del Sheet', () => {
  assert.equal(CATEGORIA_FACTURADA, 'B')
})

test('proporción real medida: N es el 38% de Cobranzas y no puede sumar', () => {
  // Las cifras del archivo el 03/09/2026, redondeadas a la fila representativa de cada categoría.
  const { porMes } = ventasFacturadasPorMes([
    fila('B', '01/08/2026', '$ 131.926.540,00'),
    fila('N', '01/08/2026', '$ 127.950.975,00'),
  ])
  assert.equal(porMes['2026-08'], 131926540, 'agosto/26 es casi mitad y mitad: ahí el desvío se vuelve grosero')
})

// ── EL PUENTE AL LIBRO ──────────────────────────────────────────────────────────
// El débito proyectado se arma de `_MOVIMIENTOS`, que guarda la pestaña y la fila de origen pero
// NO la categoría. `filasFacturadas` es lo que permite descartar del IVA lo que no lleva factura
// sin sacarlo de la caja: el cobro entró, la plata es real; lo que no existe es su IVA.

import { filasFacturadas } from './impuestos-fuentes.mjs'

test('devuelve el número de fila REAL del Sheet, no el índice del array', () => {
  const { facturadas } = filasFacturadas([['B'], ['N'], ['B']])
  assert.deepEqual([...facturadas].sort((a, b) => a - b), [5, 7], 'la primera fila de datos es la 5')
})

test('una fila N no queda facturada — es el cobro de $291.473.901 que inflaba el débito', () => {
  const { facturadas, sinFactura } = filasFacturadas([['N'], ['N']])
  assert.equal(facturadas.size, 0)
  assert.equal(sinFactura, 2)
})

test('las filas vacías del rango abierto no se cuentan como «sin categoría»', () => {
  const { sinCategoria } = filasFacturadas([['B'], [], [], []])
  assert.equal(sinCategoria, 0, 'el fondo del rango no es un dato sin clasificar')
})

test('una fila CON datos pero sin categoría sí se cuenta: es un hueco real', () => {
  const { sinCategoria, facturadas } = filasFacturadas([['B'], ['', '02/12/2025']])
  assert.equal(sinCategoria, 1)
  assert.equal(facturadas.has(6), false, 'sin categoría no se asume facturada')
})

test('respeta un primer renglón distinto del 5', () => {
  const { facturadas } = filasFacturadas([['B']], 100)
  assert.deepEqual([...facturadas], [100])
})
