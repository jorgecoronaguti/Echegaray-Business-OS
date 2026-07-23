import test from 'node:test'
import assert from 'node:assert/strict'
import { respetarEdiciones, detectarEdiciones, esRotulo } from './respetar-ediciones.mjs'
import { VACIO } from './preservar-anotaciones.mjs'

test('un rótulo es texto: no una fórmula, no un número, no un importe escrito', () => {
  assert.ok(esRotulo('Deuda previsional en cuotas'))
  assert.ok(esRotulo('⇒ Total pagado'))
  assert.ok(!esRotulo('=SUM(B1:B9)'))
  assert.ok(!esRotulo(1234))
  assert.ok(!esRotulo('$1.234.567'))
  assert.ok(!esRotulo('2,00%'))
  assert.ok(!esRotulo(''))
  assert.ok(!esRotulo(VACIO), 'el centinela del generador no es un rótulo')
})

test('detecta la edición porque MI texto ya no está en la pestaña', () => {
  const mios = ['Deuda previsional en cuotas', 'F931']
  const actual = [['Plan de pago ARCA', 100], ['F931', 200]]
  const e = detectarEdiciones(mios, actual)
  assert.equal(e.size, 1)
  assert.ok(e.has('Deuda previsional en cuotas'))
})

test('si mi texto se MOVIÓ de fila, no es una edición', () => {
  // Es exactamente el caso que rompió la primera versión: comparaba por posición, y una fila de más
  // corría todo el registro un renglón y "respetaba" la celda equivocada. Dejó CAJA con un importe
  // pegado donde iba el título "DISPONIBILIDADES".
  const mios = ['Total pagado']
  const actual = [['otra cosa'], ['más cosas'], ['Total pagado']]
  assert.equal(detectarEdiciones(mios, actual).size, 0)
})

test('respeta la edición esté donde esté la fila', () => {
  const ediciones = new Map([['Deuda previsional en cuotas', 'Plan de pago ARCA']])
  const { grid, respetadas } = respetarEdiciones(
    [['algo'], ['Deuda previsional en cuotas', 100]], [['algo'], ['Plan de pago ARCA', 100]], ediciones)
  assert.equal(grid[1][0], 'Plan de pago ARCA')
  assert.equal(respetadas.length, 1)
})

test('UNA ELIMINACIÓN TAMBIÉN ES UNA DECISIÓN: vacío gana', () => {
  const { grid } = respetarEdiciones([['Lo que falta saber']], [['']], new Map([['Lo que falta saber', '']]))
  assert.equal(grid[0][0], '')
})

test('si el dueño vuelve atrás, el generador retoma su versión', () => {
  const ediciones = new Map([['Total pagado', 'Salidas']])
  const { grid, respetadas } = respetarEdiciones([['Total pagado']], [['Total pagado']], ediciones)
  assert.equal(grid[0][0], 'Total pagado')
  assert.equal(respetadas.length, 0)
})

test('sin nada registrado, el generador escribe lo suyo', () => {
  const { grid, respetadas } = respetarEdiciones([['Concepto']], [['Otra cosa']], new Map())
  assert.equal(grid[0][0], 'Concepto')
  assert.equal(respetadas.length, 0)
})

test('el importe y la fórmula NO se respetan: son la respuesta que la pestaña calcula', () => {
  const { grid } = respetarEdiciones([['Total', '=SUM(A1:A9)']], [['Total', '12345']], new Map([['12345', '999']]))
  assert.equal(grid[0][1], '=SUM(A1:A9)')
})

test('el apóstrofo que fuerza texto no cuenta como una edición', () => {
  // Sheets guarda "'ene-26" y devuelve "ene-26": sin normalizarlo, cada encabezado de mes parecería
  // editado en cada corrida y la regla los congelaría.
  assert.equal(detectarEdiciones(["'ene-26"], [['ene-26']]).size, 0)
})
