import test from 'node:test'
import assert from 'node:assert/strict'
import { documentosDeCobranzas } from './documentoDeCobranza.ts'
import { planDeCobranza } from './reglasCobranza.ts'

const HOY = '2026-09-17'

test('Pendiente con fecha pasada es vencido; Facturado con fecha pasada NO (gemelo de estado_de_cobro)', () => {
  const [p, f] = documentosDeCobranzas([
    { id: 'a', cliente_id: 'c1', estado: 'Pendiente', fecha_cobro: '2026-09-01', total_bruto: '100' },
    { id: 'b', cliente_id: 'c1', estado: 'Facturado', fecha_cobro: '2026-09-01', total_bruto: '100' },
  ], HOY)
  assert.equal(p.estado, 'vencido')
  assert.equal(f.estado, 'emitido')
})

test('lo que no es deuda, no tiene cliente o no tiene monto no es documento', () => {
  assert.equal(documentosDeCobranzas([
    { id: 'a', cliente_id: 'c1', estado: 'Cobrado', fecha_cobro: '2026-09-18', total_bruto: '100' },
    { id: 'b', cliente_id: null, estado: 'Pendiente', fecha_cobro: '2026-09-18', total_bruto: '100' },
    { id: 'c', cliente_id: 'c1', estado: 'Pendiente', fecha_cobro: '2026-09-18', total_bruto: null },
    { id: 'd', cliente_id: 'c1', estado: 'CANCELAR', fecha_cobro: '2026-09-18', total_bruto: '100' },
  ], HOY).length, 0)
})

test('la regla de 30 días de la ficha se aplica igual sobre una fila de Cobranzas', () => {
  const docs = documentosDeCobranzas([
    { id: 'a', cliente_id: 'c1', estado: 'Pendiente', fecha_cobro: '2026-09-18', total_bruto: '26600000' },
    { id: 'b', cliente_id: 'c1', estado: 'Pendiente', fecha_cobro: '2026-11-24', total_bruto: '1' },
  ], HOY)
  const plan = planDeCobranza(docs, HOY)
  assert.deepEqual(plan.map((i) => [i.documento.id, i.rotulo]), [['a', 'Programar aviso']])
})
