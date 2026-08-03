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
  // El detalle cierra en el saldo del último movimiento (Vono, 22/07). El saldo DECLARADO del día es
  // menor (cheque Nº 221 + transf. a Katsuda + $143.500 sin detalle, neto de la recibida de
  // Manufacturas): esos dos números son distintos a propósito. Saldo de la descarga de las 15:50.
  assert.equal(saldoFinal, CUENTA.saldoUltimoMovimiento)
  assert.equal(CUENTA.saldoPesos, 4985898.23)
  assert.ok(Math.abs((CUENTA.saldoUltimoMovimiento - CUENTA.saldoPesos) - -CUENTA.saldoPendienteConciliar) < 0.01)
})

test('los movimientos del día encadenan desde el cierre del detalle hasta el saldo declarado', () => {
  // _BANCO_RAW los anexa después de MOVIMIENTOS; el último saldo tiene que ser el DECLARADO, que es lo
  // que CAJA muestra como disponibilidad. Sin esto, la caja mostraría el último saldo corrido del
  // detalle ($5.595.130,74) y no lo que el banco realmente tiene hoy.
  let saldo = CUENTA.saldoUltimoMovimiento
  for (const m of MOVIMIENTOS_DIA) {
    saldo = Math.round((saldo + m.importe) * 100) / 100
    assert.equal(saldo, m.saldo, `el saldo corrido de "${m.concepto}" no cierra`)
  }
  assert.equal(MOVIMIENTOS_DIA.at(-1).saldo, CUENTA.saldoPesos)
  // El tramo sin detalle tiene su propio bucket, para no ensuciar la conciliación por naturaleza.
  assert.equal(clasificarMovimiento('Diferencia sin detalle del banco (hold intradia)'), 'Ajuste sin detalle del banco')
})

test('cada movimiento tiene fecha, concepto e importe', () => {
  for (const m of MOVIMIENTOS) {
    assert.match(m.fecha, /^\d{4}-\d{2}-\d{2}$/)
    assert.ok(m.concepto.trim().length > 3)
    assert.ok(Number.isFinite(m.importe) && m.importe !== 0)
  }
})

// UN ECHEQ QUE ENTRA NO ES UN CHEQUE QUE SALE (28/07). "Deposito E-cheq Int Misma Plaza" es un
// echeq de tercero acreditado: plata que ENTRA. Antes matcheaba /e-?cheq/ y caía en el bucket
// "Cheques y echeq" —que es de SALIDAS y cuyo destino es la columna DEBITADO de Cheques Emitidos—,
// registrando un ingreso como una salida. En la data real eran $58.940.000 que dejaban ese bucket
// en +$38M: un grupo de egresos en positivo es la señal exacta de que la clasificación está mal.
// Ahora un crédito se resuelve por su naturaleza ANTES del bucket de cheques.
test('un echeq acreditado es un traslado que ENTRA, no un cheque que sale', () => {
  // El crédito se clasifica como traslado (plata propia cambiando de lugar), NUNCA como cheque.
  assert.equal(clasificarMovimiento('Deposito e-cheq int misma plaza'), 'Traslados de fondos propios (no es ingreso)')
  assert.equal(clasificarMovimiento('Deposito e-cheq int ots plazas'), 'Traslados de fondos propios (no es ingreso)')
  // Las SALIDAS de echeq siguen en el bucket de cheques: el banco las debita contra Cheques Emitidos.
  assert.equal(clasificarMovimiento('Echeq clearing recibido 48hs'), 'Cheques y echeq')
  assert.equal(clasificarMovimiento('Canje interno recibido 24 hs'), 'Cheques y echeq')
  assert.equal(clasificarMovimiento('Echeq canje interno recibido 24hs'), 'Cheques y echeq')
  assert.equal(clasificarMovimiento('Cheque debitado - Nº 221'), 'Cheques y echeq')
  // Y las variantes de escritura de la MISMA salida: el banco cambia mayúsculas, espacios y el
  // pegado de "24hs" entre descargas. Con el literal viejo, cualquiera de éstas caía en
  // "Transferencias a proveedores" y el cheque quedaba figurando como vencido sin debitar.
  assert.equal(clasificarMovimiento('CANJE  INTERNO   RECIBIDO 24HS'), 'Cheques y echeq')
  assert.equal(clasificarMovimiento('Canje interno recibído 24 horas'), 'Cheques y echeq')
  // El bucket de cheques, mirando SÓLO lo que sale, no puede dar positivo.
  const soloSalidas = MOVIMIENTOS.filter((m) => clasificarMovimiento(m.concepto) === 'Cheques y echeq')
  assert.ok(soloSalidas.every((m) => m.importe < 0), 'el bucket de cheques quedó con un crédito adentro')
})

test('los créditos se agrupan por su naturaleza, no como "Ingresos" a secas', () => {
  const t = porTipo()
  const prov = t.find((x) => x.tipo === 'Transferencias a proveedores')
  assert.ok(prov.monto < 0, 'un grupo de pagos a proveedores no puede dar positivo')
  // Desde el 21/07 los créditos ya no se agrupan como "Ingresos" a secas: un crédito puede ser un
  // cobro, un traslado de plata propia o un rescate de inversión, y mezclarlos hizo que el OS
  // reportara $11,9M "faltantes" que eran del rescate de Balanz. En la ventana de referencia los
  // traslados son 3 depósitos de efectivo + 2 depósitos de e-cheq acreditados = 5.
  assert.equal(t.find((x) => x.tipo === 'Traslados de fondos propios (no es ingreso)').cantidad, 5)
  assert.equal(t.find((x) => x.tipo === 'Rescates de inversión y financiero').cantidad, 1)
  assert.equal(t.find((x) => x.tipo === 'Ingresos'), undefined, 'un crédito no es automáticamente un ingreso')
})

// Una compra en el exterior con tarjeta (Google Workspace, tarj nro. 6077) es un consumo de tarjeta,
// no un pago a proveedor por transferencia. Sin esto inflaba "Transferencias a proveedores".
test('la compra en el exterior con tarjeta es consumo de tarjeta, no pago a proveedor', () => {
  assert.equal(clasificarMovimiento('Compra en el exterior - Google workspace ecsas.co - tarj nro. 6077'), 'Compras con tarjeta de débito')
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
