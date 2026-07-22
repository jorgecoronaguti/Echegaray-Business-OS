import test from 'node:test'
import assert from 'node:assert/strict'
import { MOVIMIENTOS, CUENTA, TARJETA, ACUERDO, verificarCadena, porTipo, ingresosPorNaturaleza, naturalezaIngreso, enCartera, endosados, totalEcheqs, antiguedadDias } from './banco-santander.mjs'

// EL TEST QUE HACE CONFIABLE LA TRANSCRIPCIÓN. El extracto es una cadena: saldo(n) = saldo(n−1) +
// importe(n). Si tipeé mal un dígito, la cadena se rompe y esto falla. Sin este test, los 71
// movimientos serían una lista de números que PARECEN ciertos, que es exactamente lo que la regla
// de oro prohíbe.
test('la transcripción del extracto encadena y termina en el último saldo del detalle', () => {
  const { rotas, saldoFinal } = verificarCadena()
  assert.deepEqual(rotas, [], 'hay filas donde el saldo no cierra: la transcripción tiene un error')
  // El detalle cierra en el saldo del último movimiento (Vono, 22/07). El saldo DECLARADO del día es
  // menor (cheque Nº 221 del día + $143.500 sin detalle): esos dos números son distintos a propósito.
  assert.equal(saldoFinal, CUENTA.saldoUltimoMovimiento)
  assert.equal(CUENTA.saldoPesos, 5251630.74)
  assert.equal(CUENTA.saldoUltimoMovimiento - CUENTA.saldoPesos, -CUENTA.saldoPendienteConciliar)
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
  // Desde el 21/07 los créditos ya no se agrupan como "Ingresos" a secas: un crédito puede ser un
  // cobro, un traslado de plata propia o un rescate de inversión, y mezclarlos hizo que el OS
  // reportara $11,9M "faltantes" que eran del rescate de Balanz.
  assert.equal(t.find((x) => x.tipo === 'Traslados de fondos propios (no es ingreso)').cantidad, 3)
  assert.equal(t.find((x) => x.tipo === 'Rescates de inversión y financiero').cantidad, 1)
  assert.equal(t.find((x) => x.tipo === 'Ingresos'), undefined, 'un crédito no es automáticamente un ingreso')
})

test('el rescate de Balanz NO se cuenta como cobranza', () => {
  // El caso que originó la distinción: $11.913.568 del 16/07, CUIT 30710630670. Es plata de la
  // empresa que estaba invertida y volvió a la cuenta: contarla como cobro infla el cash flow.
  const i = ingresosPorNaturaleza()
  assert.equal(i.totales.financiero, 11913568.24)
  // Depósitos de efectivo ($9,96M) + dos echeq acreditados ($10M el 16/07 + $15M el 01/07) + la
  // reversa de impuesto de $294,78 (que el banco generó, no un cliente).
  assert.equal(i.totales.traslado, 9960000 + 10000000 + 15000000 + 294.78, 'plata propia y ajustes del banco, no cobros')
  assert.equal(i.totales.cobranza, 0, 'en la ventana del extracto no entró un peso por transferencia de un cliente')
})

test('un número de once cifras que no es CUIT no identifica a nadie', () => {
  // `extraer` valida el dígito verificador: un número de lote no puede hacerse pasar por contraparte.
  assert.equal(naturalezaIngreso({ concepto: 'Transferencia Recibida - Lote 12345678901', importe: 1 }), 'cobranza')
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
  assert.equal(antiguedadDias(new Date(2026, 6, 22)), 0)
  assert.equal(antiguedadDias(new Date(2026, 6, 29)), 7)
})
