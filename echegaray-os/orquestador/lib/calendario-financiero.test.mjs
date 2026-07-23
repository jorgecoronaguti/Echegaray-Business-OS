import { test } from 'node:test'
import assert from 'node:assert/strict'
import { armarCalendario, categoriaEgreso, nivelRiesgo, claveDia } from './calendario-financiero.mjs'

const d = (s) => { const [y, m, day] = s.split('-').map(Number); return new Date(y, m - 1, day) }

test('el saldo inicial de un día es el saldo final del anterior (arrastre)', () => {
  const cal = armarCalendario({
    cajaInicial: 1000000, desde: d('2026-07-23'), hasta: d('2026-07-25'), limiteDescubierto: 5000000,
    movimientos: [
      { fecha: d('2026-07-23'), tipo: 'egreso', monto: 300000, categoria: 'cheque' },
      { fecha: d('2026-07-24'), tipo: 'ingreso', monto: 500000, categoria: 'cobranza' },
    ],
  })
  assert.equal(cal.length, 3)
  assert.equal(cal[0].saldo_inicial, 1000000)
  assert.equal(cal[0].saldo_final, 700000) // 1M − 300k
  assert.equal(cal[1].saldo_inicial, 700000) // arrastre
  assert.equal(cal[1].saldo_final, 1200000) // 700k + 500k
  assert.equal(cal[2].saldo_inicial, 1200000) // día sin movimientos: se mantiene
  assert.equal(cal[2].saldo_final, 1200000)
})

test('los ingresos y egresos del día se separan bien', () => {
  const cal = armarCalendario({
    cajaInicial: 0, desde: d('2026-07-23'), hasta: d('2026-07-23'),
    movimientos: [
      { fecha: d('2026-07-23'), tipo: 'ingreso', monto: 100000, categoria: 'cobranza' },
      { fecha: d('2026-07-23'), tipo: 'egreso', monto: 40000, categoria: 'cheque' },
    ],
  })
  assert.equal(cal[0].ingresos, 100000)
  assert.equal(cal[0].egresos, 40000)
  assert.equal(cal[0].saldo_final, 60000)
})

test('el desglose por categoría suma cada egreso donde corresponde', () => {
  const cal = armarCalendario({
    cajaInicial: 0, desde: d('2026-07-23'), hasta: d('2026-07-23'),
    movimientos: [
      { fecha: d('2026-07-23'), tipo: 'egreso', monto: 11950000, categoria: 'cargas_sociales' },
      { fecha: d('2026-07-23'), tipo: 'egreso', monto: 2000000, categoria: 'impuesto' },
      { fecha: d('2026-07-23'), tipo: 'egreso', monto: 500000, categoria: 'cheque' },
      { fecha: d('2026-07-23'), tipo: 'egreso', monto: 300000, categoria: 'obligacion' },
    ],
  })
  assert.equal(cal[0].cargas_sociales, 11950000)
  assert.equal(cal[0].impuestos, 2000000)
  assert.equal(cal[0].cheques, 500000)
  assert.equal(cal[0].obligaciones, 300000)
})

test('categoriaEgreso reconoce F931/UOCRA como cargas sociales y ARCA/IVA como impuesto', () => {
  assert.equal(categoriaEgreso('Plan F931 W303094'), 'cargas_sociales')
  assert.equal(categoriaEgreso('UOCRA aporte'), 'cargas_sociales')
  assert.equal(categoriaEgreso('Fondo de Cese Laboral'), 'cargas_sociales')
  assert.equal(categoriaEgreso('IVA a pagar ARCA'), 'impuesto')
  assert.equal(categoriaEgreso('Proveedor materiales'), 'obligacion')
})

// QA 23/07: los cheques de "Cheques Emitidos" se clasificaban por el NOMBRE DEL PROVEEDOR, así que
// "Diesel Rodriguez" caía en 'obligacion' y la línea "Cheques" del día mostraba $0 con movimientos que
// eran cheques. La regla: si el concepto/proveedor no delata nada fiscal, manda el INSTRUMENTO.
test('un cheque a un proveedor común cuenta como CHEQUE, no como obligación genérica', () => {
  const cal = armarCalendario({
    cajaInicial: 0, desde: d('2026-07-23'), hasta: d('2026-07-23'),
    movimientos: [{ fecha: d('2026-07-23'), tipo: 'egreso', monto: 500000, categoria: 'cheque', proveedor: 'Diesel Rodriguez' }],
  })
  assert.equal(cal[0].cheques, 500000)
  assert.equal(cal[0].obligaciones, 0)
})

test('un cheque a un organismo previsional sigue contando como cargas sociales (el concepto gana)', () => {
  const cal = armarCalendario({
    cajaInicial: 0, desde: d('2026-07-23'), hasta: d('2026-07-23'),
    movimientos: [{ fecha: d('2026-07-23'), tipo: 'egreso', monto: 700000, categoria: categoriaEgreso('UOCRA aporte'), proveedor: 'UOCRA' }],
  })
  assert.equal(cal[0].cargas_sociales, 700000)
  assert.equal(cal[0].cheques, 0)
})

test('el nivel de riesgo: positivo=bajo, cubierto por la línea=medio, supera el acuerdo=alto', () => {
  assert.equal(nivelRiesgo(500000, 18200000), 'bajo')
  assert.equal(nivelRiesgo(-1000000, 18200000), 'medio')
  assert.equal(nivelRiesgo(-20000000, 18200000), 'alto')
})

test('un día que cierra en rojo consume descubierto y baja el crédito disponible', () => {
  const cal = armarCalendario({
    cajaInicial: 100000, desde: d('2026-07-23'), hasta: d('2026-07-23'), limiteDescubierto: 18200000,
    movimientos: [{ fecha: d('2026-07-23'), tipo: 'egreso', monto: 1100000, categoria: 'cheque' }],
  })
  assert.equal(cal[0].saldo_final, -1000000)
  assert.equal(cal[0].descubierto_utilizado, 1000000)
  assert.equal(cal[0].credito_disponible, 18200000 - 1000000)
  assert.equal(cal[0].riesgo, 'medio')
  assert.equal(cal[0].recomendaciones, 1) // un día en riesgo pide al menos una acción
})

test('el detalle del día conserva proveedor/cliente/obra/medio/origen para el panel lateral', () => {
  const cal = armarCalendario({
    cajaInicial: 0, desde: d('2026-07-23'), hasta: d('2026-07-23'),
    movimientos: [{ fecha: d('2026-07-23'), tipo: 'egreso', monto: 500000, categoria: 'cheque', proveedor: 'Corralon Progreso', obra: 'LA ESTRELLA', medio: 'Cheque', origen: 'Cheques' }],
  })
  const m = cal[0].movimientos[0]
  assert.equal(m.proveedor, 'Corralon Progreso')
  assert.equal(m.obra, 'LA ESTRELLA')
  assert.equal(m.medio, 'Cheque')
  assert.equal(m.origen, 'Cheques')
})

test('claveDia es local y estable (no se corre por timezone)', () => {
  assert.equal(claveDia(new Date(2026, 6, 5)), '2026-07-05')
  assert.equal(claveDia(new Date(2026, 11, 31)), '2026-12-31')
})
