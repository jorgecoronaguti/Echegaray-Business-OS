import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { armarInicio, recortar, baseDeTrabajo } from './estado-sesion.mjs'

const RUTA = fileURLToPath(new URL('./estado-sesion.mjs', import.meta.url))

test('el árbol limpio se dice explícitamente, no se omite', () => {
  const txt = armarInicio({ rama: 'main', sucios: [], commits: 'abc123 algo', traspaso: '' })
  assert.match(txt, /el árbol está limpio/)
})

test('lista los archivos sucios pero no todos: 12 y corta', () => {
  const sucios = Array.from({ length: 40 }, (_, i) => `archivo-${i}.mjs`)
  const txt = armarInicio({ rama: 'x', sucios, commits: '', traspaso: '' })
  assert.match(txt, /sin commitear \(40\)/)
  assert.match(txt, /…/)
  assert.ok(!txt.includes('archivo-39.mjs'), 'no debe volcar los 40')
})

test('sin traspaso lo dice, no rellena con un resumen inventado', () => {
  const txt = armarInicio({ rama: 'main', sucios: [], commits: '', traspaso: '' })
  assert.match(txt, /No hay traspaso escrito/)
  assert.match(txt, /\/traspaso/)
})

test('con traspaso avisa que puede estar vencido', () => {
  const txt = armarInicio({
    rama: 'main', sucios: [], commits: '', traspaso: 'quedé a mitad del importador', fechaTraspaso: '2026-08-01',
  })
  assert.match(txt, /quedé a mitad del importador/)
  assert.match(txt, /2026-08-01/)
  assert.match(txt, /Puede estar vencido/)
})

test('recortar dice que recortó y dónde está el resto — nunca corta en silencio', () => {
  const largo = 'x'.repeat(5000)
  const r = recortar(largo, 100)
  assert.ok(r.length < 300)
  assert.match(r, /recortado/)
  assert.match(r, /traspaso\.md/)
  assert.equal(recortar('corto', 100), 'corto')
  assert.equal(recortar(''), '')
})

test('el bloque inyectado se mantiene barato: se paga en cada arranque', () => {
  const txt = armarInicio({
    rama: 'feat/algo', sucios: ['a.mjs', 'b.mjs'], commits: 'abc uno\ndef dos\nghi tres',
    traspaso: 'x'.repeat(9000), fechaTraspaso: '2026-08-03',
  })
  // ~3,6 chars por token: 2.600 chars ≈ 720 tokens con el traspaso ya recortado.
  assert.ok(txt.length < 2600, `el bloque mide ${txt.length} chars, es demasiado para cada arranque`)
})

test('baseDeTrabajo encuentra el proyecto un nivel abajo (el caso de los worktrees)', () => {
  // En los worktrees de este repo la raíz NO tiene package.json: el proyecto cuelga de
  // `echegaray-os/`. Es el defecto que ya arrastra validar-cierre.mjs y que acá no se repite.
  const existe = (p) => p === '/wt/rama/echegaray-os/package.json'
  assert.equal(baseDeTrabajo('/wt/rama', existe), '/wt/rama/echegaray-os')
})

test('baseDeTrabajo prefiere el cwd cuando el cwd ya es el proyecto', () => {
  const existe = (p) => p === '/proy/package.json' || p === '/proy/echegaray-os/package.json'
  assert.equal(baseDeTrabajo('/proy', existe), '/proy')
})

test('SessionStart emite JSON válido con el evento correcto', () => {
  const salida = execFileSync('node', [RUTA], { input: '{}', encoding: 'utf8' })
  const j = JSON.parse(salida)
  assert.equal(j.hookSpecificOutput.hookEventName, 'SessionStart')
  assert.match(j.hookSpecificOutput.additionalContext, /estado de sesión/)
})

test('SessionEnd no escribe nada en stdout y no rompe', () => {
  const salida = execFileSync('node', [RUTA, '--fin'], { input: '{}', encoding: 'utf8' })
  assert.equal(salida.trim(), '')
})

test('el techo es del TOTAL inyectado, no sólo del traspaso', () => {
  // Lo midió una auditoría: recortaba el traspaso a 2.000 y le sumaba encabezado, rama, commits y
  // sucios ENCIMA — total real 2.319. El techo publicado describe lo que se paga, así que mentía.
  const txt = armarInicio({
    rama: 'feat/una-rama-con-nombre-bastante-largo',
    sucios: Array.from({ length: 12 }, (_, i) => `orquestador/lib/archivo-largo-${i}.mjs`),
    commits: ['abc1234 un commit con un asunto largo de verdad',
      'def5678 otro commit igual de largo que el anterior',
      'ghi9012 y un tercero para completar el bloque'].join('\n'),
    traspaso: 'x'.repeat(500000),
    fechaTraspaso: '2026-08-03',
  })
  assert.ok(txt.length <= 2000, `el bloque mide ${txt.length} chars y el techo prometido es 2.000`)
  assert.match(txt, /recortado/)
})

test('aun con el presupuesto agotado se muestra algo del traspaso', () => {
  const txt = armarInicio({
    rama: 'r', sucios: Array.from({ length: 400 }, (_, i) => `archivo-${i}.mjs`),
    commits: 'x'.repeat(3000), traspaso: 'lo importante del traspaso'.repeat(50),
  })
  assert.match(txt, /traspaso de la sesión anterior/)
  assert.ok(txt.includes('lo importante'), 'no puede quedarse sin nada del traspaso')
})
