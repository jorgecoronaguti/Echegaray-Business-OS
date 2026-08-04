import test from 'node:test'
import assert from 'node:assert/strict'
import { tramoDeLaFila, formulaAging, TRAMOS, SIN_FECHA, COL } from './proveedores-aging.mjs'

const HOY = new Date('2026-08-04T00:00:00Z')
const enDias = (n) => new Date(HOY.getTime() + n * 86400000)

test('una fila sin saldo no tiene tramo: ya se pagó, no vence nada', () => {
  assert.equal(tramoDeLaFila({ saldo: 0, fechaPago: enDias(-90) }, HOY), '')
  assert.equal(tramoDeLaFila({ saldo: -5000, fechaPago: enDias(3) }, HOY), '')
  // menos de un peso redondea a cero: no es deuda, es residuo de coma flotante
  assert.equal(tramoDeLaFila({ saldo: 0.4, fechaPago: enDias(3) }, HOY), '')
})

test('con saldo y sin fecha cae en su propio tramo, no se lo esconde', () => {
  assert.equal(tramoDeLaFila({ saldo: 100, fechaPago: null }, HOY), SIN_FECHA)
  assert.equal(tramoDeLaFila({ saldo: 100, fechaPago: new Date('x') }, HOY), SIN_FECHA)
})

test('los bordes de cada tramo', () => {
  assert.equal(tramoDeLaFila({ saldo: 1, fechaPago: enDias(-1) }, HOY), '1 · Vencido')
  assert.equal(tramoDeLaFila({ saldo: 1, fechaPago: enDias(0) }, HOY), '2 · Vence esta semana')
  assert.equal(tramoDeLaFila({ saldo: 1, fechaPago: enDias(7) }, HOY), '2 · Vence esta semana')
  assert.equal(tramoDeLaFila({ saldo: 1, fechaPago: enDias(8) }, HOY), '3 · 8 a 30 días')
  assert.equal(tramoDeLaFila({ saldo: 1, fechaPago: enDias(30) }, HOY), '3 · 8 a 30 días')
  assert.equal(tramoDeLaFila({ saldo: 1, fechaPago: enDias(31) }, HOY), '4 · 31 a 60 días')
  assert.equal(tramoDeLaFila({ saldo: 1, fechaPago: enDias(60) }, HOY), '4 · 31 a 60 días')
  assert.equal(tramoDeLaFila({ saldo: 1, fechaPago: enDias(61) }, HOY), '5 · Más de 60 días')
})

test('el vencido de hoy NO es "vence esta semana": vencer es antes de hoy', () => {
  // El día del vencimiento todavía se puede pagar. Contarlo como vencido inflaría lo urgente.
  assert.equal(tramoDeLaFila({ saldo: 1, fechaPago: HOY }, HOY), '2 · Vence esta semana')
})

test('los rótulos ordenan alfabéticamente igual que cronológicamente', () => {
  const rotulos = [...TRAMOS.map((t) => t.rotulo), SIN_FECHA]
  assert.deepEqual([...rotulos].sort(), rotulos)
})

test('la fórmula va en locale es-AR y nunca con comas de separador', () => {
  const f = formulaAging()
  assert.match(f, /^=ARRAYFORMULA\(/)
  assert.equal(f.split('(').length, f.split(')').length, 'paréntesis desbalanceados')
  // Una coma sólo puede aparecer dentro de un rótulo, jamás separando argumentos.
  const sinRotulos = f.replace(/"[^"]*"/g, '""')
  assert.ok(!sinRotulos.includes(','), `la fórmula usa coma como separador: ${sinRotulos}`)
})

test('la fórmula descarta las filas sin saldo antes de mirar la fecha', () => {
  const f = formulaAging()
  assert.ok(f.indexOf('ROUND($AL$4:$AL;0)<=0') < f.indexOf('TODAY()'),
    'si mira la fecha primero, una factura pagada entra al aging')
})

test('la fórmula nombra los seis tramos', () => {
  const f = formulaAging()
  for (const r of [...TRAMOS.map((t) => t.rotulo), SIN_FECHA]) assert.ok(f.includes(`"${r}"`), r)
})

test('la columna del aging va después de todo lo que hoy existe en Compras', () => {
  // AM = CUIT (OS) = 38. Escribir sobre una columna existente pisaría datos del dueño.
  assert.equal(COL.aging, 39)
  assert.ok(COL.aging > COL.saldo)
})
