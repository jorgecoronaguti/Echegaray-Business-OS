// Las ediciones del dueño en «Qué hacer»: se guardan, se borran, y NO se confunden con la dinámica
// reordenada ni con un generador a mitad de camino. Sobre la forma real leída el 17/09/2026.
import test from 'node:test'
import assert from 'node:assert/strict'
import { edicionesDelDueno, formaDeCelda, observarCuadro, TOPE_BORRADOS } from './proveedores-notas-hoja.mjs'

const F = (n) => `=IF($A${n}="";"";IFERROR(VLOOKUP($A${n};'_PROVEEDORES_OS'!$A:$C;3;FALSE);""))`

/** El tramo de la pestaña: título en 14, control en 16, rótulos en 17, detalle en 21. */
function hoja(proveedores, notaDe = () => null) {
  const visible = Array.from({ length: 24 }, () => [])
  const formulas = Array.from({ length: 24 }, () => [])
  visible[13] = ['1 · QUÉ SE DEBE Y CUÁNDO']
  visible[15] = ['⇒ Detalle − titular', '—']
  visible[16] = ['Proveedor', 'Se le debe', 'Primer vencimiento', 'Qué hacer']
  // El generador deja la fórmula también en el colchón (en el archivo real, D24:D25 vacías de nombre).
  for (let n = 18; n <= 22; n++) formulas[n - 1] = ['', '', '', notaDe(null, n) ?? F(n)]
  proveedores.forEach((p, i) => {
    const n = 18 + i
    visible[n - 1] = [p, '1.000', '18/09/2026']
    formulas[n - 1] = ['', '', '', notaDe(p, n) ?? F(n)]
  })
  visible[22] = ['1.1 · CADA OPERACIÓN']
  visible[23] = ['2 · QUÉ SALE CADA DÍA']
  return { visible, formulas }
}
const base = (pares) => new Map(pares.map(([k, nota]) => [k, { proveedor: k, nota }]))

test('forma de la celda: fórmula del OS, texto a mano o vacía', () => {
  assert.equal(formaDeCelda(F(18)).tipo, 'formula')
  assert.deepEqual(formaDeCelda('  pagar con cheque '), { tipo: 'texto', texto: 'pagar con cheque' })
  assert.equal(formaDeCelda('').tipo, 'vacia')
})

test('todo con fórmula: nada que guardar ni borrar', () => {
  const obs = observarCuadro(hoja(['Hormiserv', 'Robles']))
  assert.equal(obs.formulas, 5)
  const r = edicionesDelDueno({ observacion: obs, anterior: null, enBase: base([['hormiserv', 'esperar']]) })
  assert.deepEqual([r.guardar, r.borrar], [[], []])
})

test('el dueño escribió sobre la fórmula: se guarda a nombre del proveedor de ESA fila', () => {
  const obs = observarCuadro(hoja(['Hormiserv', 'Robles'], (p) => (p === 'Robles' ? 'cheque a 30' : null)))
  const r = edicionesDelDueno({ observacion: obs, anterior: null, enBase: base([]) })
  assert.deepEqual(r.guardar, [{ clave: 'robles', nota: 'cheque a 30', proveedor: 'Robles' }])
})

test('el dueño vació la celda: se borra sólo si antes esa fila era de ese proveedor y mostraba la nota', () => {
  const antes = edicionesDelDueno({ observacion: observarCuadro(hoja(['Hormiserv'])), enBase: base([]) }).siguiente
  const obs = observarCuadro(hoja(['Hormiserv', 'Robles'], (p) => (p === 'Hormiserv' ? '' : null)))
  const r = edicionesDelDueno({ observacion: obs, anterior: antes, enBase: base([['hormiserv', 'esperar']]) })
  assert.deepEqual(r.borrar, ['hormiserv'])
  // Sin lectura anterior la misma celda vacía NO es un borrado: podría ser una fila nueva sin fórmula.
  const sin = edicionesDelDueno({ observacion: obs, anterior: null, enBase: base([['hormiserv', 'esperar']]) })
  assert.deepEqual(sin.borrar, [])
})

test('LA DINÁMICA SE REORDENÓ: el texto quedó al lado de otro proveedor y NO se le guarda a él', () => {
  // Lectura 1: el dueño escribió en la fila de Robles (18). Se guarda a Robles.
  const l1 = observarCuadro(hoja(['Robles', 'Hormiserv'], (p) => (p === 'Robles' ? 'cheque a 30' : null)))
  const r1 = edicionesDelDueno({ observacion: l1, anterior: null, enBase: base([]) })
  assert.equal(r1.guardar[0].clave, 'robles')
  // Lectura 2: Hormiserv subió a la 18; el texto a mano se quedó ahí.
  const l2 = observarCuadro(hoja(['Hormiserv', 'Robles'], (p) => (p === 'Hormiserv' ? 'cheque a 30' : null)))
  const r2 = edicionesDelDueno({ observacion: l2, anterior: r1.siguiente, enBase: base([['robles', 'cheque a 30']]) })
  assert.deepEqual(r2.guardar, [])
  assert.equal(r2.desplazadas[0].de, 'robles')
  // Lectura 3: sigue ahí. La lectura anterior recuerda de quién era: tampoco se guarda.
  const r3 = edicionesDelDueno({ observacion: l2, anterior: r2.siguiente, enBase: base([['robles', 'cheque a 30']]) })
  assert.deepEqual(r3.guardar, [])
})

test('un generador a mitad de camino (ninguna fórmula) no borra todas las notas', () => {
  const antes = edicionesDelDueno({ observacion: observarCuadro(hoja(['Hormiserv', 'Robles'])), enBase: base([]) }).siguiente
  const obs = observarCuadro(hoja(['Hormiserv', 'Robles'], () => ''))  // también el colchón
  assert.equal(obs.formulas, 0)
  const r = edicionesDelDueno({ observacion: obs, anterior: antes, enBase: base([['hormiserv', 'a'], ['robles', 'b']]) })
  assert.deepEqual(r.borrar, [])
  assert.match(r.sinEvidencia, /rehaciendo/)
  assert.equal(r.siguiente, antes, 'la lectura anterior se conserva')
})

test(`más de ${TOPE_BORRADOS} borrados en una lectura se retienen`, () => {
  const nombres = ['A1', 'B2', 'C3']
  const antes = edicionesDelDueno({ observacion: observarCuadro(hoja(nombres)), enBase: base([]) }).siguiente
  // Quedan las fórmulas del colchón: no es un generador a mitad de camino.
  const obs = observarCuadro(hoja(nombres, (p) => (p ? '' : null)))
  const r = edicionesDelDueno({ observacion: obs, anterior: antes, enBase: base([['a1', 'x'], ['b2', 'y'], ['c3', 'z']]) })
  assert.deepEqual(r.borrar, [])
  assert.deepEqual(r.retenidos.sort(), ['a1', 'b2', 'c3'])
})
