import { test } from 'node:test'
import assert from 'node:assert/strict'
import { TIPOS, estaActivo, tiposPara } from './notificaciones.ts'

test('el catálogo de la pantalla es el mismo que el del orquestador', async () => {
  const orq = await import('../../../../orquestador/lib/notificaciones.mjs') as unknown as { TIPOS: readonly { clave: string }[] }
  assert.deepEqual(TIPOS.map((t) => t.clave), orq.TIPOS.map((t) => t.clave))
})

test('sin fila está activo; los avisos del dueño sólo se ofrecen a Dirección', () => {
  assert.equal(estaActivo([], 'sistema', 'mattermost_dm'), true)
  assert.equal(estaActivo([{ tipo: 'sistema', canal: 'mattermost_dm', activo: false }], 'sistema', 'mattermost_dm'), false)
  assert.ok(tiposPara('campo').every((t) => t.para === 'persona'))
  assert.equal(tiposPara('direccion').length, TIPOS.length)
})
