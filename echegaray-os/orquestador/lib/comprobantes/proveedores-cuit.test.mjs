// EL CUIT DEL COMPROBANTE COMPLETA EL CUADRO DE PROVEEDORES — todo con dobles.
//
// NO SE TOCA EL SHEET REAL EN NINGÚN TEST. La única función que sabe escribir es `escribirCuits`, y
// acá se ejercita con un cliente de Google falso que anota lo que le pidieron: lo que se verifica es
// QUÉ celda se escribiría y con qué valor, que es lo que hay que revisar antes de dejarlo correr.

import test from 'node:test'
import assert from 'node:assert/strict'
import { filasDeProveedores, cuitsDeComprobantes, decidirCuits, escribirCuits, MOTIVO, FILA_BASE } from './proveedores-cuit.mjs'
import { CUIT_EMPRESA } from './lectura.mjs'

/** El cuadro tal como lo devuelve `readSheetValues('Proveedores!A41:B')`. La primera fila es la 41. */
const CUADRO = [
  ['Proveedor', 'CUIT'],
  ['ALUMETAL', ''],
  ['HORMISERV', '30-68164173-0'],
  ['Villa del Pino', ''],
  ['', ''],
  ['Corralon Progreso', ''],
]

const comprobante = (proveedor, cuit, numero = '0038-00025942') => ({ proveedor, cuit, numero, fecha: '31/07/2026' })

test('el cuadro se lee por fila REAL, y el encabezado no es un proveedor', () => {
  const filas = filasDeProveedores(CUADRO)
  assert.deepEqual(filas.map((f) => [f.fila, f.nombre, f.cuit]), [
    [FILA_BASE + 1, 'ALUMETAL', null],
    [FILA_BASE + 2, 'HORMISERV', '30681641730'],
    [FILA_BASE + 3, 'Villa del Pino', null],
    [FILA_BASE + 5, 'Corralon Progreso', null],
  ])
})

test('EL CASO: el CUIT del papel completa la celda vacía, y dice de qué comprobante salió', () => {
  const { escribir } = decidirCuits(filasDeProveedores(CUADRO), [comprobante('ALUMETAL', '30-56736337-2')])
  assert.equal(escribir.length, 1)
  assert.deepEqual(escribir[0], {
    fila: 42, columna: 'B', nombre: 'ALUMETAL', cuit: '30567363372',
    evidencia: [{ numero: '0038-00025942', fecha: '31/07/2026' }],
  })
})

test('DOS comprobantes del mismo proveedor con CUIT DISTINTOS: no se escribe nada', () => {
  const r = decidirCuits(filasDeProveedores(CUADRO), [
    comprobante('ALUMETAL', '30567363372', '0038-00025942'),
    comprobante('ALUMETAL', '30679777986', '0038-00025943'),
  ])
  assert.deepEqual(r.escribir, [], 'uno de los dos está mal leído y no hay forma de saber cuál')
  assert.equal(r.descartados[0].motivo, MOTIVO.CONFLICTO)
})

test('el mismo CUIT repetido NO es un conflicto: es más evidencia', () => {
  const r = decidirCuits(filasDeProveedores(CUADRO), [
    comprobante('ALUMETAL', '30-56736337-2', '0038-00025942'),
    comprobante('ALUMETAL', '30567363372', '0038-00025943'),
  ])
  assert.equal(r.escribir.length, 1)
  assert.equal(r.escribir[0].evidencia.length, 2)
})

test('un CUIT que YA está no se pisa, ni cuando el papel dice otro: se reporta y se deja', () => {
  const r = decidirCuits(filasDeProveedores(CUADRO), [comprobante('HORMISERV', '30-11111111-1')])
  assert.deepEqual(r.escribir, [], 'corregir el CUIT de un proveedor es una decisión del dueño')
  assert.equal(r.descartados[0].motivo, MOTIVO.DISCREPA)
  assert.deepEqual(r.descartados[0].detalle, { enElCuadro: '30681641730', enElPapel: '30111111111' })
})

test('si el que ya está COINCIDE con el papel, no hay nada que hacer ni que avisar', () => {
  const r = decidirCuits(filasDeProveedores(CUADRO), [comprobante('HORMISERV', '30-68164173-0')])
  assert.deepEqual(r.escribir, [])
  assert.deepEqual(r.descartados, [])
})

test('el CUIT de ECHEGARAY nunca es el del emisor: en un comprobante de compra somos el comprador', () => {
  const r = decidirCuits(filasDeProveedores(CUADRO), [comprobante('ALUMETAL', CUIT_EMPRESA)])
  assert.deepEqual(r.escribir, [])
})

test('un CUIT que no tiene once dígitos no es un CUIT', () => {
  assert.equal(cuitsDeComprobantes([comprobante('ALUMETAL', '3056736337')]).size, 0)
  assert.equal(cuitsDeComprobantes([comprobante('ALUMETAL', '305673633721')]).size, 0)
})

test('un proveedor que NO está en el cuadro no agrega una fila: se reporta', () => {
  const r = decidirCuits(filasDeProveedores(CUADRO), [comprobante('Ductos San Juan SRL', '30111111111')])
  assert.deepEqual(r.escribir, [])
  assert.equal(r.descartados[0].motivo, MOTIVO.SIN_FILA)
})

// ── EL PUNTO DE ESCRITURA, AISLADO Y FALLANDO CERRADO ────────────────────────

test('SIN aplicar:true no se escribe una sola celda: devuelve el plan', async () => {
  const escrituras = []
  const google = { writeSheetValues: async (...a) => escrituras.push(a) }
  const { escribir } = decidirCuits(filasDeProveedores(CUADRO), [comprobante('ALUMETAL', '30567363372')])
  const r = await escribirCuits(google, escribir, { fileId: 'X' })
  assert.equal(r.escritas, 0)
  assert.deepEqual(escrituras, [], 'el default no toca el Sheet: se mira el plan primero')
  assert.deepEqual(r.plan, [{ rango: 'Proveedores!B42', valor: '30567363372', nombre: 'ALUMETAL' }])
})

test('con aplicar:true escribe SÓLO la celda B de la fila decidida, nunca un rango que la abarque', async () => {
  const escrituras = []
  const google = { writeSheetValues: async (fileId, rango, valores) => escrituras.push({ fileId, rango, valores }) }
  const { escribir } = decidirCuits(filasDeProveedores(CUADRO), [comprobante('ALUMETAL', '30567363372')])
  const r = await escribirCuits(google, escribir, { fileId: 'X', aplicar: true })
  assert.equal(r.escritas, 1)
  assert.deepEqual(escrituras, [{ fileId: 'X', rango: 'Proveedores!B42', valores: [['30567363372']] }])
})

test('sin cliente de Google no se inventa un éxito', async () => {
  const r = await escribirCuits({}, [{ fila: 42, columna: 'B', cuit: '1', nombre: 'X' }], { aplicar: true })
  assert.equal(r.ok, false)
  assert.equal(r.escritas, 0)
})
