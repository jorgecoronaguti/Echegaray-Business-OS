// LOS AGENTES SE VALIDAN CON LA SUITE, NO CUANDO ALGUIEN SE ACUERDA.
//
// El inventario de `.claude/agents/` ya validaba bien —falla de verdad con un agente mal
// declarado—, y nadie lo corría: ningún test lo referenciaba, el hook de cierre no lo llamaba y no
// hay CI. Un validador que hay que acordarse de tipear caduca igual que la lista escrita a mano que
// vino a reemplazar.
//
// Esto lo engancha al runner que ya produce la evidencia de cierre del repo.

import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const DIR = join(RAIZ, '.claude', 'agents')
const SCRIPT = join(DIR, 'scripts', 'inventario-agentes.mjs')

const agentes = () => readdirSync(DIR).filter((f) => f.endsWith('.md') && f !== 'README.md')

test('todos los agentes están bien declarados', () => {
  // Si esto falla, el mensaje del script dice exactamente cuál y por qué.
  const salida = execFileSync('node', [SCRIPT, '--validar'], { encoding: 'utf8' })
  assert.match(salida, /✓ todos bien declarados/)
})

test('ninguno hereda las herramientas por omisión', () => {
  // Omitir `tools` hereda TODO, incluidas Write y Edit. Un auditor con Write es un auditor que
  // algún día "arregla" lo que audita.
  for (const f of agentes()) {
    const texto = readFileSync(join(DIR, f), 'utf8')
    assert.match(texto, /^tools:\s*\S/m, `${f} no declara tools`)
  }
})

test('los que auditan NO pueden editar archivos', () => {
  // La restricción es lo único que hace que sea imposible hacer daño, en vez de estar prohibido.
  for (const f of agentes().filter((x) => x.startsWith('auditor-') || x.startsWith('centinela-') || x.startsWith('cazador-') || x.startsWith('qa-'))) {
    const tools = readFileSync(join(DIR, f), 'utf8').match(/^tools:(.*)$/m)?.[1] ?? ''
    for (const prohibida of ['Write', 'Edit', 'NotebookEdit']) {
      assert.ok(!tools.includes(prohibida), `${f} tiene ${prohibida}: un auditor que escribe deja de ser auditor`)
    }
  }
})

test('el validador FALLA con un agente mal declarado, y dice cuál', () => {
  // Un validador que nunca se vio fallar no es un validador: es un adorno que devuelve verde.
  // Se le apunta a un directorio de mentira con un agente roto — no alcanza con que node no arranque.
  const tmp = mkdtempSync(join(tmpdir(), 'agentes-'))
  writeFileSync(join(tmp, 'roto.md'), '---\nname: otro-nombre\nmodel: gpt-4\n---\ncuerpo\n')
  try {
    execFileSync('node', [SCRIPT, '--validar', '--dir', tmp], { encoding: 'utf8', stdio: 'pipe' })
    assert.fail('el validador dio verde sobre un agente roto')
  } catch (e) {
    const salida = String(e.stdout ?? '')
    assert.match(salida, /'name' es "otro-nombre" y el archivo se llama "roto"/)
    assert.match(salida, /falta 'description'/)
    assert.match(salida, /sin 'tools'/)
    assert.match(salida, /model "gpt-4" no es/)
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
})
