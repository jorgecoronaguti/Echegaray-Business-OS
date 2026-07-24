// PRUEBAS DEL REGISTRO DEL BACKLOG — el defecto crítico: `init` NO puede pisar un tablero existente.
//
// El dueño perdió tareas porque un segundo /backlog corría `init` y reemplazaba TODO el tablero,
// borrando estados, ramas, worktrees, resultados y bloqueos del primero. Estas pruebas fijan que
// `init` es idempotente y aditivo: conserva lo que existe, agrega sólo lo que falta, y correrlo dos
// veces no cambia ni elimina nada.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const BACKLOG = join(dirname(fileURLToPath(import.meta.url)), 'backlog.mjs')

function conProyecto() {
  const proy = mkdtempSync(join(tmpdir(), 'backlog-test-'))
  const run = (...a) => execFileSync('node', [BACKLOG, ...a], { env: { ...process.env, CLAUDE_PROJECT_DIR: proy }, encoding: 'utf8' })
  const leerEstado = () => JSON.parse(readFileSync(join(proy, '.claude', 'backlog', 'estado.json'), 'utf8'))
  const backups = () => readdirSync(join(proy, '.claude', 'backlog')).filter((f) => f.startsWith('estado.backup-'))
  return { proy, run, leerEstado, backups }
}

test('init sobre un tablero VACÍO crea las tareas', () => {
  const { run, leerEstado } = conProyecto()
  run('init', JSON.stringify([{ id: 'A', titulo: 'tarea A' }, { id: 'B', titulo: 'tarea B' }]), '2')
  const d = leerEstado()
  assert.equal(d.tareas.length, 2)
  assert.equal(d.tope, 2)
  assert.deepEqual(d.tareas.map((t) => t.id).sort(), ['A', 'B'])
})

test('DEFECTO CORREGIDO: un segundo init NO borra el tablero ni pisa el estado de una tarea en curso', () => {
  const { run, leerEstado } = conProyecto()
  run('init', JSON.stringify([{ id: 'A', titulo: 'A' }, { id: 'B', titulo: 'B' }]))
  // B se pone en ejecución con su rama y worktree — esto es estado que NO se puede perder.
  run('estado', 'B', 'EN_EJECUCIÓN', '--rama', 'backlog/B', '--worktree', 'wt/B')
  // Un segundo /backlog: B ya existe, C es nueva.
  run('init', JSON.stringify([{ id: 'B', titulo: 'B (otra vez)' }, { id: 'C', titulo: 'C' }]))
  const d = leerEstado()
  const porId = new Map(d.tareas.map((t) => [t.id, t]))
  assert.equal(d.tareas.length, 3, 'A, B y C deben coexistir — no se reemplazó el tablero')
  assert.equal(porId.get('A').estado, 'PENDIENTE', 'A no se borró')
  assert.equal(porId.get('B').estado, 'EN_EJECUCIÓN', 'B conservó su estado en curso')
  assert.equal(porId.get('B').rama, 'backlog/B', 'B conservó su rama')
  assert.equal(porId.get('B').worktree, 'wt/B', 'B conservó su worktree')
  assert.equal(porId.get('B').titulo, 'B', 'el título original de B no se pisó con el del segundo init')
  assert.equal(porId.get('C').estado, 'PENDIENTE', 'C se agregó como pendiente')
})

test('IDEMPOTENCIA: correr init dos veces con el mismo set no cambia nada', () => {
  const { run, leerEstado } = conProyecto()
  const tareas = JSON.stringify([{ id: 'A', titulo: 'A' }, { id: 'B', titulo: 'B' }])
  run('init', tareas)
  run('estado', 'A', 'EN_EJECUCIÓN', '--rama', 'backlog/A')
  const antes = JSON.stringify(leerEstado())
  run('init', tareas) // mismo set, otra vez
  const despues = JSON.stringify(leerEstado())
  assert.equal(antes, despues, 'init con el mismo set es un no-op: no cambió ni borró nada')
})

test('antes de tocar un tablero existente se deja un backup', () => {
  const { run, backups } = conProyecto()
  run('init', JSON.stringify([{ id: 'A', titulo: 'A' }]))
  assert.equal(backups().length, 0, 'el primer init (tablero vacío) no necesita backup')
  run('init', JSON.stringify([{ id: 'B', titulo: 'B' }]))
  assert.ok(backups().length >= 1, 'el segundo init respaldó el estado previo antes de agregar')
})

test('init preserva el tope existente y no lo pisa', () => {
  const { run, leerEstado } = conProyecto()
  run('init', JSON.stringify([{ id: 'A', titulo: 'A' }]), '3')
  run('init', JSON.stringify([{ id: 'B', titulo: 'B' }]), '1') // intenta cambiar el tope a 1
  assert.equal(leerEstado().tope, 3, 'el tope del tablero existente manda')
})
