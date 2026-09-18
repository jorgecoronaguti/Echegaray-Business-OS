import test from 'node:test'
import assert from 'node:assert/strict'
import { armarRubrosDeLaObra } from './rubrosDeLaObra.ts'

// Quattropani, con los números de la base del 18/09/2026 (sin IVA).
const vista = {
  presupuesto_estado: 'leido', presupuestado_total: '83690841.56', presupuestado_mano_obra: '39353557.25', presupuestado_materiales: '44110169.31',
  presupuestado_subcontratistas: '0', presupuestado_otros: '227115', presupuesto_fuente_nombre: 'Cotizacion Final.xlsm', presupuesto_fecha: '2026-07-27T03:00:00Z',
  margen_cotizado: '45683166.56', gastos_generales_cotizados: '9898228.06',
}
const consumo = [
  { rubro: 'mano_obra', monto: 5857969, monto_estimado: 3938173 }, { rubro: 'materiales', monto: 27772365 },
  { rubro: 'subcontratistas', monto: 3120000 }, { rubro: 'otros', monto: 3363912 },
]

test('D2 · lo mismo contra lo mismo: el consumido incluye la mano de obra, igual que el presupuesto', () => {
  const r = armarRubrosDeLaObra(vista, consumo)!
  assert.equal(r.presupuestado, 83690841.56)
  assert.equal(r.consumido, 5857969 + 27772365 + 3120000 + 3363912)
  assert.equal(r.consumidoComparable, r.consumido, 'los cuatro rubros tienen presupuesto (subcontratistas en cero)')
  assert.equal(r.manoObraEstimada, 3938173)
  assert.equal(r.fuente, 'Cotizacion Final.xlsm · 27/07/2026')
})

test('D1 · el margen cotizado es el de la base, no una resta de la pantalla', () => {
  assert.equal(armarRubrosDeLaObra(vista, consumo)!.margenCotizado, 45683166.56)
  assert.equal(armarRubrosDeLaObra({ ...vista, margen_cotizado: null }, consumo)!.margenCotizado, null)
})

test('un rubro sin presupuesto no entra a lo comparable; sin presupuesto se dice el motivo; sin fuentes, null', () => {
  const r = armarRubrosDeLaObra({ ...vista, presupuestado_subcontratistas: null, presupuestado_total: '83463726.56' }, consumo)!
  assert.equal(r.consumidoComparable, 5857969 + 27772365 + 3363912)
  const sin = armarRubrosDeLaObra({ presupuesto_estado: 'sin_presupuesto', presupuesto_motivo: 'sin costo cotizado' }, consumo)!
  assert.equal(sin.presupuestado, null)
  assert.equal(sin.motivo, 'sin costo cotizado')
  assert.equal(sin.consumidoComparable, null)
  assert.equal(armarRubrosDeLaObra(null, null), null)
  assert.equal(armarRubrosDeLaObra(vista, null)!.consumido, null, 'no pude leer el consumo ≠ no hubo')
  assert.equal(armarRubrosDeLaObra(vista, [])!.consumido, null, 'sin movimiento: null, nunca $ 0')
})
