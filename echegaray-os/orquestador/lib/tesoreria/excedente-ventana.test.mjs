// LOS DOS SESGOS APILADOS — cada test acá se pone rojo si vuelve el defecto que lo motivó.
//
// El 03/08/2026 el modelo devolvía $0 de excedente con $99.078.164 de pesos líquidos en la cuenta.
// No era un caso borde: era la salida de todos los días, y por eso el agente nunca miraba el mercado.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  saldoCorrido, solapeReservaConCalendario, restringidaDeVentana, ventanaDeExcedente,
  excedentePorVentana, DIAS_ACREDITACION_VALORES,
} from './excedente-ventana.mjs'
import { cajaComprometida } from './posicion-caja.mjs'
import { cajaRestringidaViva, filaCheque, dobleConteoConCompras } from './cheques-firmados.mjs'

const HOY = new Date('2026-08-03T12:00:00')

/** Calendario sintético de `n` días. `movs` pisa días puntuales. */
function calendario(n, movs = {}) {
  return Array.from({ length: n + 1 }, (_, i) => {
    const f = new Date(2026, 7, 3 + i)
    return {
      fecha: f.toISOString().slice(0, 10),
      ingresos: movs[i]?.ingresos ?? 0,
      egresos: movs[i]?.egresos ?? 0,
      movimientos: [],
    }
  })
}

// ════════════════════════════════════════════════════════════════════════════
// DEFECTO 1a — el modelo no sumaba UN PESO de cobranzas
// ════════════════════════════════════════════════════════════════════════════

test('DEFECTO · una cobranza dentro de la ventana SUBE el excedente; ignorarla lo pone en cero', () => {
  // $50M de pesos, un cheque de $60M el día 20 y una cobranza de $40M el día 10. Sin sumar la
  // cobranza el recorrido toca −$10M y no hay nada colocable. Sumándola, hay.
  const cal = calendario(35, { 10: { ingresos: 40000000 }, 20: { egresos: 60000000 } })
  const base = { dias: cal, saldoInicial: 50000000, reserva: 0, hoy: HOY, hasta: 30 }

  const conCobranzas = ventanaDeExcedente({ ...base, factorIngresos: 1 })
  const sinCobranzas = ventanaDeExcedente({ ...base, factorIngresos: 0 })

  assert.equal(sinCobranzas.monto_maximo, 0, 'sin cobranzas el recorrido toca rojo: nada colocable')
  assert.ok(conCobranzas.monto_maximo > 0, 'con la cobranza del período SÍ hay excedente')
  assert.equal(conCobranzas.monto_maximo, 30000000, '50 + 40 − 60 = 30, y el piso es ése')
  // El castigo del escenario es un FACTOR sobre lo que entra, no un interruptor.
  const adverso = ventanaDeExcedente({ ...base, factorIngresos: 0.5 })
  assert.equal(adverso.monto_maximo, 10000000, 'al 50% entran $20M: 50 + 20 − 60 = 10')
})

test('DEFECTO · lo que entra se cuenta UNA vez y sólo si cae dentro de la ventana', () => {
  const cal = calendario(95, { 45: { ingresos: 30000000 } })
  const base = { dias: cal, saldoInicial: 10000000, reserva: 0, hoy: HOY, factorIngresos: 1 }
  const a30 = ventanaDeExcedente({ ...base, hasta: 30 })
  const a60 = ventanaDeExcedente({ ...base, hasta: 60 })
  assert.equal(a30.entradas, 0, 'una cobranza del día 45 no puede sumar en la ventana de 30')
  assert.equal(a60.entradas, 30000000)
  // El piso NO sube por una entrada futura: a 60 días el peor día sigue siendo antes del cobro.
  assert.equal(a60.piso, 10000000)
})

// ════════════════════════════════════════════════════════════════════════════
// DEFECTO 1b — se restaba el 100% de los cheques firmados, vencieran cuando vencieran
// ════════════════════════════════════════════════════════════════════════════

test('DEFECTO · un cheque que vence a 60 días NO puede bajar el excedente a 30 días', () => {
  const cal = calendario(95, { 50: { egresos: 40000000 } })
  const base = { dias: cal, saldoInicial: 50000000, reserva: 0, hoy: HOY, factorIngresos: 0.5 }
  assert.equal(ventanaDeExcedente({ ...base, hasta: 30 }).monto_maximo, 50000000,
    'a 30 días el cheque del día 50 todavía no salió: no puede restar')
  assert.equal(ventanaDeExcedente({ ...base, hasta: 60 }).monto_maximo, 10000000,
    'a 60 días sí sale, y entonces sí resta')
})

test('la caja restringida se parte POR VENCIMIENTO, y lo que el calendario no ve se resta siempre', () => {
  const d = (n) => new Date(2026, 7, 3 + n)
  const cheques = [
    { proveedor: 'Alumetal', monto: 31631000, fecha: d(2) },
    { proveedor: 'Corralón', monto: 5575888, fecha: d(50) },
    { proveedor: 'Sin fecha', monto: 900000, fecha: null },
    { proveedor: 'Vencido', monto: 100000, fecha: d(-10) },
  ]
  const r30 = restringidaDeVentana(cheques, HOY, 30)
  assert.equal(r30.total, 38206888)
  assert.equal(r30.dentro, 31631000)
  assert.equal(r30.fuera, 5575888, 'el de 50 días queda AFUERA de la ventana de 30')
  assert.equal(r30.sin_fecha, 900000)
  assert.equal(r30.vencidos, 100000)
  // Lo que el calendario no puede ver: el vencido (quedó atrás) y el sin fecha (no cae en ningún día).
  assert.equal(r30.a_restar_fuera_del_calendario, 1000000)
  const r60 = restringidaDeVentana(cheques, HOY, 60)
  assert.equal(r60.dentro, 37206888, 'a 60 días el de Corralón entra')
  assert.equal(r60.fuera, 0)
})

// ════════════════════════════════════════════════════════════════════════════
// EL PISO ES EL MÍNIMO DEL RECORRIDO, NO EL SALDO DEL ÚLTIMO DÍA
// ════════════════════════════════════════════════════════════════════════════

test('el excedente sale del PEOR día, no del último: la cuenta de servilleta no ve la tensión', () => {
  // Todo el egreso el día 5 y todo el cobro el día 25: al día 30 la cuenta cierra igual que hoy, pero
  // el día 5 hay $10M. Colocar 30 días contra el saldo final dejaría la empresa sin pagar el día 5.
  const cal = calendario(35, { 5: { egresos: 40000000 }, 25: { ingresos: 40000000 } })
  const v = ventanaDeExcedente({ dias: cal, saldoInicial: 50000000, reserva: 0, hoy: HOY, hasta: 30, factorIngresos: 1 })
  assert.equal(v.neto_al_vencimiento, 50000000)
  assert.equal(v.piso, 10000000)
  assert.equal(v.monto_maximo, 10000000, 'manda el piso')
  assert.equal(v.fecha_tension, '2026-08-08')
})

test('los valores a depositar entran el día en que se acreditan, no antes', () => {
  const cal = calendario(35, { 1: { egresos: 20000000 } })
  const base = { dias: cal, saldoInicial: 15000000, valoresADepositar: 10000000, reserva: 0, hoy: HOY, hasta: 30, factorIngresos: 1 }
  const v = ventanaDeExcedente(base)
  assert.ok(DIAS_ACREDITACION_VALORES > 1)
  assert.equal(v.piso, -5000000, 'el día 1 los valores todavía no se acreditaron: no tapan el egreso')
  assert.equal(v.monto_maximo, 0)
  // Con el egreso después de la acreditación, el mismo valor sí ayuda.
  const cal2 = calendario(35, { 10: { egresos: 20000000 } })
  assert.equal(ventanaDeExcedente({ ...base, dias: cal2 }).piso, 5000000)
})

test('una ventana más larga que el calendario NO se afirma: se declara sin dato', () => {
  const v = ventanaDeExcedente({ dias: calendario(30), saldoInicial: 1e8, hasta: 90, hoy: HOY })
  assert.equal(v.estado, 'sin_dato')
  assert.match(v.motivo, /necesita 91/)
  assert.equal(v.monto_maximo, null, 'null es "no sé"; cero sería una afirmación')
})

// ════════════════════════════════════════════════════════════════════════════
// EL SOLAPAMIENTO DE LA RESERVA CON EL CALENDARIO — se mide, no se corrige solo
// ════════════════════════════════════════════════════════════════════════════

test('la reserva que duplica los egresos del calendario se MIDE y se declara', () => {
  const cal = calendario(35, { 2: { egresos: 41000000 } })
  const s = solapeReservaConCalendario(cal, 41004461, 7)
  assert.equal(s.egresos_calendario, 41000000)
  assert.equal(s.solapado, 41000000, 'la reserva es casi exactamente los egresos que el calendario ya resta')
  assert.equal(s.no_solapado, 4461)
  assert.match(s.nota, /dos veces/)
  // Y NO se aplica sola: la política aprobada se sigue restando entera.
  const v = ventanaDeExcedente({ dias: cal, saldoInicial: 100000000, reserva: 41004461, hoy: HOY, hasta: 30, factorIngresos: 0.5 })
  assert.equal(v.monto_maximo, 100000000 - 41000000 - 41004461)
  assert.equal(v.reserva_preservada, 41004461)
  assert.ok(v.monto_si_reserva_no_duplicara > v.monto_maximo, 'el número alternativo se informa, no se usa')
})

// ════════════════════════════════════════════════════════════════════════════
// LAS TRES VENTANAS
// ════════════════════════════════════════════════════════════════════════════

test('el excedente se entrega por ventana (30/60/90), no como un número único', () => {
  const cal = calendario(95, { 40: { egresos: 30000000 } })
  const vs = excedentePorVentana({ dias: cal, saldoInicial: 60000000, reserva: 0, hoy: HOY })
  assert.deepEqual(vs.map((v) => v.dias), [30, 60, 90])
  assert.equal(vs[0].monto_maximo, 60000000)
  assert.equal(vs[1].monto_maximo, 30000000, 'a 60 días el egreso del día 40 ya salió')
  assert.equal(vs[2].monto_maximo, 30000000)
  // Los tres escenarios de cobro viajan al lado del número que decide.
  assert.deepEqual(Object.keys(vs[0].escenarios).sort(), ['adverso', 'base', 'sin_cobranzas'])
  assert.equal(vs[0].factor_ingresos, 0.5, 'el que manda es el adverso')
})

test('saldoCorrido no confunde "no hay movimientos" con "no hay calendario"', () => {
  assert.equal(saldoCorrido({ dias: [], hasta: 30 }).estado, 'sin_dato')
  const r = saldoCorrido({ dias: calendario(30), saldoInicial: 5000000, hasta: 30 })
  assert.equal(r.estado, 'ok')
  assert.equal(r.piso, 5000000)
  assert.equal(r.entradas, 0)
  assert.equal(r.salidas, 0)
})

// ════════════════════════════════════════════════════════════════════════════
// LA CAJA RESTRINGIDA VIVA — la política se quedaba vieja y nadie se enteraba
// ════════════════════════════════════════════════════════════════════════════

test('un cheque marcado DEBITADO sale de la caja restringida en la corrida siguiente', () => {
  const parseMonto = (x) => Number(String(x ?? '').replace(/\./g, '').replace(',', '.')) || 0
  const parseFecha = () => new Date(2026, 7, 20)
  // El caso real: el FÍSICO 223 de Corralón por $200.000, marcado como debitado. La política declarada
  // seguía diciendo $48.148.311 cuando los cheques vivos sumaban $47.948.311.
  const filas = [
    ['FISICO', '', '', '', 'Alumetal', '31631000', '', '', '20/08/2026', '', 'NO', ''],
    ['FISICO', '', '', '', 'Corralon Progreso', '200000', '', '', '20/08/2026', '', 'SI', ''],
    ['Encabezado que no es un cheque', '', '', '', '', '999999', '', '', '', '', '', ''],
  ]
  const vivos = filas.map((r) => filaCheque(r, { parseMonto, parseFecha })).filter(Boolean)
  assert.equal(vivos.length, 1, 'el debitado y el encabezado no son caja restringida')
  const c = cajaRestringidaViva(vivos, HOY)
  assert.equal(c.restricted_cash_amount, 31631000)
  assert.equal(c.bloquea_accionable, false, 'el dato se acaba de leer de su fuente: no bloquea por viejo')
  assert.match(c.restricted_cash_source, /recalculado en esta corrida/)
})

test('el doble conteo cheque ↔ factura de Compras vencida se detecta por proveedor Y monto', () => {
  const cheques = [{ proveedor: 'Gruas San Blas', monto: 5124412, fecha: HOY }, { proveedor: 'Alumetal', monto: 31631000, fecha: HOY }]
  const vencidos = [{ counterparty: 'GRUAS SAN BLAS', amount: 5124412 }, { counterparty: 'Alumetal', amount: 999 }]
  const d = dobleConteoConCompras(cheques, vencidos)
  assert.equal(d.hay, true)
  assert.equal(d.n, 1, 'el mismo proveedor con OTRO monto no es el mismo pago')
  assert.equal(d.monto, 5124412)
  assert.equal(dobleConteoConCompras(cheques, []).hay, false)
})

// ════════════════════════════════════════════════════════════════════════════
// LA POSICIÓN — `entra_30_dias` no puede volver a restarse
// ════════════════════════════════════════════════════════════════════════════

test('DEFECTO · `entra_30_dias` NO son cobranzas y NO vuelve a restarse: ya está en el calendario', () => {
  // `entra_30_dias` sale de `obligacion_resumen` —la MISMA vista que `vencido`— y son obligaciones que
  // VENCEN dentro de 30 días, no plata que entra. El calendario ya las trae como egresos fechados.
  // Sumarlas acá las restaba dos veces, y con un nombre que sugiere lo contrario.
  const c = cajaComprometida({ vencidoFiscal: 4700000, vencidoComercial: 6464412, entra30: 25000000 })
  assert.equal(c, 11164412, 'comprometido = SÓLO lo vencido, sin importar cuánto valga entra_30_dias')
  assert.equal(
    cajaComprometida({ vencidoFiscal: 4700000, vencidoComercial: 6464412, entra30: 0 }), c,
    'el resultado no puede depender de entra_30_dias: si depende, volvió el doble conteo',
  )
  // Un `null` no es un cero para el CONSUMIDOR —se declara faltante arriba—, pero acá la suma tiene
  // que ser aritmética pura y no explotar.
  assert.equal(cajaComprometida({ vencidoFiscal: null, vencidoComercial: 6464412 }), 6464412)
  assert.equal(cajaComprometida(), 0)
})
