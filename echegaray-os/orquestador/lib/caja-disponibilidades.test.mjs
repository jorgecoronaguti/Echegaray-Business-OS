import test from 'node:test'
import assert from 'node:assert/strict'
import { CUENTAS, CARGA, ALIAS, filaDeCuenta, aPesos, margenTarjeta, disponibilidadNeta, echeqsEnCartera, ubicarCaja } from './caja-disponibilidades.mjs'

const cuenta = (n) => CUENTAS.find((c) => c.nombre === n)

test('cada cuenta declara su moneda y hay una en dólares', () => {
  assert.ok(CUENTAS.every((c) => c.moneda === 'ARS' || c.moneda === 'USD'))
  assert.equal(cuenta('Banco Santander — Cuenta corriente en dólares').moneda, 'USD')
})

// El día que le pongan el nombre real al banco, el saldo cargado tiene que seguir en SU fila.
test('el patrón del banco sobrevive a que le pongan el nombre y no se cruza con la de dólares', () => {
  const pesos = cuenta('Banco Santander — Cuenta corriente en pesos 179-091383/6').patron
  const dolares = cuenta('Banco Santander — Cuenta corriente en dólares').patron
  assert.ok(pesos.test('Banco Galicia — Cuenta corriente en pesos'))
  assert.ok(pesos.test('Banco Galicia — Cuenta corriente'))
  assert.ok(!pesos.test('Banco Galicia — Cuenta corriente en dólares'))
  assert.ok(dolares.test('Banco Galicia — Cuenta corriente en dolares'))
})

// Los nombres de las filas cambiaron dos veces en dos días. Un dato cargado tiene que sobrevivir a
// eso: el ALIAS es lo único que lo garantiza.
test('renombrar una fila no pierde el dato ya cargado', () => {
  assert.ok(filaDeCuenta('Tarjeta de crédito — límite acordado en pesos'))
  assert.equal(ALIAS.get('Tarjeta de crédito — límite acordado en pesos'), CARGA.limiteTarjeta)
  assert.equal(ALIAS.get('Banco — Cuenta corriente en pesos'), 'Banco Santander — Cuenta corriente en pesos 179-091383/6')
  assert.ok(filaDeCuenta(CARGA.acuerdo))
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

// EL HALLAZGO DEL 21/07, CONGELADO EN UN TEST: CAJA decía $30.000.000 de cheques en cartera y el
// banco dice $10.000.000. Dos de los tres están endosados a Alumetal: se usaron para pagarle.
// Cobranzas registra que se cobró —y es cierto— pero no sabe qué pasó después con el valor.
test('un echeq endosado ya no es plata de la empresa', async () => {
  const b = await import('./banco-santander.mjs')
  assert.equal(b.totalEcheqs(b.enCartera()), 10000000)
  assert.equal(b.totalEcheqs(b.endosados()), 20000000)
  assert.deepEqual(b.endosados().map((e) => e.beneficiario), ['ALUMETAL S.A', 'ALUMETAL S.A'])
  // Un cobrado ya está adentro del saldo del banco: contarlo en cartera lo duplicaría.
  assert.ok(b.enCartera().every((e) => e.estado === 'custodia'))
})

// La tarjeta tiene UN cupo, no dos. Modelarla con un límite en pesos y otro en dólares mostraba un
// aire que no existe: los consumos en dólares se pagan contra el mismo $10.000.000.
test('la tarjeta tiene un solo límite y el disponible lo declara el banco', async () => {
  const { TARJETA } = await import('./banco-santander.mjs')
  assert.equal(TARJETA.limite, 10000000)
  assert.ok(TARJETA.consumidoPesos > 0 && TARJETA.consumidoDolares > 0)
  // NO se recalcula: límite − consumido daría $9.001.636,47 y el banco dice $9.062.069,50.
  assert.equal(TARJETA.disponible, 9062069.50)
  assert.notEqual(TARJETA.disponible, TARJETA.limite - TARJETA.consumidoPesos)
})
