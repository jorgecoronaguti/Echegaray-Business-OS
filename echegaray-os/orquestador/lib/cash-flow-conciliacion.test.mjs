import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  COL, SIN_FACTURA, serialAMes, inicioMesSiguiente, sumarVentana, fechaDeCobro,
  conciliarCobranzas, conciliarCompras, conciliarEstructuraNeta, conciliarSinFactura,
  conciliarBanco, conciliarJornales, conciliarSueldos, impuestoAlCheque,
  cobradasConFechaFutura, pendientesFueraDeVentana, ritmoMensual,
} from './cash-flow-conciliacion.mjs'

// Seriales de Sheets usados abajo: 46023 = 01/01/2026 · 46235 = 01/08/2026 · 46265 = 31/08/2026.
const AGO = { desde: 46235, hasta: inicioMesSiguiente(46235) }

const filaCompras = ({ total, rubro, fechaCaja, subrubro = '', fechaFactura = 0 }) => {
  const f = []
  f[2] = fechaFactura
  f[COL.compras.total] = total
  f[COL.compras.rubro] = rubro
  f[COL.compras.fechaCaja] = fechaCaja
  f[COL.compras.subrubro] = subrubro
  return f
}

const filaCobranza = ({ unidad, monto, estado, fechaCobro, fechaVenta, endoso = '' }) => {
  const f = []
  f[COL.cobranzas.unidad] = unidad
  f[COL.cobranzas.monto] = monto
  f[COL.cobranzas.estado] = estado
  f[COL.cobranzas.fechaVenta] = fechaVenta
  f[COL.cobranzas.fechaCobro] = fechaCobro
  f[COL.cobranzas.endoso] = endoso
  return f
}

test('el fin de la ventana es EXCLUSIVO: el 31 entra y el 1° del mes siguiente no', () => {
  const filas = [[46265, 100], [46266, 999]]
  const r = sumarVentana(filas, { fecha: 0, monto: 1, ...AGO })
  assert.equal(r.total, 100)
})

test('inicioMesSiguiente cruza el año: diciembre 2026 termina el 01/01/2027', () => {
  assert.deepEqual(serialAMes(46357), { anio: 2026, mes: 12, dia: 1 })
  assert.deepEqual(serialAMes(inicioMesSiguiente(46357)), { anio: 2027, mes: 1, dia: 1 })
})

test('Compras se ubica por FECHA DE CAJA, no por fecha de factura — el cash flow es percibido', () => {
  // Factura de julio (46204) que se paga en agosto (46240). Devengada en julio, percibida en agosto.
  const filas = [[], [], [], filaCompras({ total: 500, rubro: 'Materiales Civil', fechaCaja: 46240, fechaFactura: 46204 })]
  assert.equal(conciliarCompras(filas, { rubro: 'Materiales Civil', ...AGO }).total, 500)
  const julio = { desde: 46204, hasta: inicioMesSiguiente(46204) }
  assert.equal(conciliarCompras(filas, { rubro: 'Materiales Civil', ...julio }).total, 0)
})

test('un rubro ajeno no se cuela en el rubro pedido', () => {
  const filas = [[], [], [],
    filaCompras({ total: 100, rubro: 'Materiales Civil', fechaCaja: 46240 }),
    filaCompras({ total: 700, rubro: 'Estructura', fechaCaja: 46240 })]
  assert.equal(conciliarCompras(filas, { rubro: 'Materiales Civil', ...AGO }).total, 100)
})

test('Estructura NETA descuenta los equipos: si no, la inversión se cuenta dos veces', () => {
  const filas = [[], [], [],
    filaCompras({ total: 1000, rubro: 'Estructura', fechaCaja: 46240 }),
    filaCompras({ total: 400, rubro: 'Estructura', fechaCaja: 46240, subrubro: 'Equipos y rodados (inversión)' })]
  const r = conciliarEstructuraNeta(filas, AGO)
  assert.equal(r.bruto, 1400)
  assert.equal(r.inversion, 400)
  assert.equal(r.total, 1000)
})

test('una cobranza ENDOSADA no es un cobro: nunca entró a la cuenta', () => {
  const filas = [[], [], [], [],
    filaCobranza({ unidad: 'Civil', monto: 1000, estado: 'Cobrado', fechaCobro: 46240 }),
    filaCobranza({ unidad: 'Civil', monto: 5000, estado: 'Cobrado', fechaCobro: 46240, endoso: 'ENDOSADO a Hormiserv' })]
  assert.equal(conciliarCobranzas(filas, { unidad: 'civil', cobrado: true, ...AGO }).total, 1000)
})

test('la fecha de una cobranza es la de COBRO; la de venta sólo si la de cobro está vacía', () => {
  const conCobro = filaCobranza({ unidad: 'Civil', monto: 10, estado: 'Cobrado', fechaCobro: 46240, fechaVenta: 46100 })
  const sinCobro = filaCobranza({ unidad: 'Civil', monto: 10, estado: 'Cobrado', fechaCobro: '', fechaVenta: 46240 })
  assert.equal(fechaDeCobro(conCobro), 46240)
  assert.equal(fechaDeCobro(sinCobro), 46240)
  // Si la reconstrucción tomara la fecha de venta primero, esta fila caería en abril y no en agosto.
  assert.equal(conciliarCobranzas([[], [], [], [], conCobro], { unidad: 'civil', cobrado: true, ...AGO }).total, 10)
})

test('"otras cobranzas" es todo lo que no es civil ni mantenimiento, y nada más', () => {
  const filas = [[], [], [], [],
    filaCobranza({ unidad: 'Civil', monto: 1, estado: 'Cobrado', fechaCobro: 46240 }),
    filaCobranza({ unidad: 'Mantenimiento', monto: 2, estado: 'Cobrado', fechaCobro: 46240 }),
    filaCobranza({ unidad: 'Alquiler', monto: 4, estado: 'Cobrado', fechaCobro: 46240 })]
  assert.equal(conciliarCobranzas(filas, { unidad: 'otras', cobrado: true, ...AGO }).total, 4)
})

test('lo esperado excluye lo cobrado y lo endosado — si no, se contarían dos veces', () => {
  const filas = [[], [], [], [],
    filaCobranza({ unidad: 'Civil', monto: 100, estado: 'Cobrado', fechaCobro: 46240 }),
    filaCobranza({ unidad: 'Civil', monto: 200, estado: 'Pendiente', fechaCobro: 46240 }),
    filaCobranza({ unidad: 'Civil', monto: 400, estado: 'Endosado', fechaCobro: 46240 })]
  assert.equal(conciliarCobranzas(filas, { unidad: 'civil', cobrado: false, ...AGO }).total, 200)
})

test('sólo cuenta el cheque cuya factura FALTA: "sin N° de comprobante" es otro estado', () => {
  const chq = (monto, fecha, estado) => { const f = []; f[COL.cheques.monto] = monto; f[COL.cheques.fechaPago] = fecha; f[COL.cheques.estadoOS] = estado; return f }
  const filas = [[],
    chq(1000, 46240, SIN_FACTURA),
    chq(9000, 46240, '⚠ sin N° de comprobante — no se puede cruzar'),
    chq(7000, 46240, '✓ su factura está en Compras')]
  assert.equal(conciliarSinFactura(filas, { tipo: 'cheque', ...AGO }).total, 1000)
})

test('el banco se filtra por naturaleza y sentido, y el importe se toma en valor absoluto', () => {
  const mov = (fecha, importe, sentido, naturaleza) => { const f = []; f[0] = fecha; f[2] = importe; f[4] = sentido; f[5] = naturaleza; return f }
  const filas = [[], [], [],
    mov(46240, -300, 'sale', 'AFIP'),
    mov(46240, -700, 'sale', 'Comisiones y gastos bancarios'),
    mov(46240, 900, 'entra', 'AFIP')]
  assert.equal(conciliarBanco(filas, { naturaleza: 'AFIP', sentido: 'sale', ...AGO }).total, 300)
})

test('jornales: manda "Pagado el"; si no está, "Se paga el"; si no, "Hasta"', () => {
  const reales = [
    { hasta: 46100, pago: 46101, pagado: 46240, total: 10 }, // pagado en agosto aunque la quincena sea de abril
    { hasta: 46100, pago: 46240, pagado: '', total: 20 },
    { hasta: 46240, pago: '', pagado: '', total: 40 },
  ]
  const proy = [
    { hasta: 46249, pago: 46251, total: 80 }, // se paga el 17/08 → entra
    { hasta: 46265, pago: 46270, total: 160 }, // se paga en septiembre → NO entra
  ]
  const r = conciliarJornales(reales, proy, AGO)
  assert.equal(r.real, 70)
  assert.equal(r.proyectado, 80)
  assert.equal(r.total, 150)
})

test('sueldos: pagado y proyectado se SUMAN, y una fila con los dos queda denunciada', () => {
  const r = conciliarSueldos([
    { pago: 46240, pagado: 3000, proyectado: 0 },
    { pago: 46244, pagado: 0, proyectado: 9000 },
    { pago: 46250, pagado: 500, proyectado: 500 },
    { pago: 46300, pagado: 7777, proyectado: 0 },
  ], AGO)
  assert.equal(r.total, 13000)
  assert.equal(r.dobles, 1)
})

test('una cobranza "Cobrado" con fecha futura se denuncia: el cuadro la afirma como hecho', () => {
  const filas = [[], [], [], [],
    filaCobranza({ unidad: 'Civil', monto: 10000000, estado: 'Cobrado', fechaCobro: 46249 }), // 15/08
    filaCobranza({ unidad: 'Civil', monto: 500, estado: 'Cobrado', fechaCobro: 46230 }), // ya pasó
    filaCobranza({ unidad: 'Civil', monto: 700, estado: 'Pendiente', fechaCobro: 46260 })] // no dice cobrado
  const r = cobradasConFechaFutura(filas, 46238)
  assert.equal(r.total, 10000000)
  assert.equal(r.casos.length, 1)
})

test('una factura vencida y no cobrada queda fuera del cuadro: ni cobrada ni esperada', () => {
  const filas = [[], [], [], [],
    filaCobranza({ unidad: 'Civil', monto: 10000000, estado: 'Pendiente', fechaCobro: 46234 }), // 31/07
    filaCobranza({ unidad: 'Civil', monto: 900, estado: 'Pendiente', fechaCobro: 46249 }), // dentro de la ventana
    filaCobranza({ unidad: 'Civil', monto: 800, estado: 'Cobrado', fechaCobro: 46200 }), // cobrada: no aplica
    filaCobranza({ unidad: 'Civil', monto: 0, estado: 'Cancelar', fechaCobro: 46220 })] // sin monto: no es plata
  const r = pendientesFueraDeVentana(filas, 46235)
  assert.equal(r.total, 10000000)
  assert.equal(r.casos.length, 1)
})

test('el ritmo mensual promedia los meses CERRADOS, sin contar el mes en curso', () => {
  const filas = [[], [], [],
    filaCompras({ total: 300, rubro: 'Estructura', fechaCaja: 46160 }), // mayo
    filaCompras({ total: 600, rubro: 'Estructura', fechaCaja: 46190 }), // junio
    filaCompras({ total: 900, rubro: 'Estructura', fechaCaja: 46210 }), // julio
    filaCompras({ total: 999999, rubro: 'Estructura', fechaCaja: 46240 })] // agosto: NO entra
  const r = ritmoMensual(filas, { rubro: 'Estructura', inicioMesActual: 46235, meses: 3 })
  assert.equal(r.total, 1800)
  assert.equal(r.promedio, 600)
})

test('impuesto al cheque: 0,6% de la suma de los componentes', () => {
  assert.equal(impuestoAlCheque([1000000, 500000]), 9000)
  assert.equal(impuestoAlCheque([]), 0)
})
