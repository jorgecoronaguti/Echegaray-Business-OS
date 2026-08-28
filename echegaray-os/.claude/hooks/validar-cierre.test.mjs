// EL VEREDICTO DEL HOOK TIENE QUE CADUCAR CUANDO CAMBIA EL CÓDIGO.
//
// El 28/08/2026 el hook sirvió SEIS veces el mismo fallo cacheado —byte por byte, mismos PIDs y
// mismos 16844.034634 ms— mientras `npm run orq:test` corría en verde. La huella se calculaba sólo
// con el contenido de los archivos SIN COMMITEAR, y el único que había era uno que no se tocó en
// todo el día; entretanto el árbol pasó por ocho merges. Un veredicto sobre el código que no caduca
// cuando el código cambia entrena a ignorar el rojo, que es lo único que este hook existe para evitar.
import test from 'node:test'
import assert from 'node:assert/strict'
import { esRojoDelAmbiente, huella } from './validar-cierre.mjs'

test('la huella cambia cuando cambia el commit, aunque los archivos sueltos sean los mismos', () => {
  const base = process.env.CLAUDE_PROJECT_DIR || process.cwd()
  const h = huella([], base)
  assert.ok(h.length > 0, 'con git, HEAD solo ya es una huella')
  // Dos bases distintas (una sin git) no pueden dar la misma huella con los mismos archivos.
  assert.notEqual(h, huella([], '/'), 'la huella tiene que depender del árbol, no sólo de los archivos')
})

test('sin git la huella se degrada, no se rompe', () => {
  assert.equal(huella([], '/'), '', 'sin repo y sin archivos no hay nada que fichar, y no tira')
  assert.doesNotThrow(() => huella(['/no/existe/x.mjs'], '/'))
  assert.match(huella(['/no/existe/x.mjs'], '/'), /no\/existe\/x\.mjs:0/, 'un archivo ausente ficha como 0')
})

// ═══ QUÉ ROJO ES DEL CÓDIGO Y CUÁL DEL AMBIENTE ═══
test('un choque entre dos corridas no es un veredicto sobre el código', () => {
  assert.equal(esRojoDelAmbiente('error: deadlock detected'), true)
  assert.equal(esRojoDelAmbiente('code: 40P01'), true)
  assert.equal(esRojoDelAmbiente('connect ECONNREFUSED 127.0.0.1:5432'), true)
  assert.equal(esRojoDelAmbiente('sorry, too many clients already'), true)
})

// ═══ EL TEST NEGATIVO: ESTE CONTROL PUEDE DAR ROJO ═══
//
// Si `esRojoDelAmbiente` devolviera siempre true, NINGÚN fallo se guardaría y el hook dejaría de
// bloquear un cierre roto — que es exactamente lo contrario de para lo que existe.
test('un fallo de verdad NO se disfraza de ambiente', () => {
  assert.equal(esRojoDelAmbiente('✖ el saldo publicado no coincide con el libro'), false)
  assert.equal(esRojoDelAmbiente('AssertionError: 5174 !== 6348'), false)
  assert.equal(esRojoDelAmbiente('SyntaxError: does not provide an export named'), false)
  assert.equal(esRojoDelAmbiente(''), false)
  assert.equal(esRojoDelAmbiente(null), false)
  assert.equal(esRojoDelAmbiente(undefined), false)
})
