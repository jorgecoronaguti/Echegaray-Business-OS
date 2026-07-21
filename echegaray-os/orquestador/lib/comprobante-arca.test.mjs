import { test } from 'node:test'
import assert from 'node:assert/strict'
import { signo, esNotaDeCredito, sumar, sqlConSigno, nombreTipo, NOTAS_DE_CREDITO, SUMAN } from './comprobante-arca.mjs'

test('una nota de crédito resta', () => {
  for (const t of ['3', '8', '13', '112']) assert.equal(signo(t), -1, `tipo ${t} debería restar`)
})

test('una factura suma', () => {
  for (const t of ['1', '6', '11', '81', '201']) assert.equal(signo(t), 1, `tipo ${t} debería sumar`)
})

test('una nota de DÉBITO suma — no confundirla con la de crédito', () => {
  // Es el error fácil: los dos son "notas". La de débito aumenta la deuda, la de crédito la baja.
  for (const t of ['2', '7', '12', '202']) assert.equal(signo(t), 1, `la nota de débito ${t} suma`)
})

test('un tipo desconocido devuelve null, NO +1', () => {
  // ESTA ES LA DECISIÓN QUE IMPORTA. Asumir que lo desconocido suma es exactamente el bug que
  // costó $41.953.276 en compras y $7.231.456 de IVA.
  for (const t of ['999', 'X', '', null, undefined]) assert.equal(signo(t), null, `${JSON.stringify(t)} no se puede adivinar`)
})

test('ningún código está en las dos listas a la vez', () => {
  for (const t of NOTAS_DE_CREDITO) assert.ok(!SUMAN.has(t), `el tipo ${t} está en las dos listas`)
})

test('reproduce el caso real de mayo: ACEROLATINA y FRIOLATINA', () => {
  // Las dos facturas y las dos notas de crédito que dieron vuelta la posición de IVA de mayo.
  const mayo = [
    { tipo_comprobante: '1', imp_total: 9823175 },  // ACEROLATINA factura
    { tipo_comprobante: '3', imp_total: 9823178 },  // ACEROLATINA nota de crédito
    { tipo_comprobante: '1', imp_total: 9272807 },  // FRIOLATINA factura
    { tipo_comprobante: '3', imp_total: 9272821 },  // FRIOLATINA nota de crédito
  ]
  const r = sumar(mayo)
  // Sumando crudo daría $38.191.981. Con signo, las notas anulan casi todo: quedan $17 de redondeo
  // entre lo facturado y lo acreditado.
  assert.equal(r.neto, -17)
  assert.equal(r.suman, 19095982)
  assert.equal(r.restan, 19095999)
})

test('los comprobantes de tipo desconocido se apartan, no se suman', () => {
  const r = sumar([{ tipo_comprobante: '1', imp_total: 100 }, { tipo_comprobante: '777', imp_total: 5000 }])
  assert.equal(r.neto, 100, 'el desconocido NO entró al total')
  assert.equal(r.desconocidos.length, 1)
})

test('sumar respeta el campo pedido', () => {
  const c = [{ tipo_comprobante: '1', total_iva: 21 }, { tipo_comprobante: '3', total_iva: 5 }]
  assert.equal(sumar(c, 'total_iva').neto, 16)
})

test('el SQL y el JS aplican la misma regla', () => {
  const sql = sqlConSigno('total_iva')
  for (const t of NOTAS_DE_CREDITO) assert.ok(sql.includes(`'${t}'`), `el SQL no contempla el tipo ${t}`)
  assert.match(sql, /-total_iva/)
})

test('nombreTipo dice cuando no sabe', () => {
  assert.equal(nombreTipo('3'), 'Nota de Crédito A')
  assert.match(nombreTipo('999'), /desconocido/)
})

test('esNotaDeCredito no dice que sí ante un desconocido', () => {
  assert.equal(esNotaDeCredito('999'), false)
  assert.equal(esNotaDeCredito('3'), true)
})
