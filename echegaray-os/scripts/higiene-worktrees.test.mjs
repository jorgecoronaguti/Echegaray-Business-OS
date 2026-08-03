import { test } from 'node:test'
import assert from 'node:assert/strict'
import { clasificar, parsearWorktrees, ramasMergeadas } from './higiene-worktrees.mjs'

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

test('lo que NO SE PUDO VERIFICAR no se borra: falla cerrado', () => {
  // git falla (permisos, lock, timeout) → `null`. Antes eso llegaba como 0 y quedaba
  // indistinguible de "confirmado limpio", o sea elegible para borrar.
  assert.equal(clasificar({ esPrincipal: false, sucios: null, mergeada: true }), 'NO SE PUDO VERIFICAR')
  assert.equal(clasificar({ esPrincipal: false, sucios: undefined, mergeada: false }), 'NO SE PUDO VERIFICAR')
})

test('ramasMergeadas saca el `+` de las ramas checkeadas en otro worktree', () => {
  // git marca con `+` toda rama que está en OTRO worktree — o sea, todas las que nos importan.
  // Sacando sólo el `*`, "SEGURO DE ELIMINAR" era código muerto: nunca matcheaba ninguna.
  const salida = ['  main', '* feat/actual', '+ feat/en-otro-worktree', '+ audit/x'].join('\n')
  const s = ramasMergeadas(salida)
  assert.ok(s.has('feat/en-otro-worktree'), 'el `+` tiene que salir')
  assert.ok(s.has('audit/x'))
  assert.ok(s.has('feat/actual'), 'el `*` también')
  assert.ok(s.has('main'))
  assert.ok(!s.has('+ feat/en-otro-worktree'))
})

test('ramasMergeadas sobre una salida fallida devuelve conjunto vacío, no rompe', () => {
  assert.equal(ramasMergeadas(null).size, 0)
  assert.equal(ramasMergeadas('').size, 0)
})
