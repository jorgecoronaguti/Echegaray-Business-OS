import { test } from 'node:test'
import assert from 'node:assert/strict'
import { reubicar, partir, filasHuerfanas, ref } from './partir-pestana.mjs'

const enMismaPestana = (fila) => ({ titulo: null, fila: fila - 9 })

test('una referencia local se corre a su nueva fila', () => {
  assert.equal(reubicar('=SUM(B10:B20)', enMismaPestana), '=SUM(B1:B11)')
  assert.equal(reubicar('=$D$61-$D$59', enMismaPestana), '=$D$52-$D$50')
})

test('lo que ya dice de qué pestaña es, no se toca', () => {
  // Si esto se reubicara, el SUMIFS pasaría a mirar filas de Compras que no existen.
  const f = '=SUMIFS(Compras!$O$4:$O;Compras!$X$4:$X;"Pendiente")'
  assert.equal(reubicar(f, enMismaPestana), f)
  // El "3" del INDEX es un número, no una celda: se queda quieto. Sólo se mueve lo que tiene columna.
  const g = "=INDEX('Cheques Emitidos'!$K$2:$K$400;3)"
  assert.equal(reubicar(g, enMismaPestana), g)
})

test('un texto que parece una referencia sigue siendo un texto', () => {
  // "F931" es columna F fila 931 para cualquier regex, y es el rótulo de una obra. Confundirlos
  // cambia el criterio de un SUMIFS sin dar error.
  const f = '=SUMIFS(Compras!$O$4:$O;Compras!$J$4:$J;"F931")'
  assert.equal(reubicar(f, enMismaPestana), f)
  assert.match(reubicar('=IF($B10="";"";"A1 no es una celda acá")', enMismaPestana), /"A1 no es una celda acá"/)
})

test('una referencia a un bloque que se fue a otra pestaña queda calificada', () => {
  const r = reubicar('=$D$61-$D$10', (fila) => (fila === 61
    ? { titulo: 'Materiales', fila: 5 }
    : { titulo: null, fila: fila - 9 }))
  assert.equal(r, "=Materiales!$D$5-$D$1")
})

test('el nombre con espacios va entre comillas simples', () => {
  assert.equal(ref('Materiales'), 'Materiales')
  assert.equal(ref('Proveedores — Deuda'), "'Proveedores — Deuda'")
})

test('partir reparte las filas y arregla las referencias cruzadas', () => {
  const filas = [
    ['Bloque 1'],                    // 1
    ['Total', '=SUM(A5:A6)'],        // 2  → apunta al tramo 2
    [],                              // 3
    ['Bloque 2'],                    // 4
    ['x', 10],                       // 5
    ['y', '=B5*2'],                  // 6  → local dentro del tramo 2
  ]
  const [uno, dos] = partir(filas, [
    { titulo: 'Uno', desde: 1, hasta: 3 },
    { titulo: 'Dos', desde: 4, hasta: 6 },
  ])
  assert.equal(uno.filas.length, 3)
  assert.equal(uno.filas[1][1], '=SUM(Dos!A2:Dos!A3)')
  assert.equal(dos.filas[2][1], '=B2*2')
})

test('ninguna fila con contenido puede quedarse afuera del reparto', () => {
  // La regla del dueño después del rollback: no se le saca información a una pestaña.
  const filas = [['a'], ['b'], ['c']]
  assert.deepEqual(filasHuerfanas(filas, [{ titulo: 'X', desde: 1, hasta: 3 }]), [])
  const h = filasHuerfanas(filas, [{ titulo: 'X', desde: 1, hasta: 2 }])
  assert.equal(h.length, 1)
  assert.equal(h[0].fila, 3)
})
