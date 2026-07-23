import { test } from 'node:test'
import assert from 'node:assert/strict'
import { armarCalendario, categoriaEgreso, nivelRiesgo, claveDia, movimientosCompras } from './calendario-financiero.mjs'

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

// ── COMPRAS: la pata que faltaba (23/07) ───────────────────────────────────────────────────────────
// El calendario leía caja, cheques, cobranzas y obligaciones, pero NO lo que se le debe a
// proveedores. Consecuencia real: las cuotas del plan de facilidades del F931 —que viven en
// Compras— y ~$16,4M de deuda comercial no aparecían en ningún día.
const IDX = { proveedor: 0, concepto: 1, obra: 2, total: 3, vence: 4, estado: 5 }
const monto = (v) => Number(String(v).replace(/\./g, '').replace(',', '.')) || 0
const fech = (v) => { const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(v).trim()); return m ? new Date(+m[3], +m[2] - 1, +m[1]) : null }
const args = { idx: IDX, parseMonto: monto, parseFecha: fech, desde: d('2026-07-23'), hasta: d('2026-09-30') }

test('sólo las filas "Pendiente" son deuda: Pagado y Proyectado no van al calendario', () => {
  const { movimientos } = movimientosCompras({ ...args, filas: [
    ['ARCA', 'Plan F931', '', '2494876', '16/08/2026', 'Pendiente'],
    ['Corralon', 'Materiales', 'LA ESTRELLA', '900000', '20/08/2026', 'Pagado'],
    ['Otro', 'Obra futura', '', '50000000', '25/08/2026', 'Proyectado'],
  ] })
  assert.equal(movimientos.length, 1)
  assert.equal(movimientos[0].monto, 2494876)
})

test('una cuota del plan F931 se clasifica como cargas sociales, no como "otra obligación"', () => {
  const { movimientos } = movimientosCompras({ ...args, filas: [['ARCA', 'Plan de pago F931', '', '2494876', '16/08/2026', 'Pendiente']] })
  assert.equal(movimientos[0].categoria, 'cargas_sociales')
  assert.equal(movimientos[0].origen, 'Compras (pendiente de pago)')
})

test('una factura impaga SIN fecha prevista no se inventa un día: se cuenta aparte', () => {
  const r = movimientosCompras({ ...args, filas: [['Gerson Castro', 'Mano de obra', '', '700000', 'Pendiente', 'Pendiente']] })
  assert.equal(r.movimientos.length, 0)
  assert.equal(r.sinFecha.n, 1)
  assert.equal(r.sinFecha.monto, 700000)
})

test('lo que vence fuera de la ventana no entra, y tampoco cuenta como sin fecha', () => {
  const r = movimientosCompras({ ...args, filas: [['X', 'Materiales', '', '100000', '16/12/2026', 'Pendiente']] })
  assert.equal(r.movimientos.length, 0)
  assert.equal(r.sinFecha.n, 0)
})

test('la deuda a proveedores llega al día y baja el saldo', () => {
  const { movimientos } = movimientosCompras({ ...args, filas: [['Corralon Progreso', 'Materiales', 'LA ESTRELLA', '500000', '24/07/2026', 'Pendiente']] })
  const cal = armarCalendario({ cajaInicial: 1000000, movimientos, desde: d('2026-07-24'), hasta: d('2026-07-24') })
  assert.equal(cal[0].egresos, 500000)
  assert.equal(cal[0].obligaciones, 500000)
  assert.equal(cal[0].saldo_final, 500000)
  assert.equal(cal[0].movimientos[0].obra, 'LA ESTRELLA')
})

// Hallazgo de la reconciliación real (23/07): Gruas San Blas, $5.351.225, vencida el 24/06. Su fecha
// caía ANTES del arranque de la ventana, así que el calendario la descartaba en silencio.
test('una deuda YA VENCIDA se trae al primer día y se marca, no desaparece', () => {
  const { movimientos } = movimientosCompras({ ...args, filas: [['Gruas San Blas', 'Alquiler', '', '5351225', '24/06/2026', 'Pendiente']] })
  assert.equal(movimientos.length, 1)
  assert.equal(claveDia(movimientos[0].fecha), '2026-07-23') // el arranque de la ventana
  assert.equal(movimientos[0].vencida, true)
  assert.equal(movimientos[0].vence_original, '2026-06-24')
})

test('el día conserva la marca de vencida para que el panel no la muestre como un vencimiento de hoy', () => {
  const { movimientos } = movimientosCompras({ ...args, filas: [['Gruas San Blas', 'Alquiler', '', '5351225', '24/06/2026', 'Pendiente']] })
  const cal = armarCalendario({ cajaInicial: 0, movimientos, desde: d('2026-07-23'), hasta: d('2026-07-23') })
  assert.equal(cal[0].movimientos[0].vencida, true)
  assert.equal(cal[0].movimientos[0].vence_original, '2026-06-24')
})

test('un vencimiento normal NO lleva la marca de vencida', () => {
  const { movimientos } = movimientosCompras({ ...args, filas: [['X', 'Materiales', '', '100000', '20/08/2026', 'Pendiente']] })
  const cal = armarCalendario({ cajaInicial: 0, movimientos, desde: d('2026-08-20'), hasta: d('2026-08-20') })
  assert.equal(cal[0].movimientos[0].vencida, undefined)
})
