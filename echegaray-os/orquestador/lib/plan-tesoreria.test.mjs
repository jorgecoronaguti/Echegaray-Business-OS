import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  construirPlan, esCritico, medioSugerido, HORIZONTES,
} from './plan-tesoreria.mjs'
import { ACUERDO } from './banco-santander.mjs'

const HOY = new Date(2026, 6, 24) // 24/07/2026
// Un calendario mínimo: un día con un cobro y un pago, otro con un pago crítico vencido.
function dia(fecha, movimientos) { return { fecha, saldo_inicial: 0, movimientos } }

test('esCritico: vencido, criticidad crítica y obra son críticos; lo demás no', () => {
  assert.equal(esCritico({ vencida: true }), true)
  assert.equal(esCritico({ criticidad: 'critico' }), true)
  assert.equal(esCritico({ obra: 'La Estrella' }), true)
  assert.equal(esCritico({ proveedor: 'Ferretería X' }), false)
})

test('medioSugerido: respeta el medio dado; sugiere VEP para lo fiscal y transferencia por defecto', () => {
  assert.equal(medioSugerido({ medio: 'Cheque' }), 'Cheque')
  assert.equal(medioSugerido({ categoria: 'impuesto' }), 'Transferencia (VEP)')
  assert.equal(medioSugerido({ categoria: 'cargas_sociales' }), 'Transferencia (VEP)')
  assert.equal(medioSugerido({ proveedor: 'Corralón' }), 'Transferencia')
})

test('paga con caja propia cuando alcanza: sin costo financiero, sin usar la línea', () => {
  const dias = [dia('2026-07-24', [
    { tipo: 'egreso', monto: 300000, proveedor: 'Corralón' },
  ])]
  const { acciones, resumen } = construirPlan({ dias, cajaInicial: 1000000, hoy: HOY })
  const pago = acciones.find((a) => a.tipo === 'pagar')
  assert.equal(pago.costo_financiero, 0)
  assert.equal(resumen.linea_maxima_usada, 0)
  assert.equal(resumen.saldo_proyectado_final, 700000)
})

test('un cobro entra antes que los pagos y habilita la caja del día', () => {
  const dias = [dia('2026-07-24', [
    { tipo: 'egreso', monto: 500000, proveedor: 'Corralón' },
    { tipo: 'ingreso', monto: 800000, cliente: 'Cliente A' },
  ])]
  const { acciones, resumen } = construirPlan({ dias, cajaInicial: 0, hoy: HOY })
  const cobrar = acciones.find((a) => a.tipo === 'cobrar')
  const pagar = acciones.find((a) => a.tipo === 'pagar')
  // el cobro se pudo pagar con caja: el cobro de $800k cubrió el pago de $500k
  assert.equal(pagar.costo_financiero, 0)
  assert.equal(resumen.saldo_proyectado_final, 300000)
  assert.ok(cobrar) // hay acción de cobrar
})

test('un crítico que la caja no cubre se financia con la línea, y el pago depende del financiamiento', () => {
  const dias = [dia('2026-07-24', [
    { tipo: 'egreso', monto: 1000000, proveedor: 'Gruas San Blas', vencida: true },
  ])]
  const { acciones, resumen } = construirPlan({ dias, cajaInicial: 200000, hoy: HOY })
  const fin = acciones.find((a) => a.tipo === 'financiar')
  const pago = acciones.find((a) => a.tipo === 'pagar')
  assert.ok(fin, 'debe haber una acción de financiar')
  assert.equal(fin.impacto_pesos, 800000) // 1.000.000 − 200.000 de caja
  assert.ok(fin.costo_financiero > 0, 'financiar cuesta')
  assert.deepEqual(pago.dependencias, [fin.id], 'el pago depende del financiamiento')
  assert.equal(resumen.linea_maxima_usada, 800000)
})

test('un NO crítico que perforaría el piso se posterga, no se financia', () => {
  const dias = [dia('2026-07-24', [
    { tipo: 'egreso', monto: 1000000, proveedor: 'Ferretería X' },
  ])]
  const { acciones, resumen } = construirPlan({ dias, cajaInicial: 200000, liquidezMinima: 0, hoy: HOY })
  assert.ok(acciones.some((a) => a.tipo === 'postergar'), 'lo no crítico se posterga')
  assert.ok(!acciones.some((a) => a.tipo === 'financiar'), 'no se financia un no crítico')
  assert.equal(resumen.linea_maxima_usada, 0)
  assert.equal(resumen.saldo_proyectado_final, 200000) // el saldo no baja: no se pagó
})

test('respeta la liquidez mínima: no baja la caja por debajo del piso con pagos no críticos', () => {
  const dias = [dia('2026-07-24', [
    { tipo: 'egreso', monto: 400000, proveedor: 'Ferretería X' },
  ])]
  const { resumen } = construirPlan({ dias, cajaInicial: 500000, liquidezMinima: 300000, hoy: HOY })
  // sólo hay $200k por encima del piso; el pago de $400k se posterga → saldo intacto
  assert.equal(resumen.saldo_proyectado_final, 500000)
})

test('cuando entra caja después, se cancela la línea y la cancelación depende del cobro', () => {
  const dias = [
    dia('2026-07-24', [{ tipo: 'egreso', monto: 1000000, proveedor: 'AFIP', vencida: true }]),
    dia('2026-07-26', [{ tipo: 'ingreso', monto: 1200000, cliente: 'Cliente A' }]),
  ]
  const { acciones, resumen } = construirPlan({ dias, cajaInicial: 0, hoy: HOY })
  const fin = acciones.find((a) => a.tipo === 'financiar')
  const cancel = acciones.find((a) => a.tipo === 'cancelar_financiacion')
  const cobro = acciones.find((a) => a.tipo === 'cobrar')
  assert.ok(fin && cancel, 'se financia y luego se cancela')
  assert.deepEqual(cancel.dependencias, [cobro.id], 'la cancelación depende del cobro que trajo la caja')
  assert.equal(resumen.linea_maxima_usada, 1000000)
  assert.equal(resumen.saldo_proyectado_final, 200000) // 1,2M − 1M financiado
})

test('marca cuando el financiamiento EXCEDE el límite de la línea — no lo tapa', () => {
  const dias = [dia('2026-07-24', [
    { tipo: 'egreso', monto: ACUERDO.importe + 5000000, proveedor: 'Gruas', vencida: true },
  ])]
  const { acciones, resumen } = construirPlan({ dias, cajaInicial: 0, limiteDescubierto: ACUERDO.importe, hoy: HOY })
  const fin = acciones.find((a) => a.tipo === 'financiar')
  assert.equal(fin.excede_limite, true)
  assert.match(fin.riesgos, /EXCEDE/)
  assert.equal(resumen.excede_limite_linea, true)
  assert.equal(resumen.liquidez_minima_respetada, false)
})

test('toda acción con efecto externo requiere aprobación humana (Nivel E)', () => {
  const dias = [dia('2026-07-24', [
    { tipo: 'ingreso', monto: 500000, cliente: 'A' },
    { tipo: 'egreso', monto: 200000, proveedor: 'X' },
  ])]
  const { acciones } = construirPlan({ dias, cajaInicial: 0, hoy: HOY })
  for (const a of acciones.filter((x) => x.tipo !== 'cobrar')) {
    assert.equal(a.requiere_aprobacion, true, `${a.tipo} debe requerir aprobación`)
  }
})

test('cada acción trae el contrato completo pedido por el spec', () => {
  const dias = [dia('2026-07-24', [{ tipo: 'egreso', monto: 100000, proveedor: 'X' }])]
  const { acciones } = construirPlan({ dias, cajaInicial: 500000, hoy: HOY })
  const a = acciones[0]
  for (const campo of ['id', 'fecha', 'tipo', 'descripcion', 'motivo', 'impacto_pesos', 'costo_financiero', 'efecto_liquidez', 'riesgos', 'dependencias']) {
    assert.ok(campo in a, `falta el campo ${campo}`)
  }
})

test('los cuatro horizontes están declarados: hoy, 7, 30, 90', () => {
  assert.deepEqual(HORIZONTES.map((h) => h.clave), ['hoy', 'dias_7', 'dias_30', 'dias_90'])
  assert.deepEqual(HORIZONTES.map((h) => h.dias), [1, 7, 30, 90])
})

test('el costo financiero se acumula por día que la línea sigue usada', () => {
  // Un crítico financiado el día 1 y NO cancelado: el costo de dos días es mayor que el de uno.
  const unDia = [dia('2026-07-24', [{ tipo: 'egreso', monto: 1000000, proveedor: 'AFIP', vencida: true }])]
  const dosDias = [...unDia, dia('2026-07-25', [])]
  const c1 = construirPlan({ dias: unDia, cajaInicial: 0, hoy: HOY }).resumen.costo_financiero_total
  const c2 = construirPlan({ dias: dosDias, cajaInicial: 0, hoy: HOY }).resumen.costo_financiero_total
  assert.ok(c2 > c1, 'dos días de línea cuestan más que uno')
})
