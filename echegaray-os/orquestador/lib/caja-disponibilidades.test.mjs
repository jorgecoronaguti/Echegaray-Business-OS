import test from 'node:test'
import assert from 'node:assert/strict'
import { CUENTAS, CARGA, ALIAS, filaDeCuenta, aPesos, margenTarjeta, disponibilidadNeta, echeqsEnCartera, ubicarCaja } from './caja-disponibilidades.mjs'

const cuenta = (n) => CUENTAS.find((c) => c.nombre === n)

test('cada cuenta declara su moneda y hay una en dólares', () => {
  assert.ok(CUENTAS.every((c) => c.moneda === 'ARS' || c.moneda === 'USD'))
  assert.equal(cuenta('Banco — Cuenta corriente en dólares').moneda, 'USD')
})

// El día que le pongan el nombre real al banco, el saldo cargado tiene que seguir en SU fila.
test('el patrón del banco sobrevive a que le pongan el nombre y no se cruza con la de dólares', () => {
  const pesos = cuenta('Banco — Cuenta corriente en pesos').patron
  const dolares = cuenta('Banco — Cuenta corriente en dólares').patron
  assert.ok(pesos.test('Banco Galicia — Cuenta corriente en pesos'))
  assert.ok(pesos.test('Banco Galicia — Cuenta corriente'))
  assert.ok(!pesos.test('Banco Galicia — Cuenta corriente en dólares'))
  assert.ok(dolares.test('Banco Galicia — Cuenta corriente en dolares'))
})

test('renombrar el límite de la tarjeta no pierde el dato ya cargado', () => {
  assert.ok(filaDeCuenta('Tarjeta de crédito — límite acordado'))
  assert.equal(ALIAS.get('Tarjeta de crédito — límite acordado'), CARGA.limitePesos)
  assert.ok(filaDeCuenta(CARGA.limiteDolares))
  assert.ok(!filaDeCuenta('TOTAL DISPONIBILIDADES'))
})

// Un saldo en dólares valuado en $0 porque falta el tipo de cambio es peor que no mostrarlo:
// se suma como cero y baja el total sin avisar.
test('sin tipo de cambio, los dólares no valen cero: no valen nada declarado', () => {
  assert.equal(aPesos(1000, 'ARS'), 1000)
  assert.equal(aPesos(100, 'USD', 1500), 150000)
  assert.equal(aPesos(100, 'USD', null), null)
  assert.equal(aPesos(100, 'USD', 0), null)
  assert.equal(aPesos('', 'ARS'), null)
})

test('el margen de tarjeta sin límite cargado es null, nunca cero', () => {
  assert.equal(margenTarjeta(10000000, 5749675), 4250325)
  assert.equal(margenTarjeta('', 5749675), null)
  assert.equal(disponibilidadNeta(37321331, 12763876), 24557455)
})

// El corte es la FECHA, no el estado: en Cobranzas hay echeqs marcados "Cobrado" con acreditación
// futura. El estado lo escribe una persona y se adelanta; la fecha es el hecho.
test('un echeq está en cartera hasta el día que se acredita, diga lo que diga su estado', () => {
  const hoy = new Date(2026, 6, 21)
  const filas = [
    { fila: 16, forma: 'Echeq', fecha: new Date(2026, 3, 20), importe: 15000000 },
    { fila: 37, forma: 'Echeq', fecha: new Date(2026, 6, 31), importe: 10000000 },
    { fila: 48, forma: 'Echeq', fecha: new Date(2026, 7, 31), importe: 10000000 },
    { fila: 43, forma: 'Echeq', fecha: new Date(2026, 7, 15), importe: 10000000 },
    { fila: 5, forma: 'Transferencia', fecha: new Date(2026, 8, 1), importe: 9491440 },
    { fila: 9, forma: 'Echeq', fecha: null, importe: 1000 },
  ]
  const c = echeqsEnCartera(filas, hoy)
  assert.deepEqual(c.map((x) => x.fila), [37, 43, 48])
  assert.equal(c.reduce((a, x) => a + x.importe, 0), 30000000)
})

// EL DEFECTO QUE NINGÚN CONTROL VIO (21/07): el Cash Flow Mensual apuntaba a 'Caja'!$B$10 para su
// "Efectivo al inicio". Al agregar la columna de moneda, el total pasó a la E y las dos líneas de
// cierre quedaron en blanco con un aviso de "sin saldo cargado" que era falso. Ninguna suma cambió.
test('el saldo se ubica por rótulo y no por letra de columna', () => {
  const filas = [
    ['CAJA Y BANCOS — DISPONIBILIDADES'],
    ['1 · DISPONIBILIDADES — lo que hay HOY'],
    ['Cuenta', 'Moneda', 'Saldo en moneda de origen', 'Tipo de cambio', 'Saldo en pesos', 'Fecha del saldo'],
    ['Caja en pesos', 'ARS', 1725000, '', 1725000, '21/07/2026'],
    ['Banco — Cuenta corriente en dólares', 'USD', '', 1481, '', ''],
    ['Valores a depositar (cheques de terceros en cartera)', 'ARS', 30000000, '', 30000000, '21/07/2026'],
    ['      · LA ESTRELLA', 'ARS', 10000000, '', 10000000, '31/08/2026'],
    ['TOTAL DISPONIBILIDADES', '', '', '', 37321331],
  ]
  const u = ubicarCaja(filas)
  assert.equal(u.colPesos, 'E')
  assert.equal(u.colFecha, 'F')
  assert.equal(u.filaTotal, 8)
  // El rango de fechas TERMINA en la última cuenta: los cheques del desplegable tienen fechas de
  // acreditación futuras y un MAX que las incluya ancla el cuadro dos meses adelante.
  assert.equal(u.filaUltimaCuenta, 6)
  assert.equal(ubicarCaja([['otra cosa']]), null)
})
