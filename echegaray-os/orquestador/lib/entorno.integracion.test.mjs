// LA GUARDA DE ENTORNO, PROBADA CON UN PROCESO REAL: un `getPool()` desde un worktree con DATABASE_URL
// remota tiene que MORIR antes de abrir el socket. Sin red: el host es inválido a propósito — si la guarda
// fallara, el error sería de DNS y el test lo distingue.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const APP = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const REMOTA = 'postgres://u:p@db.invalido.example:5432/x'
const PROGRAMA = `import('${APP}/orquestador/lib/db.mjs').then((m) => { m.getPool(); console.log('POOL_CREADO') })`

function correr(env, cwd = APP) {
  const limpio = { PATH: process.env.PATH, HOME: process.env.HOME, DATABASE_URL: REMOTA, ORQ_ENV_FILE: '/dev/null', ORQ_ANTHROPIC_ENV_FILE: '/dev/null', ...env }
  return spawnSync(process.execPath, ['--input-type=module', '-e', PROGRAMA], { cwd, env: limpio, encoding: 'utf8', timeout: 20000 })
}

// Un "worktree" falso: un directorio con `.git` ARCHIVO, como los enlazados de verdad.
const wt = mkdtempSync(join(tmpdir(), 'wt-falso-'))
mkdirSync(join(wt, 'echegaray-os'))
writeFileSync(join(wt, '.git'), 'gitdir: /home/nadie/.git/worktrees/falso\n')

test('desde un worktree, sin declarar: frena ANTES de conectar', () => {
  const r = correr({ NODE_TEST_CONTEXT: '' }, join(wt, 'echegaray-os'))
  assert.notEqual(r.status, 0)
  assert.match(r.stderr, /SIN DECLARAR/)
  assert.doesNotMatch(r.stderr, /ENOTFOUND|getaddrinfo/)
  assert.doesNotMatch(r.stdout, /POOL_CREADO/)
})

test('desde un worktree, declarando ECHEGARAY_ENTORNO=produccion: pasa (y avisa)', () => {
  const r = correr({ ECHEGARAY_ENTORNO: 'produccion' }, join(wt, 'echegaray-os'))
  assert.equal(r.status, 0, r.stderr)
  assert.match(r.stdout, /POOL_CREADO/)
  assert.match(r.stderr, /declaración explícita/)
})

test('con ECHEGARAY_ENTORNO=desarrollo aunque el cwd no sea un worktree: frena', () => {
  const r = correr({ ECHEGARAY_ENTORNO: 'desarrollo' })
  assert.notEqual(r.status, 0)
  assert.match(r.stderr, /SIN DECLARAR/)
})

test('una base local pasa siempre, sin declarar nada', () => {
  const r = correr({ DATABASE_URL: 'postgres://postgres:x@127.0.0.1:55452/postgres' }, join(wt, 'echegaray-os'))
  assert.equal(r.status, 0, r.stderr)
  assert.match(r.stdout, /POOL_CREADO/)
})
