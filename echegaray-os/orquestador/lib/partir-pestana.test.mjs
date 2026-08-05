import { test } from 'node:test'
import assert from 'node:assert/strict'
import { reubicar, partir, mapaDeFilas, filasHuerfanas, referenciasFuera, ref } from './partir-pestana.mjs'

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

test('cada tramo puede aterrizar en SU fila: el que va debajo de una dinámica arranca en la frontera', () => {
  // "Proveedores" abajo de dos tablas dinámicas que ocupan hasta la fila 40: su tramo aterriza en la
  // 41, y sus fórmulas internas tienen que apuntar a la 41, no a la 4.
  const filas = [
    ['3 · NOTAS DE CRÉDITO'],        // 1
    ['TRIELEC', -50000],             // 2
    ['TOTAL', '=SUM(B2:B2)'],        // 3
    ['1 · POR FAMILIA'],             // 4
    ['Áridos', '=B3*2'],             // 5  → referencia a un tramo que se fue a otra pestaña
  ]
  const [prov, mat] = partir(filas, [
    { titulo: 'Proveedores', desde: 1, hasta: 3, desdeFila: 41 },
    { titulo: 'Materiales', desde: 4, hasta: 5 },
  ], { desdeFila: 4 })
  assert.equal(prov.filas[2][1], '=SUM(B42:B42)', 'la fórmula sigue a su bloque hasta la frontera')
  assert.equal(mat.filas[1][1], '=Proveedores!B43*2', 'y desde la otra pestaña se la referencia bien')
})

test('una fórmula que apunta a una fila fuera del reparto se DENUNCIA: nadie la puede reubicar', () => {
  // El caso real: el hero y las secciones 1 y 2 salieron del reparto (son tablas dinámicas). Si un
  // bloque de abajo las mirara, `partir` dejaría la referencia como está y apuntaría a una fila de la
  // dinámica devolviendo un número — el equivocado, y sin un solo error.
  const filas = [
    ['POSICIÓN', 13715178],          // 1  ← fuera de todo tramo
    ['3 · NOTAS DE CRÉDITO'],        // 2
    ['TOTAL', '=B3-B1'],             // 3  ← B1 apunta afuera
  ]
  const tramos = [{ titulo: 'Proveedores', desde: 2, hasta: 3, desdeFila: 41 }]
  const fuera = referenciasFuera(filas, tramos)
  assert.equal(fuera.length, 1)
  assert.equal(fuera[0].apunta, 1)
  assert.equal(fuera[0].ref, 'B1')
  // Y sin referencias colgadas, la lista es vacía. Un literal con forma de referencia ("F931") y una
  // referencia YA calificada (Compras!$H$4) no cuentan: ninguna de las dos se reubica.
  const sanas = [
    ['3 · NOTAS DE CRÉDITO'],
    ['TOTAL', '=SUM(B1:B1)+SUMIF(Compras!$H$4:$H;"F931";Compras!$O$4:$O)'],
  ]
  assert.deepEqual(referenciasFuera(sanas, [{ titulo: 'X', desde: 1, hasta: 2 }]), [])
})

test('ninguna fila con contenido puede quedarse afuera del reparto', () => {
  // La regla del dueño después del rollback: no se le saca información a una pestaña.
  const filas = [['a'], ['b'], ['c']]
  assert.deepEqual(filasHuerfanas(filas, [{ titulo: 'X', desde: 1, hasta: 3 }]), [])
  const h = filasHuerfanas(filas, [{ titulo: 'X', desde: 1, hasta: 2 }])
  assert.equal(h.length, 1)
  assert.equal(h[0].fila, 3)
})

// ═══ LOS MARCADORES Y LAS FÓRMULAS TIENEN QUE CAER EN LA MISMA FILA (05/08) ═══
//
// Es la condición que hace que un rango con nombre signifique algo: el nombre se publica sobre la
// fila que dice el MARCADOR (`fArcaN`), y el dato lo escribe `partir` sobre la fila que dice la
// REUBICACIÓN. Si las dos cuentas no son la misma cuenta, el nombre apunta a una fila y el número
// está en otra — y la pestaña que lo lee muestra lo que haya ahí, sin dar error.

test('el tramo que NO declara `desdeFila` usa el de las opciones — no `undefined`', () => {
  // "Materiales" arranca en la fila 4 como cualquier pestaña propia del generador, y ese 4 vive en
  // las opciones. Sumarle `undefined` da NaN, NaN se serializa como null en el JSON de la API, y un
  // `startRowIndex` ausente significa "desde el principio de la hoja": el formato de un bloque
  // aplicado a la pestaña entera, sin un solo error.
  const tramos = [
    { titulo: 'Proveedores', desde: 10, hasta: 19, desdeFila: 176 },
    { titulo: 'Materiales', desde: 20, hasta: 29 },
  ]
  const mapa = mapaDeFilas(tramos, { desdeFila: 4 })
  for (const [vieja, d] of mapa) {
    assert.ok(Number.isFinite(d.fila), `la fila ${vieja} (${d.titulo}) tradujo a ${d.fila}`)
  }
  assert.equal(mapa.get(20).fila, 4, 'la primera fila de Materiales aterriza en la 4')
  assert.equal(mapa.get(29).fila, 13)
  assert.equal(mapa.get(10).fila, 176, 'y la de Proveedores en la frontera')
})

test('la fila del marcador es la MISMA fila donde `partir` deja el dato', () => {
  // Cada fila lleva su propio número escrito, así que se puede comprobar dónde terminó cada una.
  const filas = Array.from({ length: 30 }, (_, i) => [`fila ${i + 1}`])
  const tramos = [
    { titulo: 'Proveedores', desde: 10, hasta: 19, desdeFila: 176 },
    { titulo: 'Materiales', desde: 20, hasta: 29 },
  ]
  const partes = partir(filas, tramos, { desdeFila: 4 })
  const mapa = mapaDeFilas(tramos, { desdeFila: 4 })
  for (const [i, t] of tramos.entries()) {
    const arranque = Number.isFinite(t.desdeFila) ? t.desdeFila : 4
    for (let f = t.desde; f <= t.hasta; f++) {
      const filaReal = mapa.get(f).fila
      assert.equal(partes[i].filas[filaReal - arranque][0], `fila ${f}`,
        `el marcador de la fila vieja ${f} dice ${filaReal} y el dato quedó en otra`)
    }
  }
})
