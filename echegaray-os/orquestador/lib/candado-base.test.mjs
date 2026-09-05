// EL TURNO DE BASE. Lo que se protege acá es que dos procesos no escriban a la vez en Postgres.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// Cada test usa su propio archivo de candado: si usaran el real, se pelearían con la suite que los
// está corriendo — que es literalmente el problema que este módulo viene a resolver.
const RUTA = path.join(os.tmpdir(), `candado-prueba-${process.pid}.lock`)
process.env.ORQ_CANDADO_TESTS = RUTA
const { toma, conTurno, RUTA: RUTA_MOD } = await import('./candado-base.mjs')

test('el candado usa el archivo declarado, no uno propio', () => {
  // Un segundo candado sería un segundo lugar donde se decide quién puede tocar la base, que es
  // exactamente el problema que un candado viene a resolver.
  assert.equal(RUTA_MOD, RUTA)
})

test('quien toma el turno lo suelta, y el archivo desaparece', async () => {
  const soltar = await toma({ quien: 'prueba', avisar: () => {} })
  assert.ok(fs.existsSync(RUTA), 'mientras se tiene el turno, el archivo existe')
  soltar()
  assert.equal(fs.existsSync(RUTA), false)
})

test('el segundo NO entra mientras el primero tiene el turno', async () => {
  const soltar = await toma({ quien: 'A', avisar: () => {} })
  let entro = false
  const b = toma({ quien: 'B', esperaMaxMs: 5000, avisar: () => {} }).then((s) => { entro = true; return s })
  await new Promise((r) => setTimeout(r, 300))
  assert.equal(entro, false, 'B no puede entrar mientras A tiene el turno')
  soltar()
  const soltarB = await b
  assert.equal(entro, true, 'y entra en cuanto A suelta')
  soltarB()
})

test('un candado de un proceso MUERTO no bloquea para siempre', async () => {
  // Sin esto, una corrida que murió con SIGKILL dejaría la máquina trabada hasta que alguien
  // borrara un archivo a mano — y nadie sabe que ese archivo existe.
  fs.writeFileSync(RUTA, JSON.stringify({ pid: 999999, desde: Date.now(), quien: 'fantasma' }))
  const soltar = await toma({ quien: 'vivo', esperaMaxMs: 4000, avisar: () => {} })
  soltar()
  assert.ok(true)
})

test('`conTurno` suelta el turno aunque la función explote', async () => {
  await assert.rejects(() => conTurno('explota', async () => { throw new Error('boom') }), /boom/)
  assert.equal(fs.existsSync(RUTA), false, 'el turno quedó libre igual')
})

test('se puede desactivar a propósito, y entonces no escribe nada', async () => {
  process.env.ORQ_SIN_CANDADO = '1'
  const soltar = await toma({ quien: 'sin-candado' })
  assert.equal(fs.existsSync(RUTA), false)
  soltar()
  delete process.env.ORQ_SIN_CANDADO
})
