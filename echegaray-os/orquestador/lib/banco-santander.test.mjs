import test from 'node:test'
import assert from 'node:assert/strict'
import { MOVIMIENTOS, CUENTA, TARJETA, ACUERDO, verificarCadena, porTipo, enCartera, endosados, totalEcheqs, antiguedadDias } from './banco-santander.mjs'

// EL TEST QUE HACE CONFIABLE LA TRANSCRIPCIÓN. El extracto es una cadena: saldo(n) = saldo(n−1) +
// importe(n). Si tipeé mal un dígito, la cadena se rompe y esto falla. Sin este test, los 71
// movimientos serían una lista de números que PARECEN ciertos, que es exactamente lo que la regla
// de oro prohíbe.
test('la transcripción del extracto encadena y termina en el saldo del banco', () => {
  const { rotas, saldoFinal } = verificarCadena()
  assert.deepEqual(rotas, [], 'hay filas donde el saldo no cierra: la transcripción tiene un error')
  assert.equal(saldoFinal, CUENTA.saldoPesos)
})

test('cada movimiento tiene fecha, concepto e importe', () => {
  for (const m of MOVIMIENTOS) {
    assert.match(m.fecha, /^\d{4}-\d{2}-\d{2}$/)
    assert.ok(m.concepto.trim().length > 3)
    assert.ok(Number.isFinite(m.importe) && m.importe !== 0)
  }
})

// "Deposito E-cheq Int Misma Plaza" no matcheaba /echeq/ por el guion, y sus $10.000.000 caían en
// "transferencias a proveedores" — que quedaba en POSITIVO. Un grupo de egresos con signo más es la
// señal de que la clasificación está mal.
test('los echeq se reconocen con guion y sin guion', () => {
  const t = porTipo()
  const prov = t.find((x) => x.tipo === 'Transferencias a proveedores')
  assert.ok(prov.monto < 0, 'un grupo de pagos a proveedores no puede dar positivo')
  assert.equal(t.find((x) => x.tipo === 'Ingresos').cantidad, 4)
})

test('el impuesto al cheque y el costo del descubierto salen separados', () => {
  const t = porTipo()
  assert.ok(t.find((x) => x.tipo === 'Impuesto al cheque (Ley 25.413)').cantidad >= 10)
  assert.ok(t.find((x) => x.tipo === 'Costo financiero del descubierto').monto < 0)
})

test('la cartera de echeqs no mezcla lo entregado con lo propio', () => {
  assert.equal(totalEcheqs(enCartera()), 10000000)
  assert.equal(totalEcheqs(endosados()), 20000000)
  assert.equal(enCartera().length + endosados().length + 5, 8)
})

// El acuerdo y la tarjeta NO son caja. Que estén en el archivo es útil; que sumen sería el error que
// hace que una empresa se crea líquida el día antes de no poder pagar sueldos.
test('el acuerdo y la tarjeta tienen su costo y su vencimiento declarados', () => {
  assert.ok(ACUERDO.importe > 0 && ACUERDO.cft > 0)
  assert.match(ACUERDO.vence, /^\d{4}-\d{2}-\d{2}$/)
  assert.ok(TARJETA.limite > 0 && TARJETA.vence)
})

test('la foto sabe cuántos días tiene', () => {
  assert.equal(antiguedadDias(new Date(2026, 6, 21)), 0)
  assert.equal(antiguedadDias(new Date(2026, 6, 28)), 7)
})
