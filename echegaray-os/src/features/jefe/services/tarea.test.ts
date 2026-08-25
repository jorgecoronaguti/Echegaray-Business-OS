import test from 'node:test'
import assert from 'node:assert/strict'
import { plazoDe, produccionDe, rendimientoDe, semanaISO } from './tarea.ts'

// LO QUE ESTOS TESTS ATRAPAN
//
// Los tres números de J06 son CÁLCULOS que se publican como si fueran datos. El defecto que se
// paga caro no es una cuenta mal hecha: es una cuenta hecha con una sola punta y publicada igual.
// «1,00×» cuando no hay horas plan y «+0 d» cuando no hay proyección se leen como «va bien», y
// ninguna de las dos afirmaciones la hizo nadie.

test('el rendimiento compara contra el plan DE LO YA HECHO, no contra el plan entero', () => {
  // 19 HH reales, 37 de plan, 40 % hecho → el plan de lo hecho son 14,8 HH → 1,28×.
  // Contra el plan entero daría 0,51× y la pantalla diría «rinde bien» una tarea que consume 28 %
  // más horas de las previstas para lo que lleva hecho. Ése es el defecto.
  const r = rendimientoDe({ hh_real: 19, hh_plan: 37, avance_pct: 40 })
  assert.equal(r.valor, 1.28)
  assert.equal(r.texto, '1,28×')
  assert.equal(r.detalle, '28 % arriba')
  assert.equal(r.alerta, true)
})

test('sin alguna de las tres puntas el rendimiento es «—», nunca 1,00×', () => {
  for (const caso of [
    { hh_real: null, hh_plan: 37, avance_pct: 40 },
    { hh_real: 19, hh_plan: null, avance_pct: 40 },
    { hh_real: 19, hh_plan: 37, avance_pct: null },
    { hh_real: 19, hh_plan: 0, avance_pct: 40 },
    // Avance en 0: horas gastadas sin nada medido NO es rendimiento infinito.
    { hh_real: 19, hh_plan: 37, avance_pct: 0 },
  ]) {
    const r = rendimientoDe(caso)
    assert.equal(r.valor, null, JSON.stringify(caso))
    assert.equal(r.texto, '—')
    assert.equal(r.alerta, false)
  }
})

test('rendir por debajo de 1 no es alerta: usa menos horas que las previstas', () => {
  const r = rendimientoDe({ hh_real: 10, hh_plan: 40, avance_pct: 50 })
  assert.equal(r.detalle, '50 % abajo')
  assert.equal(r.alerta, false)
})

test('el plazo necesita el fin de plan Y la proyección: con una sola dice por qué falta', () => {
  assert.deepEqual(plazoDe({ fin_plan: null, forecast_fin: '2026-09-21' }), {
    dias: null, texto: '—', detalle: 'sin fin de plan', alerta: false,
  })
  assert.deepEqual(plazoDe({ fin_plan: '2026-09-05', forecast_fin: null }), {
    dias: null, texto: '—', detalle: 'sin proyección', alerta: false,
  })
  const p = plazoDe({ fin_plan: '2026-09-05', forecast_fin: '2026-09-21' })
  assert.equal(p.dias, 16)
  assert.equal(p.texto, '+16 d')
  assert.equal(p.alerta, true)
})

test('la producción declara cuándo el número es MEDIDO y cuándo sale del porcentaje', () => {
  const medido = produccionDe({
    cantidad_objetivo: 1.08, cantidad_ejecutada: 0.43, avance_pct: 40, unidad: 'm³',
  })
  assert.deepEqual(medido, { texto: '0,43 de 1,08 m³', derivado: false })

  // Sin cantidad ejecutada se deriva del porcentaje, y se DICE: la pantalla escribe «(del %)».
  // Sin el marcador, una cuenta se presenta como una medición de obra.
  const derivado = produccionDe({
    cantidad_objetivo: 96, cantidad_ejecutada: null, avance_pct: 74, unidad: 'm²',
  })
  assert.deepEqual(derivado, { texto: '71,04 de 96,00 m²', derivado: true })

  assert.equal(produccionDe({ cantidad_objetivo: null, cantidad_ejecutada: null, avance_pct: 74, unidad: 'm²' }), null)
  assert.equal(produccionDe({ cantidad_objetivo: 96, cantidad_ejecutada: null, avance_pct: null, unidad: 'm²' }), null)
})

test('la semana es ISO 8601 y no «día del año sobre siete»', () => {
  // El 23/08/2026 es domingo: en ISO cierra la semana 34. La cuenta ingenua daría 34 también, así
  // que el caso que separa las dos es el arranque de año.
  assert.equal(semanaISO('2026-08-23'), 34)
  // 01/01/2027 es viernes → pertenece a la semana 53 de 2026, no a la 1 de 2027.
  assert.equal(semanaISO('2027-01-01'), 53)
  // 04/01/2027 es lunes → ahí sí arranca la semana 1.
  assert.equal(semanaISO('2027-01-04'), 1)
})
