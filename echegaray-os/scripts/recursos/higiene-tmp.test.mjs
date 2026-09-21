// Pruebas de la higiene de /tmp. No tocan el /tmp real: cada prueba arma su propio directorio base.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, utimesSync, existsSync, rmSync, openSync, closeSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { esFamilia, nombresEnUso, higieneTmp } from './higiene-tmp.mjs'

const DIA = 86400
const viejo = (ruta, dias = 10) => { const t = Date.now() / 1000 - dias * DIA; utimesSync(ruta, t, t) }
const base = () => mkdtempSync(join(tmpdir(), 'higiene-prueba-'))

test('reconoce la forma de mkdtemp y rechaza cualquier otro nombre', () => {
  for (const n of ['afipsdk-005Aof', 'conocimiento-drive-ab12Cd', 'balanz-remoto-XyZ789', 'dec-aB3d9K'])
    assert.equal(esFamilia(n), true, `debía reconocer: ${n}`)
  for (const n of ['claude-1001', 'vscode-typescript1001', '.X11-unix', 'systemd-private-abc', 'afipsdk', 'informe-final'])
    assert.equal(esFamilia(n), false, `no debía reconocer: ${n}`)
})

test('borra el temporal viejo y deja todo lo demás', () => {
  const dir = base()
  const viejoDir = join(dir, 'vigia-aaaaaa')       // familia + viejo → se va
  const nuevoDir = join(dir, 'vigia-bbbbbb')       // familia pero de hoy → se queda
  const ajenoDir = join(dir, 'informe-cccccc')     // no es familia → se queda
  const archivo = join(dir, 'afipsdk-dddddd')      // familia pero es un archivo → se queda
  mkdirSync(viejoDir); mkdirSync(nuevoDir); mkdirSync(ajenoDir)
  writeFileSync(join(viejoDir, 'basura.txt'), 'x') // con contenido adentro: igual se va
  writeFileSync(archivo, 'x')
  viejo(viejoDir); viejo(ajenoDir); viejo(archivo)

  const r = higieneTmp({ base: dir, edadDias: 3 })
  assert.equal(r.borrados, 1)
  assert.equal(existsSync(viejoDir), false, 'el viejo tenía que irse')
  assert.equal(existsSync(nuevoDir), true, 'el de hoy tenía que quedarse')
  assert.equal(existsSync(ajenoDir), true, 'lo que no es familia no se toca')
  assert.equal(existsSync(archivo), true, 'un archivo no es un directorio de mkdtemp')
  rmSync(dir, { recursive: true, force: true })
})

test('un temporal viejo que un proceso vivo tiene abierto NO se borra', () => {
  const dir = base()
  const ocupado = join(dir, 'estudiar-eeeeee')
  mkdirSync(ocupado)
  const fd = openSync(join(ocupado, 'abierto.txt'), 'w')  // este proceso lo tiene abierto de verdad
  viejo(ocupado)
  try {
    assert.equal(nombresEnUso(dir).has('estudiar-eeeeee'), true, '/proc tenía que verlo abierto')
    const r = higieneTmp({ base: dir, edadDias: 3 })
    assert.equal(r.enUso, 1)
    assert.equal(r.borrados, 0)
    assert.equal(existsSync(ocupado), true, 'lo que está en uso no se toca')
  } finally { closeSync(fd); rmSync(dir, { recursive: true, force: true }) }
})

test('en seco cuenta pero no borra, y el tope acota la corrida', () => {
  const dir = base()
  for (const n of ['orq-doc-111111', 'orq-doc-222222', 'orq-doc-333333']) { mkdirSync(join(dir, n)); viejo(join(dir, n)) }

  const seco = higieneTmp({ base: dir, edadDias: 3, seco: true })
  assert.equal(seco.borrados, 3)
  assert.equal(existsSync(join(dir, 'orq-doc-111111')), true, 'en seco no se borra nada')

  const conTope = higieneTmp({ base: dir, edadDias: 3, tope: 2 })
  assert.equal(conTope.borrados, 2)
  assert.equal(conTope.tope, true)
  rmSync(dir, { recursive: true, force: true })
})

test('un directorio que no existe no rompe el barrido', () => {
  const r = higieneTmp({ base: join(tmpdir(), 'no-existe-higiene-prueba-zzzz'), edadDias: 3 })
  assert.equal(r.borrados, 0)
  assert.ok(r.error, 'tenía que informar el error, no lanzarlo')
})
