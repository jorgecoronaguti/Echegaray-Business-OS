import test from 'node:test'
import assert from 'node:assert/strict'
import { planDeVinculos, MOTIVO } from './vinculo-confirmado.mjs'
import { planDeAltas, ALTA } from './alta-padron.mjs'

const FILAS = [
  { fila: 817, clave: 'c:30621517429|0042-00057984', proveedor: 'Pintureria Cordoba', total: 426219.42 },
  { fila: 783, clave: 'p:rsv|0011-00087469', proveedor: 'RSV', total: 67797.51 },
]

test('escribe la clave de la FILA, no la que leyó el papel', () => {
  // El defecto que atrapa: guardar `c:30621517429|0042-00393288` deja el adjunto colgado de una
  // clave que no existe en compra_sheet — la compra sigue diciendo «sin comprobante».
  const { vinculos } = planDeVinculos({
    papeles: [{ file_id: 'f1', clave: 'c:30621517429|0042-00393288', nombre: 'IMG_7576.HEIC' }],
    decisiones: [{ clave: 'c:30621517429|0042-00393288', fila: 817 }],
    filas: FILAS,
  })
  assert.equal(vinculos.length, 1)
  assert.equal(vinculos[0].compra_clave, 'c:30621517429|0042-00057984')
  assert.equal(vinculos[0].fila, 817)
})

test('todas las copias del mismo papel caen en la misma fila', () => {
  const papeles = ['a', 'b', 'c'].map((f) => ({ file_id: f, clave: 'p:rsv|0011-00087469' }))
  const { vinculos } = planDeVinculos({ papeles, decisiones: [{ clave: 'p:rsv|0011-00087469', fila: 783 }], filas: FILAS })
  assert.deepEqual(vinculos.map((v) => v.file_id), ['a', 'b', 'c'])
})

test('una fila que no está en el espejo no vincula nada', () => {
  const { vinculos, problemas } = planDeVinculos({
    papeles: [{ file_id: 'f1', clave: 'k' }], decisiones: [{ clave: 'k', fila: 9999 }], filas: FILAS,
  })
  assert.equal(vinculos.length, 0)
  assert.equal(problemas[0].motivo, MOTIVO.fila_inexistente)
})

test('correr dos veces no vincula de nuevo: sin papeles sueltos no hay plan', () => {
  const { vinculos, problemas } = planDeVinculos({ papeles: [], decisiones: [{ clave: 'k', fila: 783 }], filas: FILAS })
  assert.equal(vinculos.length, 0)
  assert.equal(problemas[0].motivo, MOTIVO.sin_papel)
})

test('un CUIT con el dígito verificador roto NO crea ficha', () => {
  // El caso real: la visión leyó 30-71965694-4 en la factura de A.C.SAT y ese CUIT no existe.
  const plan = planDeAltas([
    { nombre: 'A.C.SAT S.R.L.', cuit: '30-71965694-4', fuente: 'visión' },
    { nombre: 'A.C.SAT S.R.L.', cuit: '30-71096504-4', fuente: 'dueño' },
  ], [])
  assert.equal(plan[0].accion, ALTA.cuit_invalido)
  assert.equal(plan[1].accion, ALTA.crear)
})

test('el CUIT ya en el padrón no se duplica aunque el nombre sea otro', () => {
  const plan = planDeAltas([{ nombre: 'AC SAT', cuit: '30710965044', fuente: 'x' }],
    [{ nombre: 'A.C.SAT S.R.L.', cuit: '30-71096504-4' }])
  assert.equal(plan[0].accion, ALTA.ya_esta)
  assert.equal(plan[0].existente, 'A.C.SAT S.R.L.')
})

test('sin CUIT se crea marcado, nunca se descarta el proveedor', () => {
  const plan = planDeAltas([{ nombre: 'Corralon Progreso', cuit: null, fuente: 'papel' }], [])
  assert.equal(plan[0].accion, ALTA.sin_cuit)
})
