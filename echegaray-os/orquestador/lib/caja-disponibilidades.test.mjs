import test from 'node:test'
import assert from 'node:assert/strict'
import { CUENTAS, CARGA, ALIAS, filaDeCuenta, aPesos, margenTarjeta, disponibilidadNeta, echeqsEnCartera, ubicarCaja } from './caja-disponibilidades.mjs'

const cuenta = (n) => CUENTAS.find((c) => c.nombre === n)

test('cada cuenta declara su moneda y hay una en dólares', () => {
  assert.ok(CUENTAS.every((c) => c.moneda === 'ARS' || c.moneda === 'USD'))
  assert.equal(cuenta('Santander · cta cte USD').moneda, 'USD')
})

// El patrón separa ARS de USD por la moneda explícita del rótulo, sin cruzarse.
test('el patrón de la cuenta bancaria separa ARS de USD sin cruzarse', () => {
  const pesos = cuenta('Santander · cta cte ARS').patron
  const dolares = cuenta('Santander · cta cte USD').patron
  assert.ok(pesos.test('Santander · cta cte ARS'))
  assert.ok(!pesos.test('Santander · cta cte USD'))
  assert.ok(dolares.test('Santander · cta cte USD'))
  assert.ok(!dolares.test('Santander · cta cte ARS'))
})

// Los nombres de las filas cambiaron dos veces en dos días. Un dato cargado tiene que sobrevivir a
// eso: el ALIAS es lo único que lo garantiza.
test('renombrar una fila no pierde el dato ya cargado', () => {
  assert.ok(filaDeCuenta('Tarjeta de crédito — límite acordado en pesos'))
  assert.equal(ALIAS.get('Tarjeta de crédito — límite acordado en pesos'), CARGA.limiteTarjeta)
  assert.equal(ALIAS.get('Banco — Cuenta corriente en pesos'), 'Santander · cta cte ARS')
  assert.equal(ALIAS.get('Banco Santander — Cuenta corriente en pesos 179-091383/6'), 'Santander · cta cte ARS')
  assert.ok(filaDeCuenta(CARGA.acuerdo))
  assert.ok(!filaDeCuenta('TOTAL DISPONIBILIDADES'))
})

// ═══ BALANZ ES INVERTIDO, NO DISPONIBLE (06/08, orden del dueño) ═══
//
// "el concepto de 'caja disponible' tiene que ser lo que se refleja únicamente en el saldo bancario
// (ars y usd) como caja en efectivo (ars y usd), discriminar lo que se encuentra en Balanz invertido".
// El mecanismo es el ‖ de "Valores a depositar": la fila se ve y no suma. Lo que este test protege:
// que el rótulo nuevo siga siendo una fila de cuenta (o el rescate pierde el dato en silencio), que
// el dato cargado con el nombre viejo sobreviva por ALIAS, y que la exclusión esté DECLARADA.
test('las filas Balanz llevan el ‖, declaran noSuma, y el nombre viejo no pierde el dato', () => {
  const ars = cuenta('Balanz · inversiones ARS ‖ invertido')
  const usd = cuenta('Balanz · inversiones USD ‖ invertido')
  assert.ok(ars && usd, 'las dos filas de Balanz existen con su rótulo ‖')
  assert.equal(ars.noSuma, true)
  assert.equal(usd.noSuma, true)
  assert.equal(cuenta('Valores a depositar ‖ no suma al total').noSuma, true)
  // El patrón sobrevive al rótulo nuevo Y al viejo: es lo que devuelve un saldo cargado a su cuenta.
  for (const n of ['Balanz · inversiones ARS ‖ invertido', 'Balanz · inversiones ARS']) {
    assert.ok(ars.patron.test(n), `el patrón ARS tiene que matchear "${n}"`)
    assert.ok(filaDeCuenta(n), `"${n}" tiene que reconocerse como fila de cuenta`)
  }
  assert.ok(!ars.patron.test('Balanz · inversiones USD ‖ invertido'), 'sin cruzarse de moneda')
  assert.equal(ALIAS.get('Balanz · inversiones ARS'), 'Balanz · inversiones ARS ‖ invertido')
  assert.equal(ALIAS.get('Balanz · inversiones USD'), 'Balanz · inversiones USD ‖ invertido')
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
  // ═══ UN PERÍODO SIN CONSUMO EN DÓLARES NO ES UN DEFECTO (04/08) ═══
  //
  // Acá decía `consumidoPesos > 0 && consumidoDolares > 0`. Eso no fijaba una regla: fijaba el
  // ACCIDENTE de la foto del 22/07, que casualmente tenía consumo en las dos monedas. Con la foto
  // del 29/07 —sin un solo consumo en dólares, que es un mes perfectamente normal— el test se puso
  // rojo y el dato correcto parecía el error. Lo que sí tiene que valer siempre es que los dos
  // consumos estén DECLARADOS y no sean negativos: un consumo negativo es un dato mal leído.
  for (const k of ['consumidoPesos', 'consumidoDolares']) {
    assert.equal(typeof TARJETA[k], 'number', `${k} tiene que estar declarado`)
    assert.ok(TARJETA[k] >= 0, `${k} no puede ser negativo`)
  }
  // EL DISPONIBLE LO DICE EL BANCO, NO SE RECALCULA. Es lo que este test protege de verdad:
  // límite − consumido da otro número (hay cuotas y pendientes de confirmación en el medio).
  assert.ok(TARJETA.disponible > 0)
  assert.notEqual(TARJETA.disponible, TARJETA.limite - TARJETA.consumidoPesos)
  // Y la foto tiene fecha: sin `al` no se puede decir cuán vieja es.
  assert.match(String(TARJETA.al ?? ''), /^\d{4}-\d{2}-\d{2}$/)
})

// ═══ EL CONTROL DE LA CARTERA Y LA CARTERA TIENEN QUE MIRAR LA MISMA POBLACIÓN (15/08/2026) ═══
//
// El control le pregunta a Cobranzas por la misma plata que la réplica del banco declara "En
// custodia", para que la diferencia entre los dos signifique algo. La cartera no filtra por fecha:
// cuenta todo lo que no se depositó todavía. Si el control se corta en `>TODAY()`, el echeq que se
// acredita HOY queda de un lado y no del otro, y la diferencia publicada es menor que la real.
//
// El día que se midió eso valía $10.000.000: dos cheques endosados a Alumetal, uno con fecha de hoy
// y otro a fin de mes, y el control declaraba uno solo.
test('el control de la cartera incluye el echeq que se acredita hoy', async () => {
  const { CUENTAS } = await import('./caja-disponibilidades.mjs')
  const cuenta = CUENTAS.find((c) => c.control)
  assert.ok(cuenta, 'tiene que existir la cuenta con control de cartera')
  assert.match(cuenta.control, /Cobranzas!\$Q\$5:\$Q\$400>=TODAY\(\)/,
    'un cheque que se acredita hoy todavía no se acreditó: el borde es >=, no >')
  assert.doesNotMatch(cuenta.control, /\$Q\$400>TODAY\(\)/,
    'el borde estricto deja afuera el vencimiento del día y sub-declara la diferencia')
  // Y las dos puntas de la comparación tienen que barrer hasta la misma fila, o el desvío es del tope.
  const topes = [...cuenta.control.matchAll(/\$(\d+)\b(?!:)/g)].map((m) => Number(m[1]))
  assert.ok(topes.every((t) => t === 5 || t === 400), `tope inconsistente en el control: ${topes.join(',')}`)
})
