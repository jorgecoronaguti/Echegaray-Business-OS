import test from 'node:test'
import assert from 'node:assert/strict'
import { loQueFalta } from './preparar-worktree.mjs'

test('un node_modules que es SYMLINK cuenta como faltante: Turbopack lo rechaza', () => {
  const falta = loQueFalta('/w', { existe: () => true, symlink: (p) => p.endsWith('node_modules') })
  assert.deepEqual(falta, [{ que: 'node_modules', motivo: 'es un symlink y Turbopack lo rechaza' }])
})

test('un node_modules REAL no cuenta como faltante', () => {
  assert.deepEqual(loQueFalta('/w', { existe: () => true, symlink: () => false }), [])
})

test('sin node_modules y sin .env.local faltan los dos', () => {
  const falta = loQueFalta('/w', { existe: () => false, symlink: () => false })
  assert.deepEqual(falta.map((f) => f.que), ['node_modules', '.env.local'])
})

test('el .env.local sí puede ser un symlink: sólo lo lee Node, no Turbopack', () => {
  const falta = loQueFalta('/w', { existe: (p) => p.endsWith('.env.local'), symlink: () => false })
  assert.deepEqual(falta.map((f) => f.que), ['node_modules'])
})
