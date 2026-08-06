import test from 'node:test'
import assert from 'node:assert/strict'
import {
  TERMINACION_CUIT, VENCIMIENTO_IVA, VENCIMIENTO_PLAN, IIBB_SUPUESTO, PRENDARIO_DIA,
  FUENTE_VERIFICADA, vencimientoIva, vencimientoIibb, vencimientoPlan, vencimientoPrendario,
  diaHabilODespues, diasEntre, serialDe, calendario, enVentana, vencidos, cobertura,
} from './vencimientos-fiscales.mjs'

// ── LA TERMINACIÓN DEL CUIT ────────────────────────────────────────────────────────────────────────

test('la terminación del CUIT es 3 — la de Echegaray, no la de Balanz', () => {
  // 30-71630464-3. Si alguien vuelve a leer el 30710630670 de banco-santander.mjs como si fuera el
  // CUIT propio, la terminación da 0, el IVA vence el 18 y no el 19, y todo el calendario corre.
  assert.equal(TERMINACION_CUIT, 3)
  assert.equal(FUENTE_VERIFICADA.bandaCuit, '2-3')
})

// ── IVA: LA TABLA VERIFICADA, Y POR QUÉ NO ES UNA REGLA ────────────────────────────────────────────

test('IVA: las doce fechas verificadas de 2026, período por período', () => {
  // Fuente: ARCA, Agenda de vencimientos, terminación 2-3, consultada el 06/08/2026.
  const esperado = {
    '2025-12': '2026-01-20', '2026-01': '2026-02-19', '2026-02': '2026-03-19', '2026-03': '2026-04-21',
    '2026-04': '2026-05-19', '2026-05': '2026-06-19', '2026-06': '2026-07-21', '2026-07': '2026-08-19',
    '2026-08': '2026-09-21', '2026-09': '2026-10-20', '2026-10': '2026-11-19', '2026-11': '2026-12-21',
  }
  assert.deepEqual(VENCIMIENTO_IVA, esperado)
  for (const [p, f] of Object.entries(esperado)) {
    const v = vencimientoIva(p)
    assert.equal(v.fecha, f, `período ${p}`)
    assert.equal(v.confianza, 'verificado', `período ${p}`)
  }
})

test('IVA: la regla "día 19 hábil" NO reproduce la tabla — por eso se tabula', () => {
  // ESTE TEST FIJA EL SUPUESTO. Si alguien reemplaza la tabla por la regla "porque es más limpia",
  // acá se ve que cuatro de doce quedan mal. Las cuatro, con su motivo:
  const regla = (p) => {
    const a = Number(p.slice(0, 4)); const m = Number(p.slice(5, 7))
    return m === 12 ? diaHabilODespues(a + 1, 1, 19) : diaHabilODespues(a, m + 1, 19)
  }
  const discrepan = Object.entries(VENCIMIENTO_IVA).filter(([p, f]) => regla(p) !== f).map(([p]) => p)
  assert.deepEqual(discrepan, ['2025-12', '2026-03', '2026-06', '2026-09'])
  assert.equal(regla('2025-12'), '2026-01-19')  // ARCA dice 20/01, y el 19 es lunes hábil
  assert.equal(regla('2026-03'), '2026-04-20')  // ARCA dice 21/04
  assert.equal(regla('2026-09'), '2026-10-19')  // ARCA dice 20/10, y el 19 es lunes hábil
  // Y las ocho que sí coinciden no la salvan: una regla que erra el 33% de las fechas de pago no sirve.
  assert.equal(discrepan.length, 4)
})

test('IVA: fuera de la tabla verificada, la fecha sale marcada como supuesto', () => {
  const v = vencimientoIva('2027-03')
  assert.equal(v.confianza, 'supuesto')
  assert.match(v.fuente, /regla de reserva/)
  assert.equal(v.fecha, '2027-04-19')
  // Diciembre cruza de año: el vencimiento cae en enero del siguiente.
  assert.equal(vencimientoIva('2027-12').fecha, '2028-01-19')
})

// ── IIBB: SUPUESTO DECLARADO, NUNCA VERIFICADO ────────────────────────────────────────────────────

test('IIBB: SIEMPRE es supuesto — la DGR San Juan no se pudo verificar', () => {
  // La skill de impuestos prohíbe afirmar una norma vigente sin verificarla en la sesión. Si alguien
  // "mejora" esto poniendo confianza 'verificado' sin haber consultado a la DGR, este test lo frena.
  for (const p of ['2026-01', '2026-06', '2026-11', '2027-05']) {
    assert.equal(vencimientoIibb(p).confianza, 'supuesto', `período ${p}`)
    assert.match(vencimientoIibb(p).fuente, /SUPUESTO/)
  }
})

test('IIBB: el día 16 es la moda de las presentaciones reales de _IIBB_RAW', () => {
  const dias = Object.values(IIBB_SUPUESTO.observado)
  assert.deepEqual(dias, [19, 18, 16, 14, 16, 16])
  const conteo = dias.reduce((a, d) => ({ ...a, [d]: (a[d] ?? 0) + 1 }), {})
  const moda = Number(Object.entries(conteo).sort((a, b) => b[1] - a[1])[0][0])
  assert.equal(moda, IIBB_SUPUESTO.dia)
  // El período jun-26 vence en julio, día 16 (jueves hábil).
  assert.equal(vencimientoIibb('2026-06').fecha, '2026-07-16')
  // ago-26 vence el 16/09 (miércoles). sep-26 el 16/10 (viernes).
  assert.equal(vencimientoIibb('2026-08').fecha, '2026-09-16')
})

// ── PLANES: LA DOBLE CONFIRMACIÓN ─────────────────────────────────────────────────────────────────

test('planes: las fechas de ARCA coinciden con las fechas previstas cargadas en Compras', () => {
  // Las quince cuotas reales de los tres planes, leídas de Compras (columna "Fecha prevista de pago"):
  // 931 Dic 25 feb–jul · 931 Enero 26 mar–ago · W303094 ago–oct.
  const enCompras = {
    '2026-02': '2026-02-18', '2026-03': '2026-03-16', '2026-04': '2026-04-16',
    '2026-05': '2026-05-18', '2026-06': '2026-06-16', '2026-07': '2026-07-16',
    '2026-08': '2026-08-16',
  }
  for (const [mes, fechaCompras] of Object.entries(enCompras)) {
    const v = vencimientoPlan(mes)
    if (mes === '2026-08') {
      // LA ÚNICA DISCREPANCIA, Y ES DEL LADO DE COMPRAS: el 16/08/2026 es domingo y el 17 es feriado
      // (San Martín), así que ARCA lo corre al martes 18. La carga administrativa puso el 16 igual.
      // No se "arregla" Compras desde acá: se declara, y manda la fecha del organismo.
      assert.equal(fechaCompras, '2026-08-16')
      assert.equal(v.fecha, '2026-08-18')
    } else {
      assert.equal(v.fecha, fechaCompras, `cuota de ${mes}`)
    }
    assert.equal(v.confianza, 'verificado')
  }
  assert.equal(VENCIMIENTO_PLAN['2026-09'], '2026-09-16')
})

// ── PRENDARIO ─────────────────────────────────────────────────────────────────────────────────────

test('prendario: día 7, y está MEDIDO (Compras + extracto), no normado', () => {
  assert.equal(PRENDARIO_DIA, 7)
  const v = vencimientoPrendario('2026-09')
  assert.equal(v.fecha, '2026-09-07')
  assert.equal(v.confianza, 'medido')
})

// ── ARITMÉTICA ────────────────────────────────────────────────────────────────────────────────────

test('las fechas no pasan por la zona horaria: el serial y los días son exactos', () => {
  // 45.000 = 06/03/2023 en el epoch de Sheets. Verificable a mano.
  assert.equal(serialDe('2026-08-19') - serialDe('2026-08-06'), 13)
  assert.equal(diasEntre('2026-08-06', '2026-08-19'), 13)
  assert.equal(diasEntre('2026-08-19', '2026-08-06'), -13)
  // El bug que ya vació una pestaña: en San Juan (UTC-3) un new Date('2026-08-19') da el 18.
  assert.equal(diasEntre('2026-08-19', '2026-08-19'), 0)
})

test('la regla de reserva corre el fin de semana, y NO sabe de feriados', () => {
  assert.equal(diaHabilODespues(2026, 9, 19), '2026-09-21') // sábado → lunes
  assert.equal(diaHabilODespues(2026, 12, 19), '2026-12-21') // sábado → lunes
  assert.equal(diaHabilODespues(2026, 4, 19), '2026-04-20')  // domingo → lunes
  assert.equal(diaHabilODespues(2026, 8, 19), '2026-08-19')  // miércoles: no se mueve
  // 17/08/2026 es feriado y la regla lo devuelve igual: el límite, declarado y probado.
  assert.equal(diaHabilODespues(2026, 8, 17), '2026-08-17')
})

// ── EL CALENDARIO ─────────────────────────────────────────────────────────────────────────────────

const OBLIG = [
  { tipo: 'plan', periodo: '2026-09', concepto: 'Planes F931', celda: 'J60' },
  { tipo: 'iva', periodo: '2026-07', concepto: 'IVA F.2051', celda: 'H52' },
  { tipo: 'prendario', periodo: '2026-09', concepto: 'Prendario Ford XLS', celda: 'J70' },
  { tipo: 'iibb', periodo: '2026-06', concepto: 'IIBB San Juan', celda: 'G62' },
  { tipo: 'plan', periodo: '2026-08', concepto: 'Planes F931', celda: 'I60' },
]

test('el calendario ordena por fecha y marca lo vencido contra el corte', () => {
  const c = calendario(OBLIG, { hoy: '2026-08-06' })
  assert.deepEqual(c.map((x) => x.fecha), [
    '2026-07-16', // IIBB de junio — YA VENCIÓ
    '2026-08-18', // plan de agosto
    '2026-08-19', // IVA de julio
    '2026-09-07', // prendario de septiembre
    '2026-09-16', // plan de septiembre
  ])
  assert.deepEqual(c.map((x) => x.vencido), [true, false, false, false, false])
  assert.equal(vencidos(c).length, 1)
  assert.equal(vencidos(c)[0].concepto, 'IIBB San Juan')
})

test('cada fila del calendario lleva SU celda: el importe sale de la fuente viva, no del calendario', () => {
  const c = calendario(OBLIG, { hoy: '2026-08-06' })
  // Ninguna fila trae un importe. Si mañana alguien le agrega uno, hay dos versiones del mismo peso.
  for (const f of c) {
    assert.ok(f.celda, 'toda obligación referencia una celda')
    assert.equal(f.importe, undefined, 'el calendario NO transporta importes')
  }
})

test('las ventanas 30/60/90 son acumuladas y excluyen lo vencido', () => {
  const c = calendario(OBLIG, { hoy: '2026-08-06' })
  // El prendario del 07/09 queda AFUERA de los 30 días: son 32. El límite es exacto, no "el mes que viene".
  assert.deepEqual(enVentana(c, 30).map((x) => x.fecha), ['2026-08-18', '2026-08-19'])
  assert.deepEqual(enVentana(c, 60).map((x) => x.fecha), ['2026-08-18', '2026-08-19', '2026-09-07', '2026-09-16'])
  assert.equal(enVentana(c, 90).length, 4)
  // Lo vencido NO entra en ninguna ventana: es riesgo, no proyección.
  assert.ok(!enVentana(c, 90).some((x) => x.vencido))
})

test('un tipo de obligación desconocido ROMPE en vez de inventar una fecha', () => {
  assert.throws(() => calendario([{ tipo: 'sellos', periodo: '2026-08', concepto: 'x', celda: 'B1' }], { hoy: '2026-08-06' }),
    /no sé fechar "sellos"/)
})

test('sin fecha de corte no hay "próximo vencimiento": rompe', () => {
  assert.throws(() => calendario(OBLIG), /necesito "hoy"/)
  assert.throws(() => calendario(OBLIG, { hoy: '06/08/2026' }), /YYYY-MM-DD/)
})

test('un período mal formado rompe: no se fecha una obligación que no se sabe de cuándo es', () => {
  assert.throws(() => vencimientoIva('2026'), /período inválido/)
  assert.throws(() => vencimientoIibb('agosto'), /período inválido/)
  assert.throws(() => vencimientoPlan(''), /mes inválido/)
})

test('la cobertura de la tabla se puede consultar: una tabla vieja tiene que avisar sola', () => {
  assert.equal(cobertura().iva, '2026-11')
  assert.equal(cobertura().plan, '2026-09')
  assert.equal(cobertura().iibb, null) // nunca hubo tabla verificada de IIBB
})
