// LO PAGADO EN BLANCO Y EN NEGRO: las reglas que no se pueden romper sin que la pantalla mienta.
//
// Los importes son de casos REALES de 2026 (medidos el 22/09/2026 sobre `liquidacion_linea` y
// `recibo_sueldo_linea` con la service key), pero entran como fixture: un test que leyera la base
// cambiaría de color cuando alguien cierra una quincena, y eso no es un defecto del código.
//
//   · Videla Isaías, Q1-04/2026: recibo $ 329.276 contra $ 292.000 cobrados — el recibo mayor.
//   · Ochoa Eduardo, 12 quincenas por $ 4.527.063 sin un solo recibo cargado — todo negro.
//   · Castro Juan Marcelo, Q1-08/2026: recibo $ 212.505 sin línea de liquidación — blanco suelto.
//   · Septiembre 2026: las tres quincenas abiertas — el mes que no puede valer 0.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { leerMes, mesDelDetalle, mesDePeriodo, pagoDeNomina, periodoDeQuincena } from './nominaPagada.ts'

const Q = (id: string, desde: string, estado = 'cerrada') => ({ id, desde, estado })

test('el período de una quincena: del 16 en adelante es la segunda del mes', () => {
  assert.equal(periodoDeQuincena('2026-08-16'), 'Q2-08/2026')
  assert.equal(periodoDeQuincena('2026-01-01'), 'Q1-01/2026')
  assert.equal(periodoDeQuincena('2026-01-15'), 'Q1-01/2026')
  assert.equal(periodoDeQuincena('cualquiera'), null)
})

test('el mes de un período, y la liquidación FINAL no es un mes de nómina', () => {
  assert.equal(mesDePeriodo('Q2-08/2026'), '2026-08')
  assert.equal(mesDePeriodo('FINAL-08/2026'), null)
  assert.equal(mesDePeriodo('agosto'), null)
})

test('el mes de la URL entra por la puerta: 2026-13 no es un mes', () => {
  assert.equal(leerMes('2026-03'), '2026-03')
  assert.equal(leerMes(['2026-12']), '2026-12')
  assert.equal(leerMes('2026-13'), null)
  assert.equal(leerMes('2026-3'), null)
  assert.equal(leerMes(undefined), null)
})

test('blanco es el neto del recibo y negro es el resto de lo cobrado; el total no lleva cargas sociales', () => {
  const r = pagoDeNomina({
    anio: 2026,
    quincenas: [Q('q1', '2026-04-01')],
    lineas: [{ liquidacion_id: 'q1', persona_id: 'p1', cobra: '727500' }],
    recibos: [{ persona_id: 'p1', periodo: 'Q1-04/2026', neto: '453969' }],
    personas: [{ id: 'p1', nombre_completo: 'NIEVAS VILLEGAS JUAN PABLO' }],
  })
  assert.deepEqual(r.meses.map((m) => [m.mes, m.blanco, m.negro, m.total, m.estado]),
    [['2026-04', 453969, 273531, 727500, 'cerrado']])
  assert.deepEqual(r.total, { blanco: 453969, negro: 273531, total: 727500, meses: 1 })
  assert.equal(r.pctNegro, 273531 / 727500)
  assert.deepEqual(r.porPersona.get('2026-04'), [{
    personaId: 'p1', nombre: 'Nievas Villegas Juan Pablo', blanco: 453969, negro: 273531, total: 727500,
    sinRecibo: false, sinLinea: false, reciboMayor: null,
  }])
})

test('el recibo mayor que lo cobrado no da negro negativo: se apoya en 0 y la diferencia se declara', () => {
  const r = pagoDeNomina({
    anio: 2026,
    quincenas: [Q('q1', '2026-04-01')],
    lineas: [{ liquidacion_id: 'q1', persona_id: 'videla', cobra: 292000 }],
    recibos: [{ persona_id: 'videla', periodo: 'Q1-04/2026', neto: 329276 }],
    personas: [{ id: 'videla', nombre_completo: 'VIDELA ISAIAS' }],
  })
  const m = r.meses[0]
  assert.equal(m.negro, 0)
  assert.equal(m.blanco, 329276)
  assert.deepEqual(m.reciboMayor, { n: 1, importe: 37276 })
  assert.deepEqual(r.avisos.reciboMayor, { n: 1, importe: 37276 })
})

test('sin recibo cargado todo lo cobrado se cuenta en negro, y el aviso dice cuánto', () => {
  const r = pagoDeNomina({
    anio: 2026,
    quincenas: [Q('q1', '2026-05-01')],
    lineas: [{ liquidacion_id: 'q1', persona_id: 'ochoa', cobra: 377255.25 }],
    recibos: [],
    personas: [{ id: 'ochoa', nombre_completo: 'OCHOA EDUARDO ARIEL' }],
  })
  assert.deepEqual([r.meses[0].blanco, r.meses[0].negro], [0, 377255.25])
  assert.deepEqual(r.meses[0].sinRecibo, { n: 1, importe: 377255.25 })
  assert.equal(r.porPersona.get('2026-05')?.[0].sinRecibo, true)
})

test('un recibo sin línea de liquidación suma al blanco y se declara: la plata del recibo salió igual', () => {
  const r = pagoDeNomina({
    anio: 2026,
    quincenas: [Q('q1', '2026-08-01')],
    lineas: [],
    recibos: [{ persona_id: 'castro', periodo: 'Q1-08/2026', neto: 212505 }],
    personas: [{ id: 'castro', nombre_completo: 'CASTRO JUAN MARCELO' }],
  })
  assert.deepEqual([r.meses[0].blanco, r.meses[0].negro], [212505, 0])
  assert.deepEqual(r.meses[0].sinLinea, { n: 1, importe: 212505 })
  assert.equal(r.porPersona.get('2026-08')?.[0].sinLinea, true)
})

test('el mes en curso se mide por lo ENTREGADO: banco es blanco, efectivo es negro, y no entra al año', () => {
  // Septiembre/2026 real, medido el 22/09/2026 con la service key: tres quincenas abiertas, `cobra` en 0,
  // y $ 8.604.952 registrados como entregados el 17/09 (banco $ 3.281.941 · efectivo $ 5.323.011).
  const r = pagoDeNomina({
    anio: 2026,
    quincenas: [Q('ago', '2026-08-01'), Q('sepOf', '2026-09-01', 'abierta'), Q('sepOb', '2026-09-01', 'abierta'), Q('sepQ2', '2026-09-16', 'abierta')],
    lineas: [
      { liquidacion_id: 'ago', persona_id: 'zogbe', cobra: 473000 },
      // El jefe mensualizado: tiene línea abierta y ninguna entrega registrada. No es «cobró 0».
      { liquidacion_id: 'sepOf', persona_id: 'maldonado', cobra: 0 },
      { liquidacion_id: 'sepOb', persona_id: 'zogbe', cobra: 0, pagado_banco: 294795.5, pagado_efectivo: 259765.78 },
      { liquidacion_id: 'sepQ2', persona_id: 'zogbe', cobra: 0, pagado_efectivo: 68000 },
    ],
    recibos: [{ persona_id: 'zogbe', periodo: 'Q1-08/2026', neto: 260000 }],
    personas: [{ id: 'zogbe', nombre_completo: 'ZOGBE RAMOS WALTER LEONARDO' }, { id: 'maldonado', nombre_completo: 'MALDONADO BATISTA EMILIANO MIGUEL' }],
  })
  const sep = r.meses.find((m) => m.mes === '2026-09')!
  assert.equal(sep.medida, 'registro_por_canal')
  assert.deepEqual([sep.blanco, sep.negro, sep.total], [294795.5, 327765.78, 622561.28])
  assert.deepEqual([sep.estado, sep.quincenasAbiertas, sep.personas, sep.sinPagoRegistrado], ['sin_cerrar', 3, 1, 1])
  // EL AÑO NO SE CONTAMINA: el total sigue siendo sólo lo medido con la quincena cerrada.
  assert.deepEqual(r.total, { blanco: 260000, negro: 213000, total: 473000, meses: 1 })
  assert.equal(r.enCurso?.mes, '2026-09')
  assert.deepEqual([r.avisos.mesesPorRegistro, r.avisos.sinPagoRegistrado, r.avisos.mesesSinCerrar], [1, 1, 1])
  // El detalle del mes en curso marca de dónde sale su reparto, y el mensualizado sin pago no se dibuja como cobrado.
  assert.deepEqual(r.porPersona.get('2026-09')?.map((p) => [p.nombre, p.blanco, p.negro, p.porCanal]),
    [['Zogbe Ramos Walter Leonardo', 294795.5, 327765.78, true]])
  // Y el detalle abre en el mes en curso, que es lo que el dueño mira.
  assert.equal(mesDelDetalle(r, null), '2026-09')
})

test('el mes en curso SIN una sola entrega registrada sigue sin publicar cifra: no se dibuja un 0', () => {
  const r = pagoDeNomina({
    anio: 2026,
    quincenas: [Q('q1', '2026-09-01', 'abierta')],
    lineas: [{ liquidacion_id: 'q1', persona_id: 'p1', cobra: 0, pagado_banco: null, pagado_efectivo: 0 }],
    recibos: [],
    personas: [{ id: 'p1', nombre_completo: 'QUIEN SEA' }],
  })
  assert.deepEqual([r.meses[0].total, r.meses[0].medida, r.meses[0].sinPagoRegistrado], [null, null, 1])
  assert.equal(r.enCurso, null)
})

test('una quincena sin cerrar NO vale 0: el mes no publica cifras y dice que está en curso', () => {
  const r = pagoDeNomina({
    anio: 2026,
    quincenas: [Q('q1', '2026-09-01', 'abierta'), Q('q2', '2026-09-16', 'abierta')],
    // `cobra` es 0 en la base hasta que el cierre la sella: sumarla diría que nadie cobró.
    lineas: [{ liquidacion_id: 'q1', persona_id: 'p1', cobra: 0 }],
    recibos: [],
    personas: [{ id: 'p1', nombre_completo: 'QUIEN SEA' }],
  })
  assert.deepEqual(r.meses.map((m) => [m.mes, m.total, m.estado]), [['2026-09', null, 'sin_cerrar']])
  assert.equal(r.total, null)
  assert.equal(r.porPersona.has('2026-09'), false)
  assert.deepEqual([r.avisos.mesesSinCerrar, r.avisos.quincenasAbiertas], [1, 2])
})

test('mes a medio cerrar: entra lo sellado, el recibo de la quincena abierta NO, y el mes queda parcial', () => {
  const r = pagoDeNomina({
    anio: 2026,
    quincenas: [Q('q1', '2026-08-01'), Q('q2', '2026-08-16', 'abierta')],
    lineas: [
      { liquidacion_id: 'q1', persona_id: 'p1', cobra: 400000 },
      { liquidacion_id: 'q2', persona_id: 'p1', cobra: 0 },
    ],
    recibos: [
      { persona_id: 'p1', periodo: 'Q1-08/2026', neto: 212505 },
      // El recibo de la quincena abierta entraría sin su negro al lado: el mes saldría casi todo blanco.
      { persona_id: 'p1', periodo: 'Q2-08/2026', neto: 192887 },
    ],
    personas: [{ id: 'p1', nombre_completo: 'CASTRO JUAN MARCELO' }],
  })
  assert.deepEqual(r.meses.map((m) => [m.blanco, m.negro, m.estado, m.quincenasAbiertas]),
    [[212505, 187495, 'parcial', 1]])
})

test('lo escrito a mano le gana a lo sellado, y la liquidación final no es nómina del mes', () => {
  const r = pagoDeNomina({
    anio: 2026,
    quincenas: [Q('q1', '2026-07-01')],
    lineas: [{ liquidacion_id: 'q1', persona_id: 'p1', cobra: 300000, cobra_manual: 350000 }],
    recibos: [
      { persona_id: 'p1', periodo: 'Q1-07/2026', neto: 200000 },
      { persona_id: 'p1', periodo: 'FINAL-07/2026', neto: 999999 },
    ],
    personas: [{ id: 'p1', nombre_completo: 'QUIEN SEA' }],
  })
  assert.deepEqual([r.meses[0].blanco, r.meses[0].negro, r.meses[0].total], [200000, 150000, 350000])
})

test('el año calendario recorta: una quincena de otro año no entra en la serie', () => {
  const r = pagoDeNomina({
    anio: 2026,
    quincenas: [Q('q0', '2025-12-16'), Q('q1', '2026-01-01')],
    lineas: [
      { liquidacion_id: 'q0', persona_id: 'p1', cobra: 500000 },
      { liquidacion_id: 'q1', persona_id: 'p1', cobra: 100000 },
    ],
    recibos: [{ persona_id: 'p1', periodo: 'Q2-12/2025', neto: 300000 }],
    personas: [{ id: 'p1', nombre_completo: 'QUIEN SEA' }],
  })
  assert.deepEqual(r.meses.map((m) => m.mes), ['2026-01'])
  assert.equal(r.total?.total, 100000)
})

test('el detalle abre el mes pedido si tiene cifras; si no, el último que las tenga', () => {
  const r = pagoDeNomina({
    anio: 2026,
    quincenas: [Q('q1', '2026-07-01'), Q('q2', '2026-08-01'), Q('q3', '2026-09-01', 'abierta')],
    lineas: [
      { liquidacion_id: 'q1', persona_id: 'p1', cobra: 100000 },
      { liquidacion_id: 'q2', persona_id: 'p1', cobra: 120000 },
    ],
    recibos: [],
    personas: [{ id: 'p1', nombre_completo: 'QUIEN SEA' }],
  })
  assert.equal(mesDelDetalle(r, '2026-07'), '2026-07')
  assert.equal(mesDelDetalle(r, '2026-09'), '2026-08')
  assert.equal(mesDelDetalle(r, null), '2026-08')
})

test('el detalle del mes ordena por lo cobrado y no publica a quien no cobró nada', () => {
  const r = pagoDeNomina({
    anio: 2026,
    quincenas: [Q('q1', '2026-06-01')],
    lineas: [
      { liquidacion_id: 'q1', persona_id: 'chico', cobra: 100000 },
      { liquidacion_id: 'q1', persona_id: 'grande', cobra: 900000 },
      { liquidacion_id: 'q1', persona_id: 'cero', cobra: 0 },
    ],
    recibos: [{ persona_id: 'grande', periodo: 'Q1-06/2026', neto: 400000 }],
    personas: [
      { id: 'chico', nombre_completo: 'B' }, { id: 'grande', nombre_completo: 'A' }, { id: 'cero', nombre_completo: 'C' },
    ],
  })
  assert.deepEqual(r.porPersona.get('2026-06')?.map((p) => [p.nombre, p.blanco, p.negro]),
    [['A', 400000, 500000], ['B', 0, 100000]])
})
