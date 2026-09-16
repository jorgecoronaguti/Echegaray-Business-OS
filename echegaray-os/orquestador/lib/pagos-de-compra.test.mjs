// LOS PAGOS DE UNA FILA DE COMPRAS — cada prueba nombra el defecto que atrapa.
//
// El defecto más caro de este archivo no es un número mal sumado: es escribir una celda DERIVADA.
// `Monto Parcial 1` es `=T-O` en 716 de 717 celdas, `Estado pago` es el semáforo y `Saldo pendiente
// (OS)` es una ARRAYFORMULA anclada en la fila 4 que derrama la columna entera. Un valor encima de
// esa última mata la columna desde la fila 4 y con ella toda la pestaña Proveedores. Por eso la
// primera prueba no mira un monto: mira qué celdas se pueden tocar.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DERIVADAS, ESCRIBIBLES, REVISAR, confirmaCelda, estadoCalculado, pagadoDeCompra, paraElSheet,
  planDeDeshacer, planDePago, saldoDeCompra, saldoPublicadoProyectado, semaforoDe, tramoLibre,
} from './pagos-de-compra.mjs'
import { diaDe } from './compras-fila.mjs'
import { PAGADO, PENDIENTE } from './deuda-por-tramos.mjs'

/** Una fila de `compra_sheet` sin pagar: $121.000 de total. */
const fila = (extra = {}) => ({
  fila: 120, total: 121000, monto_pagado: 0, monto_parcial_1: 0, monto_parcial_2: 0,
  pago_total_o_parcial: null, tipo_pago: null, estado: PENDIENTE, estado_pago: '△ Por vencer',
  fecha_prevista: '2026-09-30', fecha_prevista_2: null, saldo_pendiente: 121000, anulada: false,
  ...extra,
})
const rotulos = (p) => p.celdas.map((c) => c.rotulo).sort()
const valorDe = (p, rotulo) => p.celdas.find((c) => c.rotulo === rotulo)?.valor

test('ninguna celda derivada es escribible — la ARRAYFORMULA del saldo se mata desde la fila 4', () => {
  for (const d of DERIVADAS) assert.equal(ESCRIBIBLES.has(d), false, `${d} no puede escribirse`)
  // Y las de entrada sí, porque el contrato A→AN las declara así (persona, cargador, o pisada).
  for (const r of ['Total o Parcial', 'Monto Pagado', 'Fecha prevista de pago 2', 'Monto Parcial 2', 'Estado', 'Tipo pago']) {
    assert.equal(ESCRIBIBLES.has(r), true, `${r} tiene que poder escribirse`)
  }
})

test('estadoCalculado ES la fórmula de la planilla, tolerancia incluida', () => {
  // IF(ABS(T+W-O)<1;"Pagado";IF(T+W<O;"Pendiente";"Revisar"))
  assert.equal(estadoCalculado({ total: 100, monto_pagado: 100, monto_parcial_2: 0 }), PAGADO)
  assert.equal(estadoCalculado({ total: 100, monto_pagado: 60, monto_parcial_2: 40 }), PAGADO)
  assert.equal(estadoCalculado({ total: 100, monto_pagado: 99.5, monto_parcial_2: 0 }), PAGADO, 'la tolerancia es de un peso')
  assert.equal(estadoCalculado({ total: 100, monto_pagado: 98.9, monto_parcial_2: 0 }), PENDIENTE)
  assert.equal(estadoCalculado({ total: 100, monto_pagado: 120, monto_parcial_2: 0 }), REVISAR)
  // `Monto Parcial 1` NO entra en la cuenta: es `=T-O` y sumarlo contaría el pago dos veces.
  assert.equal(pagadoDeCompra({ monto_pagado: 60, monto_parcial_1: -40, monto_parcial_2: 40 }), 100)
})

test('pagado total desde cero: un tramo, Estado Pagado, y ni una celda derivada', () => {
  const p = planDePago({ compra: fila(), accion: { tipo: 'total', fecha: '2026-09-16', medio: 'Transferencia' }, hoy: '2026-09-16' })
  assert.deepEqual(rotulos(p), ['Estado', 'Monto Pagado', 'Tipo pago', 'Total o Parcial'])
  assert.equal(valorDe(p, 'Monto Pagado'), 121000)
  assert.equal(valorDe(p, 'Total o Parcial'), 'Total')
  assert.equal(valorDe(p, 'Estado'), PAGADO)
  assert.equal(p.proyeccion.saldo_aritmetico, 0)
  assert.equal(p.proyeccion.saldo_pendiente, 0)
  assert.equal(p.proyeccion.estado_pago, '✓ Pagado')
  // La derivada se PROYECTA con la fórmula del Sheet (`=T-O`), no se escribe.
  assert.equal(p.proyeccion.monto_parcial_1, 0)
})

test('parcial desde cero: usa el tramo 1 y guarda la fecha prevista del resto en el tramo 2', () => {
  const p = planDePago({
    compra: fila(),
    accion: { tipo: 'parcial', monto: 50000, fecha: '2026-09-16', fechaResto: '2026-10-15' },
    hoy: '2026-09-16',
  })
  // «Estado» NO está: la fila ya decía «Pendiente» y una celda que ya dice lo pedido no se escribe.
  assert.deepEqual(rotulos(p), ['Fecha prevista de pago 2', 'Monto Pagado', 'Total o Parcial'])
  assert.equal(valorDe(p, 'Monto Pagado'), 50000)
  assert.equal(valorDe(p, 'Fecha prevista de pago 2'), '2026-10-15')
  assert.equal(valorDe(p, 'Total o Parcial'), 'Parcial')
  assert.equal(p.proyeccion.estado, PENDIENTE)
  assert.equal(p.proyeccion.saldo_aritmetico, 71000)
  assert.equal(p.proyeccion.saldo_pendiente, 71000, 'la fila era comercial: su saldo publicado sigue vivo')
  assert.equal(p.proyeccion.monto_parcial_1, -71000, '`=T-O`, que es lo que la celda U va a decir')
})

test('el segundo pago cae en el tramo 2 y salda: Monto Parcial 2 y su fecha', () => {
  const previa = fila({ monto_pagado: 50000, pago_total_o_parcial: 'Parcial', fecha_prevista_2: '2026-10-15', saldo_pendiente: 71000 })
  assert.equal(tramoLibre(previa), 2)
  const p = planDePago({ compra: previa, accion: { tipo: 'total', fecha: '2026-10-14' }, hoy: '2026-10-14' })
  assert.deepEqual(rotulos(p), ['Estado', 'Fecha prevista de pago 2', 'Monto Parcial 2', 'Total o Parcial'])
  assert.equal(valorDe(p, 'Monto Parcial 2'), 71000)
  assert.equal(valorDe(p, 'Fecha prevista de pago 2'), '2026-10-14')
  assert.equal(valorDe(p, 'Total o Parcial'), 'Total')
  assert.equal(p.proyeccion.estado, PAGADO)
  assert.equal(p.proyeccion.saldo_pendiente, 0)
})

test('un parcial que NO salda con el tramo 1 usado se rechaza: no hay tercer tramo', () => {
  const previa = fila({ monto_pagado: 50000, fecha_prevista_2: '2026-10-15' })
  const p = planDePago({ compra: previa, accion: { tipo: 'parcial', monto: 10000, fecha: '2026-10-01', fechaResto: '2026-11-01' }, hoy: '2026-10-01' })
  assert.match(p.error, /dos tramos/)
  assert.equal(p.celdas, undefined)
})

test('con los dos tramos usados no se inventa un tercero', () => {
  const previa = fila({ total: 200000, monto_pagado: 50000, monto_parcial_2: 50000 })
  assert.equal(tramoLibre(previa), null)
  assert.match(planDePago({ compra: previa, accion: { tipo: 'total', fecha: '2026-10-01' }, hoy: '2026-10-01' }).error, /ya están usados/)
})

test('lo que no se puede pagar: de más, saldada, anulada, sin total, sin fecha del resto', () => {
  const de = (compra, accion) => planDePago({ compra, accion, hoy: '2026-09-16' }).error
  assert.match(de(fila(), { tipo: 'parcial', monto: 200000, fecha: '2026-09-16' }), /supera el saldo/)
  assert.match(de(fila({ monto_pagado: 121000 }), { tipo: 'total', fecha: '2026-09-16' }), /ya está saldada/)
  assert.match(de(fila({ anulada: true }), { tipo: 'total', fecha: '2026-09-16' }), /anulada/)
  assert.match(de(fila({ total: 0 }), { tipo: 'total', fecha: '2026-09-16' }), /Total cargado/)
  assert.match(de(fila(), { tipo: 'parcial', monto: 50000, fecha: '2026-09-16' }), /fecha prevista del saldo/)
  assert.match(de(fila(), { tipo: 'parcial', monto: 0, fecha: '2026-09-16' }), /mayor que cero/)
})

test('una fila que no publica saldo no empieza a publicarlo por un pago de la app', () => {
  // Estado Pendiente, saldo aritmético vivo y `Saldo pendiente (OS)` en cero: no es comercial.
  const nc = fila({ saldo_pendiente: 0 })
  assert.equal(saldoPublicadoProyectado(nc, PENDIENTE, 71000), 0)
  const p = planDePago({ compra: nc, accion: { tipo: 'parcial', monto: 50000, fecha: '2026-09-16', fechaResto: '2026-10-15' }, hoy: '2026-09-16' })
  assert.equal(p.proyeccion.saldo_pendiente, 0)
  assert.equal(p.proyeccion.saldo_aritmetico, 71000, 'la aritmética sí se puede afirmar')
})

test('cuando el flag comercial no se puede deducir, el saldo publicado se declara desconocido', () => {
  const pagada = fila({ estado: PAGADO, monto_pagado: 121000, saldo_pendiente: 0 })
  assert.equal(saldoPublicadoProyectado(pagada, PENDIENTE, 10), null)
})

test('el valor viaja como lo espera un archivo es-AR: número, y la fecha como dd/mm/yyyy', () => {
  assert.equal(paraElSheet(1234.567, 'importe'), 1234.57)
  assert.equal(typeof paraElSheet(1234.5, 'importe'), 'number', 'un string con coma dependería del locale')
  assert.equal(paraElSheet('2026-10-15', 'fecha'), '15/10/2026')
  assert.equal(paraElSheet('', 'fecha'), '')
  assert.equal(paraElSheet('Total', 'texto'), 'Total')
})

test('la relectura se confirma por especie: un importe vuelve número y una fecha vuelve serial', () => {
  assert.equal(confirmaCelda(121000.000000001, { valor: 121000, especie: 'importe' }, diaDe), true)
  assert.equal(confirmaCelda('$121.000,00', { valor: 121000, especie: 'importe' }, diaDe), false, 'sin formato no vuelve así')
  // 15/10/2026 en serial de Sheets.
  const serial = 46310
  assert.equal(diaDe(serial), '2026-10-15')
  assert.equal(confirmaCelda(serial, { valor: '2026-10-15', especie: 'fecha' }, diaDe), true)
  assert.equal(confirmaCelda(serial, { valor: '2026-10-16', especie: 'fecha' }, diaDe), false)
  assert.equal(confirmaCelda('Total', { valor: 'Total', especie: 'texto' }, diaDe), true)
})

test('deshacer repone lo que había, y lo que estaba vacío se declara en vez de fingirse', () => {
  const p = planDePago({
    compra: fila(), accion: { tipo: 'parcial', monto: 50000, fecha: '2026-09-16', fechaResto: '2026-10-15' }, hoy: '2026-09-16',
  })
  const d = planDeDeshacer(p.celdas)
  // El 0 SÍ se repone: `no-borrar.mjs` declara que un 0 es un dato, no un vacío.
  assert.equal(d.celdas.find((c) => c.rotulo === 'Monto Pagado').escribir, 0)
  // Las dos que antes estaban vacías no se pueden devolver desde un worker, y se declaran.
  const sin = d.sinDeshacer.map((x) => x.rotulo).sort()
  assert.deepEqual(sin, ['Fecha prevista de pago 2', 'Total o Parcial'])
  assert.match(d.sinDeshacer[0].motivo, /no-borrar/)
})

test('el semáforo reproduce la fórmula de Z, rarezas incluidas, y sin emoji', () => {
  assert.equal(semaforoDe({ total: 100, estado: PAGADO }, '2026-09-16'), '✓ Pagado')
  assert.equal(semaforoDe({ total: 100, estado: PENDIENTE, fecha_prevista: '2026-09-01' }, '2026-09-16'), '▲ Vencido')
  assert.equal(semaforoDe({ total: 100, estado: PENDIENTE, fecha_prevista: '2026-09-30' }, '2026-09-16'), '△ Por vencer')
  assert.equal(semaforoDe({ total: 100, estado: 'Proyectado' }, '2026-09-16'), '○ Vigente')
  assert.equal(semaforoDe({ total: 0, estado: PAGADO }, '2026-09-16'), '', 'sin total la fórmula devuelve vacío')
  // La rareza medida: Q con TEXTO nunca es menor que TODAY() en Sheets. Se reproduce, no se arregla.
  assert.equal(semaforoDe({ total: 100, estado: PENDIENTE, fecha_prevista: 'Pendiente' }, '2026-09-16'), '△ Por vencer')
})

test('el saldo del plan cierra con la aritmética que suma la pestaña Proveedores', () => {
  const p = planDePago({ compra: fila(), accion: { tipo: 'parcial', monto: 31000, fecha: '2026-09-16', fechaResto: '2026-10-15' }, hoy: '2026-09-16' })
  const despues = { total: 121000, monto_pagado: p.proyeccion.monto_pagado, monto_parcial_2: p.proyeccion.monto_parcial_2 }
  assert.equal(p.proyeccion.saldo_aritmetico, saldoDeCompra(despues))
  assert.equal(p.proyeccion.estado, estadoCalculado(despues), 'el estado escrito y el saldo salen de la misma cuenta')
})
