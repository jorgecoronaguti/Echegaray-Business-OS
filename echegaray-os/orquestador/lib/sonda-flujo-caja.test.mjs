// La decisión «sincronizar o no» de la sonda, y que nunca relance ni martille.
import test from 'node:test'
import assert from 'node:assert/strict'
import { decidirSonda, estadoTras, marcaDe, MAX_FALLOS, vueltaDeSonda } from './sonda-flujo-caja.mjs'

test('misma versión: no sincroniza', () => {
  assert.equal(decidirSonda({ marca: '15418', estado: { marca: '15418' }, syncCorriendo: false }).accion, 'nada')
})

test('versión nueva: sincroniza; con un sync corriendo, espera y no lo relanza', () => {
  assert.equal(decidirSonda({ marca: '15419', estado: { marca: '15418' }, syncCorriendo: false }).accion, 'sincronizar')
  assert.equal(decidirSonda({ marca: '15419', estado: { marca: '15418' }, syncCorriendo: true }).accion, 'esperar')
  assert.equal(decidirSonda({ marca: '15419', estado: null, syncCorriendo: false }).accion, 'sincronizar')
})

test('sin version ni modifiedTime no se decide; version gana sobre modifiedTime', () => {
  assert.throws(() => marcaDe({}), /a ciegas/)
  assert.equal(marcaDe({ version: '7', modifiedTime: '2026-09-17T15:00:00Z' }), '7')
  assert.equal(marcaDe({ modifiedTime: '2026-09-17T15:00:00Z' }), '2026-09-17T15:00:00Z')
})

test('un fallo no atiende la versión; al tope de fallos, sí', () => {
  let e = { marca: '1', fallos: 0 }
  for (let i = 1; i < MAX_FALLOS; i++) {
    e = estadoTras({ estado: e, marca: '2', ok: false })
    assert.equal(e.marca, '1', `fallo ${i}: la versión sigue sin atender`)
  }
  e = estadoTras({ estado: e, marca: '2', ok: false })
  assert.equal(e.marca, '2')
  assert.equal(e.abandonada, '2')
})

/** Dependencias falsas que anotan qué se llamó. */
function deps({ version = '10', estado = { marca: '9' }, corriendo = false, syncFalla = false } = {}) {
  const llamadas = []
  let guardado = null
  return {
    llamadas, guardado: () => guardado,
    leerVersion: async () => ({ version }),
    leerEstado: async () => estado,
    guardarEstado: async (e) => { guardado = e },
    syncCorriendo: async () => corriendo,
    sincronizarCompras: async () => { llamadas.push('compras'); if (syncFalla) throw new Error('centinela') },
    sincronizarNotas: async (anterior) => { llamadas.push(['notas', anterior]); return { notas: [[18, { clave: 'x' }]], linea: 'notas ok' } },
  }
}

test('vuelta con versión nueva: sync de Compras, después notas con la lectura anterior, y la versión queda atendida', async () => {
  const d = deps({ estado: { marca: '9', notas: [[18, { clave: 'a' }]] } })
  await vueltaDeSonda(d)
  assert.deepEqual(d.llamadas, ['compras', ['notas', [[18, { clave: 'a' }]]]])
  assert.equal(d.guardado().marca, '10')
  assert.deepEqual(d.guardado().notas, [[18, { clave: 'x' }]])
})

test('vuelta con un sync ya corriendo: no llama a nada y no toca el estado', async () => {
  const d = deps({ corriendo: true })
  await vueltaDeSonda(d)
  assert.deepEqual(d.llamadas, [])
  assert.equal(d.guardado(), null)
})

test('vuelta que falla: no lee notas y la versión queda para la vuelta siguiente', async () => {
  const d = deps({ syncFalla: true })
  const r = await vueltaDeSonda(d)
  assert.equal(r.ok, false)
  assert.deepEqual(d.llamadas, ['compras'])
  assert.equal(d.guardado().marca, '9')
})
