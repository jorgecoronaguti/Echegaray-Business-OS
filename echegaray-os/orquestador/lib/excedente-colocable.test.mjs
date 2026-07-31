// Tests del excedente colocable. Herméticos: núcleo puro, sin red ni base.
//
// LO QUE PROTEGEN: que no se recomiende inmovilizar plata que hace falta, y que el impuesto al cheque
// entre en la cuenta. Los números son los reales del 31/07/2026 (caja $88.710.165 y el comprometido
// semana por semana del Cash Flow Semanal).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { excedentePorVentana, costoDelViaje, diasParaEmpatar, convieneColocar } from './excedente-colocable.mjs'

// El comprometido real leído del Cash Flow Semanal el 31/07/2026.
const SEMANAS = [
  { hasta: '2026-08-09', egresos: 34290423, cobranzasEsperadas: 3488735 },
  { hasta: '2026-08-16', egresos: 32590184, cobranzasEsperadas: 16679857 },
  { hasta: '2026-08-23', egresos: 2016463, cobranzasEsperadas: 0 },
  { hasta: '2026-08-30', egresos: 2834545, cobranzasEsperadas: 0 },
  { hasta: '2026-09-06', egresos: 7216312, cobranzasEsperadas: 21422081 },
  { hasta: '2026-09-13', egresos: 11652307, cobranzasEsperadas: 0 },
  { hasta: '2026-09-20', egresos: 10187666, cobranzasEsperadas: 0 },
]
const CAJA = 88710165

test('EL CASO REAL: el comprometido de dos semanas se come casi toda la caja', () => {
  const v = excedentePorVentana(CAJA, SEMANAS, '2026-07-31')
  // A 9 días ya salieron $34,3M: queda colocable el resto.
  assert.equal(v[0].egresosAcumulados, 34290423)
  assert.equal(v[0].colocable, 88710165 - 34290423)
  // A 16 días el acumulado es $66,9M y el colocable baja a $21,8M.
  assert.equal(v[1].egresosAcumulados, 66880607)
  assert.equal(v[1].colocable, 21829558)
  // A 30 días (fin de agosto) quedan menos de $10M libres SIN contar cobranzas.
  assert.equal(v[3].egresosAcumulados, 71731615)
  assert.equal(v[3].colocable, 16978550)
  assert.ok(v[4].colocable < 10_000_000, 'a 37 días el colchón propio ya es menor a $10M')
})

test('LAS COBRANZAS ESPERADAS SE INFORMAN APARTE, NUNCA MEZCLADAS', () => {
  const v = excedentePorVentana(CAJA, SEMANAS, '2026-07-31')
  // A 44 días (13/09) el comprometido acumulado SUPERA la caja de hoy: $90.600.234 contra $88.710.165.
  // O sea que a ese plazo no hay nada que colocar sin depender de que entre una cobranza — y ése es
  // justamente el hallazgo. El colocable se clava en CERO, nunca en negativo.
  assert.equal(v[5].egresosAcumulados, 90600234)
  assert.equal(v[5].colocable, 0)
  // Contando las cobranzas esperadas la foto cambia por completo ($39,7M), y por eso va en otra columna:
  // mezclarlas sería recomendar inmovilizar plata que todavía nadie cobró.
  assert.equal(v[5].conCobranzas, 39700604)
  assert.ok(v[5].conCobranzas > v[5].colocable)
  const flaco = excedentePorVentana(1_000_000, [{ hasta: '2026-08-09', egresos: 5_000_000 }], '2026-07-31')
  assert.equal(flaco[0].colocable, 0)
})

test('EL IMPUESTO AL CHEQUE: 1,2% de ida y vuelta', () => {
  const c = costoDelViaje(20_000_000)
  assert.equal(c.veces, 2)
  assert.equal(c.bruto, 240000, 'mover $20M y traerlos cuesta $240.000')
  assert.equal(c.neto, 240000, 'sin cómputo MiPyME, el costo es pleno')
  // Con el 100% computable como pago a cuenta de Ganancias, el costo efectivo se va a cero.
  assert.equal(costoDelViaje(20_000_000, { recuperable: 1 }).neto, 0)
  // Y sólo ida (pagar desde la comitente, sin volver al banco) es la mitad.
  assert.equal(costoDelViaje(20_000_000, { vuelta: false }).bruto, 120000)
})

test('CUÁNTOS DÍAS HAY QUE QUEDARSE PARA EMPATAR EL IMPUESTO', () => {
  // Money market ~1,42% mensual: hacen falta ~25 días sólo para cubrir el 1,2%.
  const d = diasParaEmpatar(0.0142)
  assert.ok(d > 25 && d < 26, `empata a los ${d} días`)
  // Si el impuesto se computa, empata desde el primer día.
  assert.equal(diasParaEmpatar(0.0142, { recuperable: 1 }), 0)
  // Un rendimiento nulo no empata nunca — y se dice, no se devuelve un número falso.
  assert.equal(diasParaEmpatar(0), null)
})

test('UNA VENTANA DE 7 DÍAS CON EL IMPUESTO PLENO DA PÉRDIDA', () => {
  const r = convieneColocar({ monto: 20_000_000, dias: 7, rendimientoMensual: 0.0142 })
  assert.ok(r.rinde > 0)
  assert.equal(r.impuestoNeto, 240000)
  assert.ok(r.neto < 0, 'rinde $66.267 y el impuesto se lleva $240.000')
  assert.equal(r.conviene, false)
  // La misma ventana, con el impuesto computable, sí conviene.
  const ok = convieneColocar({ monto: 20_000_000, dias: 7, rendimientoMensual: 0.0142, impuesto: { recuperable: 1 } })
  assert.equal(ok.conviene, true)
})

test('a 30 días con impuesto pleno apenas empata: no es un negocio, es un empate', () => {
  const r = convieneColocar({ monto: 20_000_000, dias: 30, rendimientoMensual: 0.0142 })
  assert.equal(Math.round(r.rinde), 284000)
  assert.equal(r.impuestoNeto, 240000)
  assert.equal(Math.round(r.neto), 44000, 'el margen real de un mes entero sobre $20M')
})
