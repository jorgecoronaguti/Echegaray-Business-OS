import { test } from 'node:test'
import assert from 'node:assert/strict'
import { clasificar, parsearWorktrees } from './higiene-worktrees.mjs'

test('lo sucio NUNCA es borrable, ni aunque la rama esté mergeada', () => {
  // La condición que protege el trabajo del dueño. Si esto se afloja, el script pierde código.
  assert.equal(clasificar({ esPrincipal: false, sucios: 1, mergeada: true }), 'CON TRABAJO SIN GUARDAR')
  assert.equal(clasificar({ esPrincipal: false, sucios: 14, mergeada: true }), 'CON TRABAJO SIN GUARDAR')
})

test('el árbol principal jamás se clasifica como borrable', () => {
  assert.equal(clasificar({ esPrincipal: true, sucios: 0, mergeada: true }), 'PRINCIPAL')
})

test('limpio + mergeado es el único caso del nivel 1', () => {
  assert.equal(clasificar({ esPrincipal: false, sucios: 0, mergeada: true }), 'SEGURO DE ELIMINAR')
})

test('limpio sin mergear se conserva por defecto', () => {
  assert.equal(clasificar({ esPrincipal: false, sucios: 0, mergeada: false }), 'LIMPIO, RAMA SIN MERGEAR')
})

test('parsea la salida porcelain, incluido el detached', () => {
  const salida = [
    'worktree /home/x/app', 'HEAD abc1234def5678', 'branch refs/heads/main', '',
    'worktree /home/x/app/.claude/worktrees/uno', 'HEAD 999888777666', 'branch refs/heads/feat/uno', '',
    'worktree /home/x/app/.claude/worktrees/dos', 'HEAD 111222333444', 'detached', '',
  ].join('\n')
  const wts = parsearWorktrees(salida)
  assert.equal(wts.length, 3)
  assert.equal(wts[0].rama, 'main')
  assert.equal(wts[1].rama, 'feat/uno')
  assert.equal(wts[1].commit, '9998887')
  assert.equal(wts[2].rama, null)
  assert.equal(wts[2].detached, true)
})

test('una salida vacía no inventa worktrees', () => {
  assert.deepEqual(parsearWorktrees(''), [])
})
