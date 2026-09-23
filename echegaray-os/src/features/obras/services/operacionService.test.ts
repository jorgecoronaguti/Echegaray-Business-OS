import test from 'node:test'
import assert from 'node:assert/strict'
import { SUBS_OPERACION, subDeLaUrl } from './subsOperacion.ts'

// ═══ CLIMA NO ES SUB-SOLAPA (diseño ERP Obras, 23/09/2026 · H1) ═══
test('Operación tiene cuatro subs sin Clima, y `?sub=clima` cae en Impedimentos, no en silencio', () => {
  assert.deepEqual([...SUBS_OPERACION], ['impedimentos', 'pedidos', 'equipos', 'compras'])
  assert.equal(subDeLaUrl('clima'), 'impedimentos')
  assert.equal(subDeLaUrl('herramientas'), 'equipos')
  assert.equal(subDeLaUrl(undefined), 'impedimentos')
})
