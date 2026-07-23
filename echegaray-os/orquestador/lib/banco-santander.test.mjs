import test from 'node:test'
import assert from 'node:assert/strict'
import { MOVIMIENTOS, MOVIMIENTOS_DIA, CUENTA, TARJETA, ACUERDO, verificarCadena, porTipo, ingresosPorNaturaleza, naturalezaIngreso, enCartera, endosados, totalEcheqs, antiguedadDias, clasificarMovimiento } from './banco-santander.mjs'

// EL TEST QUE HACE CONFIABLE LA TRANSCRIPCIÓN. El extracto es una cadena: saldo(n) = saldo(n−1) +
// importe(n). Si tipeé mal un dígito, la cadena se rompe y esto falla. Sin este test, los 71
// movimientos serían una lista de números que PARECEN ciertos, que es exactamente lo que la regla
// de oro prohíbe.
test('la transcripción del extracto encadena y termina en el último saldo del detalle', () => {
  const { rotas, saldoFinal } = verificarCadena()
  assert.deepEqual(rotas, [], 'hay filas donde el saldo no cierra: la transcripción tiene un error')
  // El detalle cierra en el último saldo que el banco CONFIRMA (impuesto al cheque del 22/07).
  assert.equal(saldoFinal, CUENTA.saldoUltimoMovimiento)
  // Y ya no queda nada "sin explicar": los $143.500 que figuraban como pendientes de conciliar eran
  // un saldo de apertura mal tomado, no un tramo que el banco esconda. Ver banco-importar.test.mjs.
  assert.equal(CUENTA.saldoPendienteConciliar, 0)
})

test('el saldo DECLARADO no incluye lo que el banco todavía no acreditó', () => {
  // Al 23/07 el banco declara $4.813.461,54 = último confirmado − la compra del día. El depósito de
  // e-cheq de otras plazas por $3.940.000 está en clearing: contarlo como disponible sería contar
  // plata que no está. Los movimientos del día van SIN saldo (null), nunca con cero.
  for (const m of MOVIMIENTOS_DIA) assert.equal(m.saldo, null, `"${m.concepto}" no puede traer saldo corrido`)
  const yaImpactaron = MOVIMIENTOS_DIA.filter((m) => m.importe < 0).reduce((s, m) => s + m.importe, 0)
  assert.equal(Math.round((CUENTA.saldoUltimoMovimiento + yaImpactaron) * 100) / 100, CUENTA.saldoPesos)
  assert.equal(CUENTA.saldoPesos, 4813461.54)
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
  // Al 23/07 aparece una sola transferencia de un tercero: $4.267,49 de Manufacturas Químicas
  // (CUIT 30620311703) el 22/07. Antes quedaba fuera de esta cuenta por un motivo que no era
  // económico —estaba en MOVIMIENTOS_DIA, que este cálculo no mira— y ahora está en la cadena.
  // Es plata de afuera y se cuenta como cobranza; el tamaño sugiere un reintegro, no una venta.
  assert.equal(i.totales.cobranza, 4267.49)
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
  // 23/07: la cartera pasó a $10.290.000 al incorporar el eCheq que el banco tiene en custodia desde
  // el 22/07 (operación 7934081). Antes decía $10.000.000 y el banco decía $10.290.000.
  assert.equal(totalEcheqs(enCartera()), 10290000)
  assert.equal(totalEcheqs(endosados()), 20000000)
  assert.equal(enCartera().length + endosados().length + 5, 9)
})

// ═══ LO QUE FALTA SE NOMBRA, NO SE COMPLETA (23/07) ═══
//
// El eCheq de $290.000 está en custodia y no hay forma de saber quién lo emitió: la consulta de
// operaciones del Santander da id, tipo, fecha e importe, y el dato no aparece en Cheques Recibidos,
// ni en Cobranzas, ni en el extracto, ni en el data room. Un emisor plausible inventado no se
// distingue de uno medido: por eso va en null y la pestaña lo dibuja DESCONOCIDO.
test('un valor con medio dato entra a la cartera con el resto DESCONOCIDO', () => {
  const incompleto = enCartera().find((e) => e.falta)
  assert.ok(incompleto, 'el eCheq en custodia sin identificar tiene que estar en la cartera')
  assert.equal(incompleto.importe, 290000)
  assert.equal(incompleto.operacion, '7934081')
  // Ni emisor, ni CUIT, ni número, ni vencimiento inventados.
  for (const k of ['numero', 'emisor', 'cuit', 'pago']) assert.equal(incompleto[k], null, `${k} no se inventa`)
  // Y el faltante está escrito, para que se pueda ir a buscar.
  assert.match(incompleto.falta, /emisor/i)
})

// ═══ UNA ANULACIÓN NO ES UN GASTO (23/07) ═══
//
// El banco reversa el impuesto al cheque con OTRO texto: "Anul imp ley 25.413 debito 0,6%". El
// patrón viejo pedía "Impuesto ley 25.413" y la reversa caía en "Transferencias a proveedores": el
// impuesto de julio quedaba en $485.253,16 cuando el costo real del mes es $484.958,38. Es el mismo
// error de signo que con las notas de crédito de ARCA.
test('la reversa del impuesto al cheque se clasifica con el impuesto que anula', () => {
  assert.equal(clasificarMovimiento('Anul imp ley 25.413 debito 0,6%'), 'Impuesto al cheque (Ley 25.413)')
  assert.equal(clasificarMovimiento('Impuesto ley 25.413 debito 0,6%'), 'Impuesto al cheque (Ley 25.413)')
  assert.equal(clasificarMovimiento('Impuesto ley 25.413 credito 0,6%'), 'Impuesto al cheque (Ley 25.413)')
})

test('el impuesto al cheque de julio es NETO de la anulación', () => {
  // El cuadro suma el importe CON SIGNO y lo da vuelta (los débitos vienen negativos), así que la
  // reversa resta sola. Con ABS —lo que había— la anulación sumaba y daba $485.547,94.
  const julio = MOVIMIENTOS.filter((m) => m.fecha.startsWith('2026-07')
    && clasificarMovimiento(m.concepto) === 'Impuesto al cheque (Ley 25.413)')
  const neto = -julio.reduce((s, m) => s + m.importe, 0)
  assert.equal(Math.round(neto * 100) / 100, 484958.38)
  // Y la reversa está adentro del conjunto: si dejara de estarlo, el neto volvería a $485.253,16.
  assert.ok(julio.some((m) => /^anul/i.test(m.concepto)), 'la anulación del 01/07 tiene que contar')
})

// El acuerdo y la tarjeta NO son caja. Que estén en el archivo es útil; que sumen sería el error que
// hace que una empresa se crea líquida el día antes de no poder pagar sueldos.
test('el acuerdo y la tarjeta tienen su costo y su vencimiento declarados', () => {
  assert.ok(ACUERDO.importe > 0 && ACUERDO.cft > 0)
  assert.match(ACUERDO.vence, /^\d{4}-\d{2}-\d{2}$/)
  assert.ok(TARJETA.limite > 0 && TARJETA.vence)
})

test('la foto sabe cuántos días tiene', () => {
  assert.equal(antiguedadDias(new Date(2026, 6, 23)), 0)
  assert.equal(antiguedadDias(new Date(2026, 6, 30)), 7)
})
