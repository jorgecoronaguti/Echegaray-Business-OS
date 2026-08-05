// EL MAPA CUIT → PROVEEDOR, contra la forma REAL de la pestaña `Proveedores`.
//
// La grilla de abajo es la de la pestaña viva del 05/08, recortada: tres bloques con encabezado
// propio y UNO SOLO con CUIT. El rango fijo que había antes (`A41:B200`) leía la cola del bloque
// equivocado —donde la columna B es el N° de comprobante— y se caía del final del bueno en cuanto
// la deuda abierta sumara filas. Nada de eso da error: da un proveedor "nuevo" que traba la carga.

import test from 'node:test'
import assert from 'node:assert/strict'
import { cuitsDeLaGrilla, proveedoresPorCuit } from './listas.mjs'

/** La pestaña real, con sus tres bloques en el orden en que están. */
const PESTANA = [
  ['Proveedores'],
  ['Deuda comercial por fecha de pago.'],
  [],
  ['DEUDA AL 05/08/2026', 'Saldo'],
  ['TOTAL', '$19.826.655'],
  [],
  ['Proveedor', 'Se le debe'],          // bloque 1: la columna B es plata
  ['Hormiserv', '5.995.792'],
  ['Alumetal', '5.174.285'],
  [],
  ['Proveedor', 'N° Comprobante'],      // bloque 2: la columna B es un número de factura
  ['DUPEC', '0009-00003204'],
  ['MASS CONSULTORA', '00001-00000052'],
  ['Corralon Progreso', '0004-00003637'],
  [],
  ['Proveedor', 'CUIT (OS)'],           // bloque 3: EL ÚNICO con CUIT
  ['Alumetal', '30-56736337-2'],
  ['Corralon Progreso', '23-36911157-4'],
  ['Gerson Castro', ''],                // sin CUIT cargado: se saltea, no corta el bloque
  ['Combustibles Barcelo', '33-70833259-9'],
  ['DUPEC', '20-28773782-4'],
  [],
  ['4 · LO QUE ARCA FACTURÓ Y COMPRAS NO TIENE'],
  ['Proveedor según ARCA', 'CUIT'],     // MISMO CUIT, otro nombre: el del padrón, no el del desplegable
  ['DUBOS UGARTE PEDRO LUIS RAUL', '20-28773782-4'],
  ['MB EMPRENDIMIENTOS S.R.L', '30-71037035-0'],
]

test('el bloque se encuentra por su ENCABEZADO, no por su número de fila', () => {
  const m = cuitsDeLaGrilla(PESTANA)
  assert.equal(m.get('33708332599'), 'Combustibles Barcelo')
  assert.equal(m.get('20287737824'), 'DUPEC')
  assert.equal(m.get('30567363372'), 'Alumetal')
})

test('un proveedor SIN CUIT no corta el bloque: los de abajo se leen igual', () => {
  const m = cuitsDeLaGrilla(PESTANA)
  assert.ok(m.has('20287737824'), 'DUPEC está debajo de una fila sin CUIT y es el que más falta hace')
})

test('los números de comprobante del bloque de arriba NO entran como CUIT', () => {
  const m = cuitsDeLaGrilla(PESTANA)
  for (const v of m.values()) assert.notEqual(v, undefined)
  assert.equal(m.size, 4, 'cuatro CUIT reales; ni un número de factura colado')
})

test('EL BLOQUE SE MUEVE: veinte facturas nuevas arriba no pueden esconder los CUIT', () => {
  // Es el defecto exacto del rango fijo: cada factura abierta empuja el bloque una fila hacia abajo.
  const relleno = Array.from({ length: 40 }, (_, k) => ['Proveedor X', `000${k}-00000001`])
  const corrida = [...PESTANA.slice(0, 14), ...relleno, ...PESTANA.slice(14)]
  const m = cuitsDeLaGrilla(corrida)
  assert.equal(m.get('33708332599'), 'Combustibles Barcelo', 'con el rango anclado a la fila, éste se caía del tope')
  assert.equal(m.size, 4)
})

test('el bloque de ARCA no se mezcla: manda el nombre del DESPLEGABLE, no la razón social', () => {
  const m = cuitsDeLaGrilla(PESTANA)
  // El mismo CUIT está en los dos bloques. En Compras sólo se puede escribir "DUPEC": la razón
  // social del padrón no está en el desplegable estricto y dejaría la celda en rojo.
  assert.equal(m.get('20287737824'), 'DUPEC')
  assert.equal(m.has('30710370350'), false, 'lo que sólo vive en el bloque de ARCA no es un nombre escribible')
})

test('sin encabezado de CUIT no se inventa nada: el mapa vuelve vacío', () => {
  const m = cuitsDeLaGrilla([['Proveedor', 'Se le debe'], ['Hormiserv', '30-68164173-0']])
  assert.equal(m.size, 0, 'leer una columna de plata como si fueran CUIT es peor que no leer nada')
})

test('sin cliente de Google devuelve un mapa vacío, no una excepción', async () => {
  assert.equal((await proveedoresPorCuit(null)).size, 0)
  assert.equal((await proveedoresPorCuit({ readSheetValues: async () => { throw new Error('503') } })).size, 0)
})

test('proveedoresPorCuit pide un rango ABIERTO hacia abajo, no uno recortado a mano', async () => {
  let pedido = null
  await proveedoresPorCuit({ readSheetValues: async (_id, r) => { pedido = r; return PESTANA } })
  const hasta = Number(String(pedido).match(/(\d+)\s*$/)?.[1] ?? 0)
  assert.ok(hasta >= 400, `el rango tiene que sobrar sobre la pestaña, y pidió ${pedido}`)
})
