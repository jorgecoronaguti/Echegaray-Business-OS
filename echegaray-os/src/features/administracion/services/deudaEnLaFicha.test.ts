import test from 'node:test'
import assert from 'node:assert/strict'
import {
  deudaDeLaFicha, diasEntre, tituloDeLaDeuda, tonoDeLaDeuda,
} from './deudaEnLaFicha.ts'
import {
  deudaPorProveedor, lineasDeDeuda,
  type CompraConSaldo, type DeudaDeProveedor, type ProveedorResuelto,
} from './deudaProveedores.ts'

// LO QUE ESTOS TESTS ATRAPAN:
//
//  · Un «$ 0» dibujado cuando no se pudo leer → se lee «no le debo nada» y se deja de pagar.
//  · «Al día» sin haber leído → la misma mentira con otras palabras.
//  · Los días de atraso corridos por el huso → un vencimiento de hoy anunciado como atrasado.
//  · Lo por vencer pintado como problema → se paga antes de tiempo plata que no es exigible.
//  · Una ficha que suma su propia deuda en vez de reusar la de «A quién le debo» → dos verdades.

const HOY = '2026-09-22'

function compra(p: Partial<CompraConSaldo> & { fila: number }): CompraConSaldo {
  return {
    proveedor: 'Corralon Progreso', cuit: null, fecha: '2026-08-01', comprobante: 'FC A 1',
    concepto: null, total: 1000, fecha_prevista: '2026-09-30', fecha_prevista_2: null,
    monto_pagado: 0, monto_parcial_2: null, saldo_pendiente: 1000, estado: 'Pendiente',
    estado_pago: null, tramo_vencimiento: null, anulada: false, obra_id: null, ...p,
  }
}

const RESUELTOS = new Map<string, ProveedorResuelto>([['CORRALON PROGRESO', {
  nombre_norm: 'CORRALON PROGRESO', proveedor_id: 'pv-1',
  proveedor_nombre: 'Corralón Progreso', estado: 'vinculado',
}]])

/** La fila tal como la arma «A quién le debo». La ficha NO tiene otra forma de conseguirla. */
function filaDe(compras: CompraConSaldo[], hoy = HOY): DeudaDeProveedor | null {
  const lineas = lineasDeDeuda(compras, RESUELTOS, hoy)
  return deudaPorProveedor(lineas, RESUELTOS, compras).find((f) => f.clave === 'pv-1') ?? null
}

// ═══ LOS TRES ESTADOS ═══

test('sin lectura NO hay cero: hay motivo', () => {
  const d = deudaDeLaFicha(null, 'Las compras y sus saldos son de Administración.')
  assert.equal(d.estado, 'sin-leer')
  assert.equal(d.motivo, 'Las compras y sus saldos son de Administración.')
  assert.equal(d.total, 0)
  // El tono no pinta nada: un color ahí le daría estado a un dato que no existe.
  assert.equal(tonoDeLaDeuda(d), undefined)
})

test('leído y sin saldo es «al día», y lo dice con todas las letras', () => {
  const d = deudaDeLaFicha({ fila: filaDe([compra({ fila: 1, saldo_pendiente: 0 })]), hoy: HOY }, null)
  assert.equal(d.estado, 'al-dia')
  assert.equal(d.motivo, null)
  assert.match(tituloDeLaDeuda(d, HOY), /saldo pendiente al 2026-09-22/)
})

test('con saldo publica el total y su reparto, tomados de la fila de «A quién le debo»', () => {
  const fila = filaDe([
    compra({ fila: 1, saldo_pendiente: 500_000, fecha_prevista: '2026-08-12' }),
    compra({ fila: 2, saldo_pendiente: 300_000, fecha_prevista: '2026-09-30' }),
    compra({ fila: 3, saldo_pendiente: 200_000, fecha_prevista: null }),
  ])
  const d = deudaDeLaFicha({ fila, hoy: HOY }, null)
  assert.equal(d.estado, 'debe')
  assert.equal(d.total, 1_000_000)
  assert.equal(d.vencido, 500_000)
  assert.equal(d.porVencer, 300_000)
  assert.equal(d.sinFecha, 200_000)
  assert.equal(d.comprobantes, 3)
  // El total de la ficha ES el de la tabla: no se suma dos veces por dos caminos.
  assert.equal(d.total, fila!.total)
  assert.equal(d.clave, 'pv-1')
})

// ═══ DESDE CUÁNDO ═══

test('«desde» es el vencimiento impago más viejo, con sus días', () => {
  const d = deudaDeLaFicha({
    fila: filaDe([
      compra({ fila: 1, saldo_pendiente: 100, fecha_prevista: '2026-09-01' }),
      compra({ fila: 2, saldo_pendiente: 100, fecha_prevista: '2026-08-12' }),
    ]),
    hoy: HOY,
  }, null)
  assert.equal(d.desde, '2026-08-12')
  assert.equal(d.diasDeAtraso, 41)
})

test('un pago parcial deja debiendo el saldo, no el total', () => {
  const d = deudaDeLaFicha({
    fila: filaDe([compra({ fila: 1, total: 1_000_000, monto_pagado: 600_000, saldo_pendiente: 400_000 })]),
    hoy: HOY,
  }, null)
  assert.equal(d.total, 400_000)
})

test('una compra sin fecha no está vencida: está sin fecha, y no tiene «desde»', () => {
  const d = deudaDeLaFicha({
    fila: filaDe([compra({ fila: 1, saldo_pendiente: 700, fecha_prevista: null })]),
    hoy: HOY,
  }, null)
  assert.equal(d.vencido, 0)
  assert.equal(d.sinFecha, 700)
  assert.equal(d.desde, null)
  assert.equal(d.diasDeAtraso, null)
  // Se debe y no se sabe cuándo: eso no es un compromiso ordenado.
  assert.equal(tonoDeLaDeuda(d), 'warn')
})

test('el vencimiento de HOY ya vence hoy, y son cero días de atraso — no uno', () => {
  const d = deudaDeLaFicha({
    fila: filaDe([compra({ fila: 1, saldo_pendiente: 900, fecha_prevista: HOY })]),
    hoy: HOY,
  }, null)
  assert.equal(d.vencido, 900)
  assert.equal(d.diasDeAtraso, 0)
})

// ═══ EL COLOR DICE LO MISMO QUE EL NÚMERO ═══

test('lo vencido pinta; lo sólo comprometido a futuro, no', () => {
  const soloFuturo = deudaDeLaFicha({
    fila: filaDe([compra({ fila: 1, saldo_pendiente: 100, fecha_prevista: '2026-12-01' })]),
    hoy: HOY,
  }, null)
  assert.equal(soloFuturo.vencido, 0)
  assert.equal(tonoDeLaDeuda(soloFuturo), undefined)

  const conVencido = deudaDeLaFicha({
    fila: filaDe([compra({ fila: 1, saldo_pendiente: 100, fecha_prevista: '2026-01-01' })]),
    hoy: HOY,
  }, null)
  assert.equal(tonoDeLaDeuda(conVencido), 'neg')
})

test('los días se cuentan en UTC: ninguna fecha se corre por el huso de San Juan', () => {
  assert.equal(diasEntre('2026-09-22', '2026-09-22'), 0)
  assert.equal(diasEntre('2026-09-21', '2026-09-22'), 1)
  // Cruce de cambio de mes y de año, que es donde un `new Date(iso)` local se corre un día.
  assert.equal(diasEntre('2025-12-31', '2026-01-01'), 1)
  assert.equal(diasEntre('2026-08-31', '2026-09-01'), 1)
})
