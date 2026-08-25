import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mensajeDeAuth } from './mensajeDeAuth.ts'

test('el error típico de credenciales sale en español y sin la frase de Supabase', () => {
  const m = mensajeDeAuth('Invalid login credentials')
  assert.equal(m, 'Usuario o contraseña incorrectos.')
  assert.doesNotMatch(m, /invalid/i)
})

test('un error desconocido se muestra en español sin perder el detalle', () => {
  assert.equal(mensajeDeAuth('Something odd'), 'No se pudo completar: Something odd')
  assert.equal(mensajeDeAuth(''), 'No se pudo completar. Probá de nuevo.')
})

test('cada error conocido tiene su frase', () => {
  assert.match(mensajeDeAuth('Email not confirmed'), /confirmado/)
  assert.match(mensajeDeAuth('Request rate limit reached'), /intentos/)
  assert.match(mensajeDeAuth('fetch failed'), /servidor/)
})
