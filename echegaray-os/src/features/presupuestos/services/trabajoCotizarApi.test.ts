// EL CLIENTE DEL JOB — lo que se puede probar sin navegador: qué archivo se rechaza y por qué.

import test from 'node:test'
import assert from 'node:assert/strict'
import { archivoValido, tamanoLegible } from './trabajoCotizarApi.ts'

test('tamanoLegible: bytes en KB, y pasa a MB arriba del megabyte', () => {
  assert.equal(tamanoLegible(2048), '2 KB')
  assert.equal(tamanoLegible(3 * 1024 * 1024), '3.0 MB')
})

test('archivoValido: un PDF de tamaño normal pasa', () => {
  assert.equal(archivoValido({ name: 'B-01.pdf', size: 500_000 }, 0), null)
})

test('archivoValido: rechaza extensión no soportada CON MOTIVO, no en silencio', () => {
  const motivo = archivoValido({ name: 'nota.zip', size: 1000 }, 0)
  assert.match(motivo ?? '', /formato no soportado/)
})

test('archivoValido: rechaza un archivo que pesa más del tope y dice cuánto pesa', () => {
  const motivo = archivoValido({ name: 'plano.dwg', size: 30 * 1024 * 1024 }, 0)
  assert.match(motivo ?? '', /pesa 30\.0 MB/)
})

test('archivoValido: el tope de archivos por trabajo se respeta', () => {
  const motivo = archivoValido({ name: 'otro.pdf', size: 1000 }, 12)
  assert.match(motivo ?? '', /ya hay 12 archivos/)
})
