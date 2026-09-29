import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { pagoAlMarcarPagada } from './pagoAlMarcarPagada.ts'

describe('pagoAlMarcarPagada', () => {
  it('nada anotado: el saldo compensado se da por pagado', () => {
    assert.deepEqual(pagoAlMarcarPagada({ banco: null, efectivo: 0 }, { banco: 300000, efectivo: 50000 }),
      { pagadoBanco: 300000, pagadoEfectivo: 50000, conservaLoAnotado: false })
  })
  it('sólo banco anotado: no inventa efectivo ni completa banco', () => {
    const r = pagoAlMarcarPagada({ banco: 200000, efectivo: null }, { banco: 100000, efectivo: 50000 })
    assert.deepEqual(r, { pagadoBanco: 200000, pagadoEfectivo: 0, conservaLoAnotado: true })
  })
  it('ambos anotados: quedan tal cual', () => {
    const r = pagoAlMarcarPagada({ banco: 120000.5, efectivo: 30000 }, { banco: 1, efectivo: 1 })
    assert.deepEqual(r, { pagadoBanco: 120000.5, pagadoEfectivo: 30000, conservaLoAnotado: true })
  })
  it('anotado mayor al total: no se recorta', () => {
    const r = pagoAlMarcarPagada({ banco: 900000, efectivo: null }, { banco: -400000, efectivo: 0 })
    assert.equal(r.pagadoBanco, 900000)
    assert.equal(r.pagadoEfectivo, 0)
  })
  it('nada anotado y saldo negativo: no se paga de más', () => {
    const r = pagoAlMarcarPagada({ banco: null, efectivo: null }, { banco: -5, efectivo: null })
    assert.deepEqual(r, { pagadoBanco: 0, pagadoEfectivo: 0, conservaLoAnotado: false })
  })
})
