import test from 'node:test'
import assert from 'node:assert/strict'
import { armarRecibo, type EntradaRecibo } from './recibo.ts'

const base = (r: Partial<EntradaRecibo['rendicion']> = {}, e: Partial<EntradaRecibo['entrega']> = {}): EntradaRecibo => ({
  rendicion: { monto: 170000, fecha: '2026-09-28', imputada_en: '2026-09-30T15:00:00Z', concepto: 'Alquiler de contenedor', proveedor: 'Contenedores del Sur', ...r },
  entrega: { codigo: 'ER-0021', obra: 'Casa Pérez', estructura: false, ...e },
  codigoObra: 'OB-0012',
  pagador: 'Emiliano Maldonado',
})

test('arma los campos desde la rendición y la entrega', () => {
  const r = armarRecibo(base())!
  assert.equal(r.fecha, '28/09/2026')
  assert.equal(r.montoTexto, '170.000,00')
  assert.equal(r.concepto, 'Alquiler de contenedor')
  assert.equal(r.obra, 'OB-0012 · Casa Pérez')
  assert.equal(r.proveedor, 'Contenedores del Sur')
  assert.equal(r.entrega, 'ER-0021')
  assert.equal(r.pagador, 'Emiliano Maldonado')
})

test('importe en letras: 170000, 1000000, 2543000 y 19999,90', () => {
  const l = (monto: number) => armarRecibo(base({ monto }))!.montoEnLetras
  assert.equal(l(170000), 'Ciento Setenta Mil Con 00/100')
  assert.equal(l(1000000), 'Un Millón Con 00/100')
  assert.equal(l(2543000), 'Dos Millones Quinientos Cuarenta y Tres Mil Con 00/100')
  assert.equal(l(19999.9), 'Diecinueve Mil Novecientos Noventa y Nueve Con 90/100')
  assert.equal(armarRecibo(base({ monto: 19999.9 }))!.montoTexto, '19.999,90')
})

test('lo que no se sabe queda en blanco, nunca inventado', () => {
  const r = armarRecibo(base({ proveedor: '  ', concepto: null, fecha: null, imputada_en: 'basura' }))!
  assert.equal(r.proveedor, null)
  assert.equal(r.concepto, null)
  assert.equal(r.fecha, null)
})

test('estructura no lleva obra; sin fecha de gasto usa la de imputación', () => {
  const r = armarRecibo(base({ fecha: null }, { estructura: true, obra: null }))!
  assert.equal(r.obra, 'Estructura')
  assert.equal(r.fecha, '30/09/2026')
})

test('un monto cero o negativo no arma recibo', () => {
  assert.equal(armarRecibo(base({ monto: 0 })), null)
  assert.equal(armarRecibo(base({ monto: -5 })), null)
})
