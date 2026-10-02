import { test } from 'node:test'
import assert from 'node:assert/strict'
import { decidirReemplazo, type ReciboParaReemplazo } from './reemplazo.ts'

const P1 = '11111111-1111-4111-8111-111111111111'
const P2 = '22222222-2222-4222-8222-222222222222'
const nuevo = { id: 'nuevo', personaId: P1, quincenaDesde: '2026-09-16', quincenaHasta: '2026-09-30' }

const previo = (x: Partial<ReciboParaReemplazo> & { id: string }): ReciboParaReemplazo => ({
  codigo: `RP-${x.id}`, personaId: P1, quincenaDesde: '2026-09-16', quincenaHasta: '2026-09-30',
  estado: 'emitido', firmadoEn: null, papelPath: null, papelSinFotoEn: null, archivadoEn: null, ...x,
})
const ids = (xs: readonly ReciboParaReemplazo[]) => xs.map((x) => x.id)

test('los recibos sin firma de la misma persona y quincena se reemplazan, estén emitidos, enviados u observados', () => {
  const r = decidirReemplazo([
    previo({ id: 'a' }), previo({ id: 'b', estado: 'enviado' }), previo({ id: 'c', estado: 'observado' }),
  ], nuevo)
  assert.deepEqual(ids(r.reemplazar), ['a', 'b', 'c'])
  assert.equal(r.firmado, null)
})

test('un recibo firmado, con papel o archivado NO se reemplaza, y se avisa cuál es', () => {
  const casos: Partial<ReciboParaReemplazo>[] = [
    { estado: 'firmado_telefono', firmadoEn: '2026-10-01T12:00:00Z' },
    { estado: 'firmado_papel', papelPath: 'u/recibo/x.jpg' },
    { estado: 'firmado_papel', papelSinFotoEn: '2026-10-01T12:00:00Z' },
    { estado: 'archivado', archivadoEn: '2026-10-01T12:00:00Z' },
  ]
  for (const c of casos) {
    const f = previo({ id: 'f', ...c })
    const r = decidirReemplazo([previo({ id: 'a' }), f], nuevo)
    assert.deepEqual(ids(r.reemplazar), ['a'], JSON.stringify(c))
    assert.equal(r.firmado?.id, 'f', JSON.stringify(c))
  }
})

test('con papel cargado y estado aún «enviado» también cuenta como firmado (la señal es el sello, no el estado)', () => {
  const r = decidirReemplazo([previo({ id: 'p', estado: 'enviado', papelPath: 'u/recibo/x.jpg' })], nuevo)
  assert.deepEqual(r.reemplazar, [])
  assert.equal(r.firmado?.id, 'p')
})

test('otra quincena u otra persona no se tocan', () => {
  const r = decidirReemplazo([
    previo({ id: 'otra-persona', personaId: P2 }),
    previo({ id: 'otra-quincena', quincenaDesde: '2026-09-01', quincenaHasta: '2026-09-15' }),
    previo({ id: 'mismo-desde-otro-hasta', quincenaHasta: '2026-10-15' }),
  ], nuevo)
  assert.deepEqual(r.reemplazar, [])
  assert.equal(r.firmado, null)
})

test('un firmado de OTRA persona no frena la emisión', () => {
  const r = decidirReemplazo([
    previo({ id: 'x', personaId: P2, estado: 'archivado', archivadoEn: '2026-10-01T00:00:00Z', firmadoEn: '2026-10-01T00:00:00Z' }),
  ], nuevo)
  assert.equal(r.firmado, null)
})

test('uno ya reemplazado no se vuelve a tocar, y el recibo nuevo nunca se reemplaza a sí mismo', () => {
  const r = decidirReemplazo([previo({ id: 'r', estado: 'reemplazado' }), previo({ id: 'nuevo' })], nuevo)
  assert.deepEqual(r.reemplazar, [])
  assert.equal(r.firmado, null)
})

test('sin recibos previos no hay nada que reemplazar', () => {
  assert.deepEqual(decidirReemplazo([], nuevo), { reemplazar: [], firmado: null })
})

test('antes de emitir (sin id nuevo) decide lo mismo: sirve para el aviso del firmado', () => {
  const sinId = { personaId: P1, quincenaDesde: '2026-09-16', quincenaHasta: '2026-09-30' }
  const r = decidirReemplazo([previo({ id: 'a' }), previo({ id: 'f', estado: 'archivado', archivadoEn: '2026-10-01T00:00:00Z' })], sinId)
  assert.deepEqual(ids(r.reemplazar), ['a'])
  assert.equal(r.firmado?.id, 'f')
})
