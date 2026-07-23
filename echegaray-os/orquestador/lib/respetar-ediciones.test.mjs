import test from 'node:test'
import assert from 'node:assert/strict'
import { respetarEdiciones, esRotulo } from './respetar-ediciones.mjs'

test('un rótulo es texto: no una fórmula, no un número, no un importe escrito', () => {
  assert.ok(esRotulo('Deuda previsional en cuotas'))
  assert.ok(esRotulo('⇒ Total pagado'))
  assert.ok(!esRotulo('=SUM(B1:B9)'))
  assert.ok(!esRotulo(1234))
  assert.ok(!esRotulo('$1.234.567'))
  assert.ok(!esRotulo('2,00%'))
  assert.ok(!esRotulo(''))
})

test('si la persona reescribió un rótulo, gana el suyo', () => {
  const generado = [['Deuda previsional en cuotas', 100]]
  const actual = [['Plan de pago ARCA', 100]]
  const registro = new Map([['1:1', 'Deuda previsional en cuotas']])
  const { grid, respetadas } = respetarEdiciones(generado, actual, registro)
  assert.equal(grid[0][0], 'Plan de pago ARCA')
  assert.equal(respetadas.length, 1)
  assert.deepEqual(respetadas[0], { fila: 1, col: 1, mio: 'Deuda previsional en cuotas', suyo: 'Plan de pago ARCA' })
})

test('UNA ELIMINACIÓN TAMBIÉN ES UNA DECISIÓN: si la vació, queda vacía', () => {
  const registro = new Map([['1:1', 'Lo que falta saber']])
  const { grid, respetadas } = respetarEdiciones([['Lo que falta saber']], [['']], registro)
  assert.equal(grid[0][0], '')
  assert.equal(respetadas.length, 1)
})

test('si nadie la tocó, el generador escribe su versión nueva', () => {
  const registro = new Map([['1:1', 'Título viejo']])
  const { grid, respetadas } = respetarEdiciones([['Título nuevo']], [['Título viejo']], registro)
  assert.equal(grid[0][0], 'Título nuevo')
  assert.equal(respetadas.length, 0)
})

test('el importe y la fórmula NO se respetan: son la respuesta que la pestaña calcula', () => {
  const registro = new Map([['1:2', '999']])
  const { grid } = respetarEdiciones([['Total', '=SUM(A1:A9)']], [['Total', '12345']], registro)
  assert.equal(grid[0][1], '=SUM(A1:A9)', 'una fórmula pisada a mano se devuelve a su fórmula')
})

test('en la primera corrida no hay memoria, así que escribe y recién después recuerda', () => {
  const { grid, respetadas } = respetarEdiciones([['Concepto']], [['Otra cosa']], new Map())
  assert.equal(grid[0][0], 'Concepto')
  assert.equal(respetadas.length, 0)
})

test('si la pestaña ya dice lo mismo que voy a escribir, no hay nada que respetar', () => {
  const registro = new Map([['1:1', 'Viejo']])
  const { respetadas } = respetarEdiciones([['Nuevo']], [['Nuevo']], registro)
  assert.equal(respetadas.length, 0)
})

test('el centinela del generador no es un rótulo', async () => {
  const { VACIO } = await import('./preservar-anotaciones.mjs')
  assert.ok(!esRotulo(VACIO))
})

test('el apóstrofo que fuerza texto no cuenta como una edición de una persona', () => {
  // Sheets guarda "'ene-26" y devuelve "ene-26": sin normalizarlo, cada encabezado de mes parecería
  // editado en cada corrida y la regla los congelaría.
  const registro = new Map([['1:1', "'ene-26"]])
  const { grid, respetadas } = respetarEdiciones([["'ene-26"]], [['ene-26']], registro)
  assert.equal(respetadas.length, 0)
  assert.equal(grid[0][0], "'ene-26")
})
