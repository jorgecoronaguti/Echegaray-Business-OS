import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { armarInicio, recortar, baseDeTrabajo, armarBreve, traspasoVencido, momentoDelTraspaso, armarTraspasoAuto, ultimoPedido } from './estado-sesion.mjs'

const RUTA = fileURLToPath(new URL('./estado-sesion.mjs', import.meta.url))

test('el árbol limpio se dice explícitamente, no se omite', () => {
  const txt = armarInicio({ rama: 'main', sucios: [], commits: 'abc123 algo', traspaso: '' })
  assert.match(txt, /el árbol está limpio/)
})

test('lista los archivos sucios pero no todos: 4 y corta, para que el traspaso tenga lugar', () => {
  const sucios = Array.from({ length: 40 }, (_, i) => `archivo-${i}.mjs`)
  const txt = armarInicio({ rama: 'x', sucios, commits: '', traspaso: '' })
  assert.match(txt, /sin commitear \(40\)/)
  assert.match(txt, /…/)
  assert.ok(!txt.includes('archivo-39.mjs'), 'no debe volcar los 40')
  assert.ok(txt.includes('archivo-3.mjs') && !txt.includes('archivo-4.mjs'), 'muestra cuatro')
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

// ── 29/09/2026: arranque según `source` y traspaso breve del Stop ──
import { mkdtempSync, writeFileSync as escribir } from 'node:fs'
import { tmpdir } from 'node:os'
import { join as unir } from 'node:path'

test('resume/compact: estado + modo breve, sin traspaso, bajo 400 caracteres', () => {
  const t = armarBreve({ fuente: 'resume', rama: 'x', sucios: ['a', 'b'], head: 'abc1234' })
  assert.match(t, /\[estado · resume\] rama x · HEAD abc1234 · 2 sin commitear/)
  assert.ok(t.length < 400, `midió ${t.length}`)
})

test('traspaso de más de 48 h entra sólo por título y ruta; uno fresco entra entero', () => {
  const txt = '# TRASPASO — 26/09\n\nmucho texto\n'.repeat(20)
  const ahora = Date.parse('2026-09-29T12:00:00Z')
  const v = traspasoVencido(txt, Date.parse('2026-09-26T22:00:00Z'), ahora)
  assert.match(v, /^# TRASPASO — 26\/09\n\[vencido: 2 día\(s\)/)
  assert.ok(v.length < 150)
  assert.equal(traspasoVencido(txt, ahora - 3600_000, ahora), txt)
})

test('traspaso automático: sólo con commits nuevos o contexto alto, y bajo 900', () => {
  const base = { sesion: 's1', rama: 'r', sucios: 0, pedido: 'hacé X', aviso: 110_000, cuando: new Date('2026-09-29T12:00:00Z') }
  assert.equal(armarTraspasoAuto({ ...base, commits: [], contexto: 50_000 }), null)
  const c = armarTraspasoAuto({ ...base, commits: ['abc que hice'], contexto: 50_000 })
  assert.match(c, /commits de la sesión:\n- abc que hice/); assert.match(c, /último pedido: «hacé X»/)
  const g = armarTraspasoAuto({ ...base, commits: Array(9).fill('x'.repeat(95)), contexto: 130_000, pedido: 'p'.repeat(240) })
  assert.ok(g.length <= 900, `midió ${g.length}`)
})

test('último pedido: texto de la persona, sin etiquetas ni resultados de herramientas', () => {
  const d = mkdtempSync(unir(tmpdir(), 'es-'))
  const f = unir(d, 't.jsonl')
  escribir(f, [
    JSON.stringify({ type: 'user', message: { content: '<ide_selection>ruido</ide_selection> arreglá el recibo' } }),
    JSON.stringify({ type: 'assistant', message: { content: [] } }),
    JSON.stringify({ type: 'user', message: { content: [{ type: 'tool_result', content: 'salida' }] } }),
  ].join('\n'))
  assert.equal(ultimoPedido(f), 'arreglá el recibo')
})

test('la antigüedad del traspaso sale de su fecha escrita, no del mtime de un checkout nuevo', () => {
  const ahora = Date.parse('2026-09-29T19:36:00-03:00')
  const txt = '# TRASPASO — 26/09/2026 noche (sesión 2eaa7060)\n\ncuerpo largo'
  const m = momentoDelTraspaso(txt, ahora - 60_000)            // worktree recién creado
  assert.ok(ahora - m > 48 * 3600_000)
  assert.match(traspasoVencido(txt, m, ahora), /vencido: 2 día/)
  assert.equal(momentoDelTraspaso('fecha: 2026-09-29\nx', ahora), ahora)          // de hoy: manda el mtime
  assert.equal(momentoDelTraspaso('sin fecha', 123), 123)
})

test('una fecha vieja citada en el cuerpo no vence un traspaso reciente', () => {
  const ahora = Date.now()
  assert.equal(momentoDelTraspaso('# Traspaso de hoy\n\nel 26/09/2026 pasó X', ahora - 1000), ahora - 1000)
})
