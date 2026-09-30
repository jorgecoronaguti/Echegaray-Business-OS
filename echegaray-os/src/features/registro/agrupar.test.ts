import test from 'node:test'
import assert from 'node:assert/strict'
import { agrupar, firma, rebotes, ventana, type FilaReg } from './agrupar.ts'

const fila = (o: Partial<FilaReg>): FilaReg => ({
  id: 1, en: '2026-09-30T10:00:00Z', tipo: 'error_servidor', perfil_id: null, rol: null, prestada: false, metodo: 'GET',
  ruta: '/x', consulta: null, estado: 500, destino: null, dispositivo: 'pc', despliegue: null, digest: null, mensaje: null, detalle: null, ...o,
})

test('firma: digest primero; si no, el mensaje sin uuids ni números (igual que control-de-fallas.mjs)', () => {
  assert.equal(firma({ digest: '123', mensaje: 'x', estado: 500 }), '123')
  assert.equal(firma({ digest: null, mensaje: 'fila 12 de 543b2008-7540-494f-bfd6-5e30bc601ac8', estado: 500 }), 'fila # de #')
  assert.equal(firma({ digest: null, mensaje: null, estado: 404 }), 'estado #')
})

test('agrupar: mismo error de dos personas es un grupo, con veces, personas y la última vez', () => {
  const quien = (id: string | null) => (id ? `P${id}` : 'sin sesión')
  const g = agrupar([
    fila({ en: '2026-09-30T10:00:00Z', mensaje: 'falló 1', perfil_id: 'a', despliegue: 'd1' }),
    fila({ en: '2026-09-30T11:00:00Z', mensaje: 'falló 2', perfil_id: 'b', ruta: '/y', despliegue: 'd2' }),
    fila({ en: '2026-09-30T09:00:00Z', tipo: 'error_cliente', mensaje: 'otro' }),
  ], quien)
  assert.equal(g.length, 2)
  assert.equal(g[0].veces, 2)
  assert.deepEqual(g[0].personas, ['Pa', 'Pb'])
  assert.deepEqual(g[0].rutas, ['/x', '/y'])
  assert.equal(g[0].ultima, '2026-09-30T11:00:00Z')
  assert.equal(g[0].mensaje, 'falló 2')
  assert.equal(g[1].personas[0], 'sin sesión')
})

test('rebotes: por persona, ruta y destino', () => {
  const r = rebotes([
    fila({ tipo: 'redireccion', estado: 308, ruta: '/vieja', destino: '/nueva', perfil_id: 'a' }),
    fila({ tipo: 'redireccion', estado: 308, ruta: '/vieja', destino: '/nueva', perfil_id: 'a', en: '2026-09-30T12:00:00Z' }),
    fila({ tipo: 'rechazo', estado: 403, ruta: '/api/x', perfil_id: 'b' }),
  ], (id) => id ?? '?')
  assert.equal(r.length, 2)
  assert.equal(r[0].veces, 2)
  assert.equal(r[0].ultima, '2026-09-30T12:00:00Z')
})

test('ventana: sólo las ofrecidas; lo demás es 24 h', () => {
  assert.equal(ventana('168'), 168)
  assert.equal(ventana('5'), 24)
  assert.equal(ventana(undefined), 24)
})
