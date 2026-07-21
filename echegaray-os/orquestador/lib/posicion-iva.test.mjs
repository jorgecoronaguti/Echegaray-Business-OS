import test from 'node:test'
import assert from 'node:assert/strict'
import { arrastrarSaldo, proyectarIva, ALICUOTA_IVA } from './posicion-iva.mjs'

// Los números son los reales de Echegaray 2026, que es donde se ve por qué importa arrastrar.
const REALES = [
  { periodo: '2026-01', disponible: true, debito_fiscal: 1419600, credito_fiscal: 4426581.53 },
  { periodo: '2026-02', disponible: true, debito_fiscal: 2150400, credito_fiscal: 2920961.81 },
  { periodo: '2026-03', disponible: true, debito_fiscal: 16453413.22, credito_fiscal: 1605189.62 },
]

test('el saldo a favor se arrastra: sin eso, marzo pide $3,8M de más', () => {
  const r = arrastrarSaldo(REALES)
  // Enero y febrero dan a favor y no se paga nada.
  assert.equal(r[0].a_pagar_real, 0)
  assert.ok(Math.abs(r[0].saldo_queda - 3006981.53) < 1)
  assert.equal(r[1].a_pagar_real, 0)
  assert.ok(Math.abs(r[1].saldo_queda - 3777543.34) < 1, 'el saldo de enero tiene que sumarse al de febrero')
  // Marzo: la posición del mes es $14.848.223, pero se paga $11.070.680.
  assert.ok(Math.abs(r[2].posicion - 14848223.6) < 1)
  assert.ok(Math.abs(r[2].a_pagar_real - 11070680.26) < 1, 'marzo tiene que consumir el saldo acumulado')
  assert.equal(r[2].saldo_queda, 0)
})

test('un mes sin comprobantes no inventa números y no rompe el arrastre', () => {
  const r = arrastrarSaldo([REALES[0], { periodo: '2026-02', disponible: false }])
  assert.equal(r[1].a_pagar_real, null, 'sin datos no hay importe: null, no cero')
  assert.equal(r[1].saldo_queda, r[0].saldo_queda, 'el saldo pasa de largo, no se pierde')
})

test('la proyección sale de las ventas, y dice de dónde salió', () => {
  const base = arrastrarSaldo([...REALES, { periodo: '2026-04', disponible: false }])
  const r = proyectarIva(base, { '2026-04': 10000000 })
  const abr = r[3]
  assert.equal(abr.es_proyeccion, true)
  assert.equal(abr.debito_fiscal, 10000000 * ALICUOTA_IVA)
  // El crédito es el promedio de los 3 meses reales: es un SUPUESTO y el método queda escrito.
  const prom = (4426581.53 + 2920961.81 + 1605189.62) / 3
  assert.ok(Math.abs(abr.credito_fiscal - prom) < 0.01)
  assert.match(abr.metodo, /promedio de 3 meses reales/)
})

test('sin facturación cargada NO proyecta cero ventas: usa el ritmo real + inflación', () => {
  // Cobranzas sólo tiene facturas ya emitidas, así que ningún mes futuro tiene ventas cargadas.
  // Proyectar "cero ventas" hacía crecer el saldo a favor hasta $30,7M — un disparate que además
  // tapaba el problema real (que la empresa está sobre-retenida).
  const r = proyectarIva(arrastrarSaldo([...REALES, { periodo: '2026-04', disponible: false }]), {}, { '2026-04': 1.02 })
  const promDebito = (1419600 + 2150400 + 16453413.22) / 3
  assert.ok(Math.abs(r[3].debito_fiscal - promDebito * 1.02) < 0.01, 'el débito sale del ritmo real ajustado')
  assert.match(r[3].metodo, /ritmo real de 3 meses × inflación \(1\.020\)/)
  assert.equal(r[3].es_proyeccion, true)
})

test('una retención sufrida reduce el IVA a pagar', () => {
  const m = [{ periodo: '2026-05', disponible: true, debito_fiscal: 4200000, credito_fiscal: 1589238 }]
  const sin = arrastrarSaldo(m)[0]
  const con = arrastrarSaldo(m, { '2026-05': 1000000 })[0]
  assert.equal(sin.a_pagar_real, 2610762)
  assert.equal(con.a_pagar_real, 1610762, 'la retención es impuesto ya pagado')
})

test('una retención que SOBRA no se pierde: queda como saldo a favor', () => {
  // Restarla del "a pagar" ya calculado haría desaparecer el excedente en silencio.
  const m = [{ periodo: '2026-05', disponible: true, debito_fiscal: 1000, credito_fiscal: 0 }]
  const r = arrastrarSaldo(m, { '2026-05': 2500 })[0]
  assert.equal(r.a_pagar_real, 0)
  assert.equal(r.saldo_queda, 1500, 'el excedente se arrastra')
})

test('el saldo a favor que venía se consume ANTES que la retención del mes', () => {
  const m = [
    { periodo: '2026-01', disponible: true, debito_fiscal: 0, credito_fiscal: 1000 },
    { periodo: '2026-02', disponible: true, debito_fiscal: 3000, credito_fiscal: 0 },
  ]
  const r = arrastrarSaldo(m, { '2026-02': 500 })
  assert.equal(r[1].saldo_previo, 1000)
  assert.equal(r[1].a_pagar_real, 1500, '3000 - 500 de retención - 1000 de saldo')
})

test('sin retenciones el resultado no cambia', () => {
  const m = [{ periodo: '2026-03', disponible: true, debito_fiscal: 500, credito_fiscal: 200 }]
  assert.deepEqual(arrastrarSaldo(m)[0].a_pagar_real, arrastrarSaldo(m, {})[0].a_pagar_real)
})

test('el crédito fiscal se proyecta con la MISMA inflación que el débito', () => {
  // Proyectar la facturación con inflación y las compras sin ella infla el "A PAGAR" de todos los
  // meses futuros. El crédito fiscal sale de las compras, y las compras suben igual que las ventas.
  const meses = [
    { periodo: '2026-06', disponible: true, debito_fiscal: 1000, credito_fiscal: 400, saldo_queda: 0 },
    { periodo: '2026-07', disponible: false },
  ]
  const r = proyectarIva(meses, {}, { '2026-07': 1.10 })
  const jul = r[1]
  const cerca = (a, b, msg) => assert.ok(Math.abs(a - b) < 0.01, `${msg}: ${a} vs ${b}`)
  cerca(jul.debito_fiscal, 1100, 'el débito lleva el factor')
  cerca(jul.credito_fiscal, 440, 'y el crédito el mismo factor')
  cerca(jul.posicion, 660, 'la posición crece con la inflación, no más que ella')
})

test('sin inflación declarada, el factor es 1 y nada se distorsiona', () => {
  const meses = [
    { periodo: '2026-06', disponible: true, debito_fiscal: 1000, credito_fiscal: 400, saldo_queda: 0 },
    { periodo: '2026-07', disponible: false },
  ]
  const r = proyectarIva(meses, {}, {})
  assert.equal(r[1].credito_fiscal, 400)
  assert.equal(r[1].debito_fiscal, 1000)
})
