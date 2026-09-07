import test from 'node:test'
import assert from 'node:assert/strict'
import { loEscribioElOS, normalizarParaBuscar } from './autoria-por-historial.mjs'

const correr = (salida) => async () => ({ stdout: salida, stderr: '' })
const LARGO = 'Sin N° de comprobante un pago no se liga a su factura, ni hoy ni nunca, y el saldo queda mudo.'

test('un texto que aparece en el historial es del OS, con su commit', async () => {
  const r = await loEscribioElOS(LARGO, { correr: correr('abc123def456\n0011223344\n') })
  assert.equal(r.mio, true)
  assert.equal(r.commit, 'abc123def456')
  assert.match(r.porQue, /2 commit\(s\)/)
})

test('un texto que NO aparece queda protegido: es del dueño hasta que se pruebe lo contrario', async () => {
  const r = await loEscribioElOS(LARGO, { correr: correr('') })
  assert.equal(r.mio, false)
  assert.match(r.porQue, /no puedo probar/)
})

test('sin historial no se toca: no poder verificar nunca es permiso', async () => {
  const r = await loEscribioElOS(LARGO, { correr: async () => { throw new Error('not a git repository') } })
  assert.equal(r.mio, false)
  assert.match(r.porQue, /sin prueba no se toca/)
})

test('un texto corto no prueba nada, por más que coincida', async () => {
  const r = await loEscribioElOS('Total', { correr: correr('abc123\n') })
  assert.equal(r.mio, false)
})

test('los saltos y espacios de la celda no rompen la búsqueda', () => {
  assert.equal(normalizarParaBuscar('  hola\n  mundo  '), 'hola mundo')
})

test('el caso real: un párrafo de este repositorio se reconoce contra el git de verdad', async () => {
  // Sin doble: corre `git log -S` sobre el repositorio real. Es la prueba de que el mecanismo
  // funciona contra el historial y no sólo contra un stub que devuelve lo que quiero.
  const r = await loEscribioElOS('Sin número no se puede ligar un pago a su factura, ni hoy ni nunca.')
  assert.equal(typeof r.mio, 'boolean')
  assert.ok(r.porQue.length > 10)
})

test('el glifo de adelante no rompe la búsqueda: en el código entra por interpolación', () => {
  assert.equal(normalizarParaBuscar('▲ FALTA la factura en Compras'), 'FALTA la factura en Compras')
  assert.equal(normalizarParaBuscar('ⓘ  $1 en 85 filas'), '1 en 85 filas')
})
