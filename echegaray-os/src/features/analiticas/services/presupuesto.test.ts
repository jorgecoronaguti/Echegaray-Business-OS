import test from 'node:test'
import assert from 'node:assert/strict'
import { leerPresupuestos, presupuestoPorObra, validarPresupuestos } from './presupuesto.ts'

test('hoy no hay fuente: vacío CON su motivo, nunca un número', async () => {
  assert.deepEqual(await leerPresupuestos(), { filas: [], motivo: 'sin presupuesto cargado' })
  assert.deepEqual(await leerPresupuestos([]), { filas: [], motivo: 'sin presupuesto cargado' })
})

test('un monto sin fuente, negativo o no numérico no es presupuesto', () => {
  const filas = validarPresupuestos([
    { obraId: 'a', rubro: 'materiales', monto: 10, fuente: 'cot.xlsm!H12' },
    { obraId: 'a', rubro: 'materiales', monto: 10, fuente: '  ' },
    { obraId: 'a', rubro: 'materiales', monto: -1, fuente: 'x' },
    { obraId: 'a', rubro: 'materiales', monto: '10', fuente: 'x' },
    { obraId: 'a', rubro: 'margen', monto: 10, fuente: 'x' },
    null,
  ])
  assert.equal(filas.length, 1)
})

test('por obra: rubros sin fila quedan null (no cero) y el total suma los presupuestados', async () => {
  const { filas, motivo } = await leerPresupuestos([
    { obraId: 'a', rubro: 'materiales', monto: 10, fuente: 'f1' },
    { obraId: 'a', rubro: 'materiales', monto: 5, fuente: 'f2' },
    { obraId: 'a', rubro: 'manoObra', monto: 20, fuente: 'f1' },
  ])
  assert.equal(motivo, null)
  const a = presupuestoPorObra(filas).get('a')!
  assert.deepEqual(a.porRubro, { manoObra: 20, materiales: 15, subcontratos: null, otros: null })
  assert.equal(a.total, 35)
  assert.deepEqual(a.fuentes, ['f1', 'f2'])
  assert.equal(presupuestoPorObra(filas).has('b'), false)
})
