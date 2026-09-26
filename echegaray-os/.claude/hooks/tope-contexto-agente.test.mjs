import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { contextoDelTranscript, rutaDelAgente, decidir } from './tope-contexto-agente.mjs'

const HOOK = fileURLToPath(new URL('./tope-contexto-agente.mjs', import.meta.url))
function sesion(ctx) {
  const dir = mkdtempSync(join(tmpdir(), 'tope-'))
  const principal = join(dir, 'ses.jsonl')
  writeFileSync(principal, '')
  mkdirSync(join(dir, 'ses', 'subagents'), { recursive: true })
  const linea = (n) => JSON.stringify({ message: { usage: { input_tokens: 2, cache_read_input_tokens: n - 2, cache_creation_input_tokens: 0 } } })
  writeFileSync(join(dir, 'ses', 'subagents', 'agent-abc123.jsonl'), `${linea(1000)}\n${linea(ctx)}\n{"type":"user"}\n`)
  return principal
}
const correr = (ev) => spawnSync('node', [HOOK], { input: JSON.stringify(ev), encoding: 'utf8' }).stdout

test('mide la ÚLTIMA respuesta del agente', () => {
  const p = sesion(300_000)
  assert.equal(contextoDelTranscript(rutaDelAgente({ transcript_path: p, tool_name: 'SendMessage', tool_input: { to: 'abc123' } }).ruta), 300_000)
})

test('retomar un agente de 300k se niega; uno de 200k pasa', () => {
  const ev = (p) => ({ transcript_path: p, tool_name: 'SendMessage', tool_input: { to: 'abc123' } })
  const salida = JSON.parse(correr(ev(sesion(300_000))))
  assert.equal(salida.hookSpecificOutput.permissionDecision, 'deny')
  assert.match(salida.hookSpecificOutput.permissionDecisionReason, /300k.*NUEVO/)
  assert.equal(correr(ev(sesion(200_000))), '')
})

test('desde adentro del subagente: por encima del tope se le ordena cerrar', () => {
  const salida = JSON.parse(correr({ transcript_path: sesion(260_000), agent_id: 'abc123', tool_name: 'Read' }))
  assert.match(salida.hookSpecificOutput.permissionDecisionReason, /devolvé YA/)
})

test('nunca rompe: sin transcript, id raro, sesión principal o JSON inválido → deja pasar', () => {
  assert.equal(correr({ tool_name: 'SendMessage', tool_input: { to: 'x' } }), '')
  assert.equal(correr({ transcript_path: '/no/existe.jsonl', tool_name: 'SendMessage', tool_input: { to: 'abc123' } }), '')
  assert.equal(correr({ transcript_path: sesion(900_000), tool_name: 'SendMessage', tool_input: { to: '../../etc' } }), '')
  assert.equal(correr({ transcript_path: sesion(900_000), tool_name: 'Read' }), '')
  assert.equal(spawnSync('node', [HOOK], { input: 'no json', encoding: 'utf8' }).status, 0)
  assert.equal(decidir({ modo: 'interno', contexto: null }), null)
})
