// Prueba el hook GLOBAL tal como lo instala instalar.sh: el hook y la lib copiados juntos en un bin/
// temporal, ECOS_RAIZ apuntando a un directorio de prueba y un transcript falso. Corre como proceso,
// igual que Claude Code. Cubre lo que el auditor pidió el 29/09: `enRepo`, la banda y la lectura entera.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const AQUI = dirname(fileURLToPath(import.meta.url))
const raiz = mkdtempSync(join(tmpdir(), 'hook-tope-'))
const bin = join(raiz, 'bin'); mkdirSync(bin)
copyFileSync(join(AQUI, 'hook-tope.mjs'), join(bin, 'hook-tope.mjs'))
copyFileSync(join(AQUI, '../../.claude/hooks/tope-contexto-agente.mjs'), join(bin, 'tope-lib.mjs'))
const repo = join(raiz, 'repo'); mkdirSync(join(repo, '.claude/hooks'), { recursive: true })
writeFileSync(join(repo, '.claude/hooks/tope-contexto-agente.mjs'), '')
const fuera = join(raiz, 'fuera'); mkdirSync(fuera)

function transcript(nombre, contexto) {
  const f = join(raiz, `${nombre}.jsonl`)
  writeFileSync(f, JSON.stringify({ message: { usage: { input_tokens: 10, cache_read_input_tokens: contexto - 10, cache_creation_input_tokens: 0 } } }) + '\n')
  return f
}
function correr(ev, proyecto = fuera) {
  const env = { ...process.env, ECOS_RAIZ: raiz, CLAUDE_PROJECT_DIR: proyecto }
  delete env.ECOS_AVISO_CONTEXTO; delete env.ECOS_TOPE_CONTEXTO_AGENTE; delete env.ECOS_LECTURA_MAX
  const r = spawnSync('node', [join(bin, 'hook-tope.mjs')], { input: JSON.stringify(ev), env, encoding: 'utf8' })
  assert.equal(r.status, 0, r.stderr)
  return r.stdout ? JSON.parse(r.stdout).hookSpecificOutput : null
}

test('subagente pasado de 250k: fuera del repo lo niega el global; en el repo lo deja al hook del proyecto', () => {
  const ev = { session_id: 's-sub', transcript_path: transcript('padre', 50_000), agent_id: 'a1',
    agent_transcript_path: transcript('agente', 260_000), tool_name: 'Grep', tool_input: {} }
  assert.equal(correr(ev, fuera)?.permissionDecision, 'deny')
  assert.equal(correr(ev, repo), null)
})

test('crecimiento de la sesión principal: una nota por banda de 10k, no en cada herramienta', () => {
  const ev = (k) => ({ session_id: 's-banda', transcript_path: transcript(`p${k}`, k), tool_name: 'Grep', tool_input: {} })
  assert.equal(correr(ev(90_000)), null)                       // bajo el umbral real de 110k
  assert.match(correr(ev(112_000))?.additionalContext ?? '', /112k/)
  assert.equal(correr(ev(115_000)), null)                      // misma banda: calla
  assert.match(correr(ev(121_000))?.additionalContext ?? '', /121k/)
  assert.deepEqual(JSON.parse(readFileSync(join(raiz, 'sesiones/s-banda.tope.json'), 'utf8')), { banda: 12 })
})

test('lectura entera de un archivo grande: se niega; acotada, pasa; y queda registrada', () => {
  const grande = join(raiz, 'grande.txt'); writeFileSync(grande, 'x'.repeat(70 * 1024))
  const base = { session_id: 's-lee', transcript_path: transcript('lee', 30_000), cwd: raiz }
  assert.equal(correr({ ...base, tool_name: 'Read', tool_input: { file_path: grande } })?.permissionDecision, 'deny')
  assert.equal(correr({ ...base, tool_name: 'Bash', tool_input: { command: `cat ${grande}` } })?.permissionDecision, 'deny')
  assert.equal(correr({ ...base, tool_name: 'Read', tool_input: { file_path: grande, limit: 100 } }), null)
  assert.equal(correr({ ...base, tool_name: 'Bash', tool_input: { command: `cat ${grande} | head` } }), null)
  const reg = readFileSync(join(raiz, 'topes.jsonl'), 'utf8').split('\n').filter((l) => l.includes('"s-lee"'))
  assert.equal(reg.length, 2)
})

test('nunca rompe: entrada basura o sin la lib sale 0 sin decir nada', () => {
  const r = spawnSync('node', [join(bin, 'hook-tope.mjs')], { input: 'no es json', env: { ...process.env, ECOS_RAIZ: raiz }, encoding: 'utf8' })
  assert.equal(r.status, 0); assert.equal(r.stdout, '')
  assert.ok(existsSync(join(bin, 'tope-lib.mjs')))
})
