// EL VEREDICTO DEL HOOK TIENE QUE CADUCAR CUANDO CAMBIA EL CÓDIGO.
//
// El 28/08/2026 el hook sirvió SEIS veces el mismo fallo cacheado —byte por byte, mismos PIDs y
// mismos 16844.034634 ms— mientras `npm run orq:test` corría en verde. La huella se calculaba sólo
// con el contenido de los archivos SIN COMMITEAR, y el único que había era uno que no se tocó en
// todo el día; entretanto el árbol pasó por ocho merges. Un veredicto sobre el código que no caduca
// cuando el código cambia entrena a ignorar el rojo, que es lo único que este hook existe para evitar.
import test from 'node:test'
import assert from 'node:assert/strict'
import { esRojoDelAmbiente, huella, tomarCerrojo, recordarVerde, yaVerde, yaRojoIgual, VERDES_MAX } from './validar-cierre.mjs'

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

// ═══ SÓLO LO QUE CAMBIÓ EN LA SESIÓN (26/09) ═══
test('lo sucio de antes de la sesión no se valida; lo tocado o nuevo sí', async () => {
  const { deLaSesion } = await import('./validar-cierre.mjs')
  const fichas = { '/a.mjs': '1:10', '/b.mjs': '2:20', '/c.mjs': '3:30' }
  const lineaBase = { '/a.mjs': '1:10', '/b.mjs': '1:20' }
  const r = deLaSesion(Object.keys(fichas), lineaBase, (f) => fichas[f])
  assert.deepEqual(r, ['/b.mjs', '/c.mjs'], 'a no cambió; b se editó; c es nuevo')
})

test('sin línea base se valida todo lo sucio (worktree de un agente)', async () => {
  const { deLaSesion } = await import('./validar-cierre.mjs')
  assert.deepEqual(deLaSesion(['/a.mjs'], null, () => 'x'), ['/a.mjs'])
})

// ═══ EL CIERRE PRUEBA EL CAMBIO, NO LA SUITE (26/09) ═══
test('tests del cambio: el hermano .test.mjs si existe, el propio test, sin duplicar', async () => {
  const { testsDelCambio } = await import('./validar-cierre.mjs')
  const hay = new Set(['/o/a.test.mjs', '/o/b.test.mjs'])
  const r = testsDelCambio(['/o/a.mjs', '/o/a.test.mjs', '/o/b.test.mjs', '/o/sin-test.mjs'], (f) => hay.has(f))
  assert.deepEqual(r, ['/o/a.test.mjs', '/o/b.test.mjs'])
})

test('la huella es el CONTENIDO: un touch no la cambia, un byte sí (29/09)', async () => {
  const { mkdtempSync, writeFileSync: w, utimesSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const f = `${mkdtempSync(`${tmpdir()}/vc-`)}/a.mjs`
  w(f, 'export const a = 1\n')
  const h1 = huella([f], '/')
  utimesSync(f, new Date(), new Date(Date.now() + 5000))
  assert.equal(huella([f], '/'), h1, 'cambiar sólo el mtime no invalida el verde')
  w(f, 'export const a = 2\n')
  assert.notEqual(huella([f], '/'), h1, 'cambiar el contenido sí')
})

test('los verdes se recuerdan: volver a un estado ya validado no corre de nuevo', () => {
  let c = recordarVerde({}, 'A')
  c = recordarVerde(c, 'B')
  assert.ok(yaVerde(c, 'A') && yaVerde(c, 'B'))
  assert.ok(!yaVerde(c, 'C'))
  for (let i = 0; i < VERDES_MAX + 5; i++) c = recordarVerde(c, `x${i}`)
  assert.equal(c.verdes.length, VERDES_MAX, 'la lista tiene tope')
  assert.ok(!yaVerde(c, 'A'), 'lo más viejo se olvida')
  assert.ok(yaVerde({ ok: true, huella: 'Z' }, 'Z'), 'la caché del formato viejo sigue valiendo')
})

test('cerrojo: un segundo cierre vivo no corre; uno huérfano se retoma', async () => {
  const { mkdtempSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const ruta = `${mkdtempSync(`${tmpdir()}/vc-`)}/validando.pid`
  assert.equal(tomarCerrojo(ruta, 111, () => true), true, 'el primero lo toma')
  assert.equal(tomarCerrojo(ruta, 222, () => true), false, 'con el dueño vivo, el segundo no')
  assert.equal(tomarCerrojo(ruta, 222, () => false), true, 'con el dueño muerto, se retoma')
})

test('«sin recursos» no dispara la antirrecursión: se vuelve a intentar', () => {
  assert.equal(yaRojoIgual({ ok: false, huella: 'H', detalle: 'x' }, 'H'), true, 'un rojo real igual no se repite')
  assert.equal(yaRojoIgual({ ok: false, sinRecursos: true, huella: 'H' }, 'H'), false, 'sin recursos se reintenta')
  assert.equal(yaRojoIgual({ ok: false, huella: 'H' }, 'H2'), false, 'código nuevo se valida')
})
