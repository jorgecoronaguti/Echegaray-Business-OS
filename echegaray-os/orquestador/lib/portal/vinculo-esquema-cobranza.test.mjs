// LA PROPUESTA DE VÍNCULO NO PUEDE ATAR UN PAGO A LA FILA DE OTRO. Si una de estas reglas se afloja,
// el script propone un UPDATE que le publicaría a un cliente el cobro de otra fila.
import test from 'node:test'
import assert from 'node:assert/strict'
import { candidatos, proponerVinculos, sqlDelDuplicado, sqlDelVinculo } from './vinculo-esquema-cobranza.mjs'

const LE = 'le-cliente'
const ME = 'messina-cliente'
const pago = (x) => ({ id: 'p', cliente_id: LE, monto: '100', fecha: '2026-08-31', moneda: 'ARS', concepto: 'Cobro', ...x })
const cob = (x) => ({ sheet_id: '1', cliente_id: LE, estado: 'Cobrado', concepto: 'Cobro', fecha_cobro: '2026-08-31',
  total_bruto: '100', total_bruto_origen: null, moneda: null, numero_comprobante: null, monto_neto: '100', ...x })

test('La Estrella: el mismo importe con 17 días de diferencia se propone, con su evidencia', () => {
  const [r] = proponerVinculos(
    [pago({ id: 'estrella', monto: '8234758.25', fecha: '2026-08-31', concepto: 'Faltante (2 de 2)' })],
    [cob({ sheet_id: '40', total_bruto: '8234758.25', fecha_cobro: '2026-08-14' }), cob({ sheet_id: '41', total_bruto: '5000000' })],
  )
  assert.equal(r.motivo, 'propuesto')
  assert.equal(r.propuesta.fila, 44, 'la fila FÍSICA es la columna A + 4')
  assert.equal(r.propuesta.dif_dias, 17)
  assert.equal(r.propuesta.dif_pct, 0)
})

test('Messina Pilón: $3.488.735 contra $3.484.558 entra en el ±1 %', () => {
  const [r] = proponerVinculos(
    [pago({ id: 'pilon', cliente_id: ME, monto: '3488735', fecha: '2026-08-28' })],
    [cob({ sheet_id: '30', cliente_id: ME, total_bruto: '3484558', fecha_cobro: '2026-09-10' })],
  )
  assert.equal(r.motivo, 'propuesto')
  assert.ok(r.propuesta.dif_pct > 0.001 && r.propuesta.dif_pct < 0.002)
  assert.equal(r.propuesta.dif_dias, 13)
})

test('otro cliente, otra moneda, fuera de ±1 %, fuera de 45 días, anulada o ya vinculada: no es candidata', () => {
  const p = pago({ monto: '100' })
  assert.equal(candidatos(p, [cob({ cliente_id: ME })]).length, 0, 'otro cliente')
  assert.equal(candidatos(p, [cob({ moneda: 'USD' })]).length, 0, 'otra moneda')
  assert.equal(candidatos(p, [cob({ total_bruto: '101.5' })]).length, 0, 'fuera de tolerancia')
  assert.equal(candidatos(p, [cob({ fecha_cobro: '2026-10-20' })]).length, 0, 'fuera de la ventana')
  assert.equal(candidatos(p, [cob({ estado: 'CANCELAR' })]).length, 0, 'anulada')
  assert.equal(candidatos(p, [cob({ sheet_id: '1' })], new Set([`${LE}:5`])).length, 0, 'ya vinculada a otra fila')
})

test('DUPLICADO: la única fila que calza ya está vinculada a otra fila del esquema — se dice cuál', () => {
  // Lo que midió la primera corrida sobre la base (14/09/2026): «Faltante (2 de 2)» calza exacto con
  // Cobranzas id 40, que ya está atada a la fila del esquema «Faltante - GALPON 9». No es un vínculo
  // que falta: es una copia vieja que hay que retirar.
  const vinculadas = new Map([[`${LE}:44`, '51ec4894-8eae-49e0-8810-499ddbfdcf60']])
  const [r] = proponerVinculos(
    [pago({ id: '61231eb7', monto: '8234758.25', fecha: '2026-08-31', concepto: 'Faltante (2 de 2)' })],
    [cob({ sheet_id: '40', total_bruto: '8234758.25', fecha_cobro: '2026-08-14', estado: 'Cobrado' })],
    vinculadas,
  )
  assert.equal(r.motivo, 'duplicado')
  assert.equal(r.propuesta, null, 'nunca se propone vincular dos filas del esquema a la misma de Cobranzas')
  assert.equal(r.duplicado_de, '51ec4894-8eae-49e0-8810-499ddbfdcf60')
  assert.equal(sqlDelVinculo(r), null)
  const sql = sqlDelDuplicado(r)
  assert.match(sql, /ya vinculada a '51ec4894/)
  assert.ok(sql.split('\n').every((l) => l.startsWith('--')), 'el retiro sale comentado: lo decide quien revisa')
})

test('dos candidatas idénticas son AMBIGUO: no se elige una por orden de llegada', () => {
  const [r] = proponerVinculos([pago({})], [cob({ sheet_id: '1' }), cob({ sheet_id: '2' })])
  assert.equal(r.motivo, 'ambiguo')
  assert.equal(r.propuesta, null)
  assert.equal(r.candidatos.length, 2)
})

test('Quattropani: con importes iguales decide la certificación, y una distinta no es candidata', () => {
  const p = pago({ moneda: 'USD', monto: '4235', fecha: '2026-10-09', concepto: 'Certificación 3/9' })
  const filas = [
    cob({ sheet_id: '64', moneda: 'USD', total_bruto: '6300000', total_bruto_origen: '4235', fecha_cobro: '2026-10-09', concepto: 'Certificación 2/9' }),
    cob({ sheet_id: '65', moneda: 'USD', total_bruto: '6300000', total_bruto_origen: '4235', fecha_cobro: '2026-10-09', concepto: 'Certificación 3/9' }),
  ]
  const [r] = proponerVinculos([p], filas)
  assert.equal(r.motivo, 'propuesto')
  assert.equal(r.propuesta.sheet_id, '65')
  assert.equal(r.candidatos.length, 1, 'la certificación 2/9 ni siquiera es candidata')
})

test('dos pagos que eligen la misma fila son CONFLICTO y ninguno se propone', () => {
  const res = proponerVinculos([pago({ id: 'a' }), pago({ id: 'b' })], [cob({ sheet_id: '7' })])
  assert.deepEqual(res.map((r) => r.motivo), ['conflicto', 'conflicto'])
})

test('el SQL no pisa un vínculo existente y lleva la huella', () => {
  const [r] = proponerVinculos([pago({ id: "o'hara" })], [cob({ sheet_id: '9', numero_comprobante: '01-00000225', monto_neto: '5008660.65' })])
  const sql = sqlDelVinculo(r)
  assert.match(sql, /set cobranza_fila = 13, huella_comprobante = '01-00000225', huella_monto = 5008660\.65/)
  assert.match(sql, /where id = 'o''hara' and cobranza_fila is null;$/)
  assert.equal(sqlDelVinculo({ propuesta: null }), null)
})
