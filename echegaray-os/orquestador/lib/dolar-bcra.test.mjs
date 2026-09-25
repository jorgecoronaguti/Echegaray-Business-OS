import test from 'node:test'
import assert from 'node:assert/strict'
import { ultimaCotizacionBcra, cotizacionAEscribir, serialDeFecha, leerBcra } from './dolar-bcra.mjs'

// Cuerpo REAL de la API, leído el 25/09/2026 a las 11:10 (recortado a dos días).
const REAL = { status: 200, results: [
  { fecha: '2026-09-24', detalle: [{ codigoMoneda: 'USD', descripcion: 'DOLAR E.E.U.U.', tipoPase: 0, tipoCotizacion: 1519.5 }] },
  { fecha: '2026-09-23', detalle: [{ codigoMoneda: 'USD', descripcion: 'DOLAR E.E.U.U.', tipoPase: 0, tipoCotizacion: 1516 }] },
] }

test('la última cotización con fecha <= hoy, aunque la API las mande desordenadas', () => {
  assert.deepEqual(ultimaCotizacionBcra(REAL, '2026-09-25'), { tc: 1519.5, fecha: '2026-09-24' })
  assert.deepEqual(ultimaCotizacionBcra({ results: [...REAL.results].reverse() }, '2026-09-25'), { tc: 1519.5, fecha: '2026-09-24' })
  assert.deepEqual(ultimaCotizacionBcra(REAL, '2026-09-23'), { tc: 1516, fecha: '2026-09-23' }, 'una fecha futura no se usa')
})

test('basura, vacío o cotización 0 no son una cotización', () => {
  assert.equal(ultimaCotizacionBcra(null, '2026-09-25'), null)
  assert.equal(ultimaCotizacionBcra({ results: [{ fecha: '2026-09-24', detalle: [{ codigoMoneda: 'USD', tipoCotizacion: 0 }] }] }, '2026-09-25'), null)
  assert.equal(ultimaCotizacionBcra({ results: [{ fecha: '2026-09-24', detalle: [{ codigoMoneda: 'EUR', tipoCotizacion: 1700 }] }] }, '2026-09-25'), null)
})

test('serial de Sheets: 25/09/2026 = 46290', () => {
  assert.equal(serialDeFecha('2026-09-25'), 46290)
  assert.equal(serialDeFecha('1899-12-31'), 1)
})

test('BCRA primero; la base sólo si el BCRA no contestó, y lo dice; sin ninguna, no se escribe', () => {
  const a = cotizacionAEscribir({ bcra: { tc: 1519.5, fecha: '2026-09-24' }, base: { tc: 1519.8818, fecha: '2026-09-24' }, leidoEn: '25/09/2026 11:20' })
  assert.equal(a.tc, 1519.5)
  assert.equal(a.fuente, 'bcra')
  assert.equal(a.fechaSerial, serialDeFecha('2026-09-24'))
  assert.match(a.origen, /BCRA · Com\. A 3500 \(mayorista\) del 24\/09\/2026 · leída por el OS el 25\/09\/2026 11:20/)
  const b = cotizacionAEscribir({ bcra: null, base: { tc: 1519.8818, fecha: '2026-09-24' }, leidoEn: 'x' })
  assert.equal(b.fuente, 'base')
  assert.match(b.origen, /^⚠ el BCRA no contestó/)
  assert.equal(cotizacionAEscribir({ bcra: null, base: null, leidoEn: 'x' }), null)
})

test('leerBcra: HTTP caído o excepción → null, nunca lanza', async () => {
  assert.equal(await leerBcra({ hoy: '2026-09-25', fetchImpl: async () => ({ ok: false }) }), null)
  assert.equal(await leerBcra({ hoy: '2026-09-25', fetchImpl: async () => { throw new Error('red') } }), null)
  let url = ''
  const r = await leerBcra({ hoy: '2026-09-25', fetchImpl: async (u) => { url = u; return { ok: true, json: async () => REAL } } })
  assert.deepEqual(r, { tc: 1519.5, fecha: '2026-09-24' })
  assert.match(url, /fechadesde=2026-09-15&fechahasta=2026-09-25$/)
})
