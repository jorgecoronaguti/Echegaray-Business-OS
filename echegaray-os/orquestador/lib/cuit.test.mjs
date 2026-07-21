import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizar, digitoVerificador, valido, tipo, formatear, extraer, analizar } from './cuit.mjs'

// Los tres CUIT reales que aparecen en el extracto del Santander del 21/07.
const BALANZ = '30710630670'   // Balanz Capital Valores S.A.U. — el rescate de $11.913.568
const AFIP = '30716304643'     // el que figura en los débitos automáticos

test('valida los CUIT reales del extracto', () => {
  assert.equal(valido(BALANZ), true)
  assert.equal(valido(AFIP), true)
})

test('un typo NO pasa: es lo que evita salir a buscar una empresa que no existe', () => {
  // El mismo CUIT de Balanz con el último dígito cambiado.
  assert.equal(valido('30710630671'), false)
  const a = analizar('30710630671')
  assert.match(a.problema, /debería terminar en 0/)
})

test('el dígito verificador se calcula, no se adivina', () => {
  assert.equal(digitoVerificador('3071063067'), 0)
  assert.equal(digitoVerificador('123'), null, 'sin 10 dígitos no hay verificador')
})

test('el prefijo dice si es persona o sociedad, sin consultar nada', () => {
  assert.equal(tipo(BALANZ), 'persona jurídica')
  assert.equal(tipo('20123456783'), 'persona física')
  assert.equal(tipo('50000000016'), 'caso especial')
  assert.equal(tipo('nada'), null)
})

test('normaliza y formatea como lo escribe un documento argentino', () => {
  assert.equal(normalizar('30-71063067-0'), BALANZ)
  assert.equal(normalizar('30 71063067 0'), BALANZ)
  assert.equal(normalizar('307106306'), '', 'diez dígitos no son un CUIT')
  assert.equal(formatear(BALANZ), '30-71063067-0')
})

test('encuentra el CUIT dentro del concepto del extracto', () => {
  assert.deepEqual(extraer('Transferencia Recibida - Credin - Cuit 30710630670'), [BALANZ])
  assert.deepEqual(extraer('Debito Automatico - Afip -30716304643'), [AFIP])
  assert.deepEqual(extraer('30-71063067-0'), [BALANZ])
})

test('once dígitos cualesquiera NO son un CUIT', () => {
  // En un concepto bancario hay números de cheque, de lote y de CBU. Si el dígito verificador no
  // cierra, no se devuelve: un falso positivo mandaría al OS a buscar una razón social inventada.
  assert.deepEqual(extraer('Echeq Clearing 12345678901 recibido'), [])
})

test('no repite un CUIT que aparece dos veces en el mismo texto', () => {
  assert.deepEqual(extraer(`pago a ${BALANZ} y de nuevo ${BALANZ}`), [BALANZ])
})
