import test from 'node:test'
import assert from 'node:assert/strict'
import { CONTROLADAS, formulaBancoPorNaturaleza, formulaDiferencia, lectura } from './banco-vs-cuadro.mjs'
import { CUADRO, verificarCuadro, expresionReal } from './cash-flow-lineas.mjs'

test('el control lee la RÉPLICA DEL EXTRACTO, que es la única fuente sobre lo que salió', () => {
  const f = formulaBancoPorNaturaleza('AFIP', '$C$3', '$D$3')
  assert.match(f, /'_BANCO_RAW'!\$F\$4:\$F="AFIP"/, 'filtra por la naturaleza que clasifica el propio extracto')
  assert.match(f, /'_BANCO_RAW'!\$E\$4:\$E="sale"/, 'sólo egresos')
  assert.ok(!f.includes('Compras!'), `un control que lee Compras se compara contra lo mismo que controla: ${f}`)
})

test('los rangos son ABIERTOS: el extracto crece todos los días', () => {
  const f = formulaBancoPorNaturaleza('AFIP', '$C$3', '$D$3')
  for (const c of ['$A$4:$A', '$C$4:$C', '$E$4:$E', '$F$4:$F']) assert.ok(f.includes(`'_BANCO_RAW'!${c}`), `${c} tiene que ser abierto: ${f}`)
  assert.ok(!/\$[A-F]\$4:\$[A-F]\$\d/.test(f), `ningún rango con techo: ${f}`)
})

test('la ventana es semiabierta — el último día de un mes no se cuenta dos veces', () => {
  const f = formulaBancoPorNaturaleza('AFIP', 'X', 'Y')
  assert.match(f, />=X/)
  assert.match(f, /<Y/)
  assert.ok(!f.includes('<=Y'), 'con <= el corte se solapa con el mes siguiente')
})

const lineasDeBanco = () => CUADRO.flatMap((a) => a.grupos.flatMap((x) => x.lineas)).filter((l) => l.bancoNat)

// EL CANARIO SE CUMPLIÓ Y SE RETIRA (03/08). Decía: "cuando alguien traiga `bancoNat` al cuadro, este
// test se pone rojo, y lo que hay que hacer es borrarlo y restituir los dos asserts". Eso pasó: el
// bloque de banco entró a `cash-flow-lineas.mjs` junto con el resto de los generadores atrasados. Los
// dos asserts que custodiaba ya no recorren una lista vacía — abajo se comprueba que recorren 3.

test('las líneas de banco existen: los dos controles de abajo ejercitan código de verdad', () => {
  // Sin esto, el día que alguien saque `bancoNat` del cuadro los dos tests de abajo volverían a pasar
  // recorriendo una lista vacía. Un verde que no ejercita nada es exactamente lo que el canario evitaba.
  assert.ok(lineasDeBanco().length > 0, 'no hay ninguna línea bancoNat: los controles de abajo no prueban nada')
})

test('una línea de banco NUNCA consume un rubro de Compras', () => {
  // Si tuviera `rubro`, la partición de Compras la contaría y el control del pie dejaría de cerrar.
  for (const l of lineasDeBanco()) {
    assert.equal(l.rubro, undefined, `"${l.nombre}" no puede tener rubro: rompería la partición de Compras`)
  }
  assert.doesNotThrow(() => verificarCuadro())
})

test('las líneas de banco viven en un grupo que NO suma al flujo', () => {
  // "No suma" no es una promesa del nombre: es `signo: 0` en el grupo. Si alguien mueve una de estas
  // líneas a un grupo con signo −1, el gasto se contaría dos veces —una por el banco y otra por
  // Compras, el día que se cargue la factura— y el control del pie cerraría igual. Ver cash-flow-lineas.
  for (const a of CUADRO) {
    for (const g of a.grupos) {
      const deBanco = g.lineas.filter((l) => l.bancoNat)
      if (deBanco.length) assert.equal(g.signo, 0, `"${g.nombre}" tiene líneas de banco y signo ${g.signo}: duplicaría el gasto`)
    }
  }
})

test('cada naturaleza controlada declara dónde tendría que estar cargada', () => {
  for (const c of CONTROLADAS) {
    assert.ok(c.donde && c.donde.length > 8, `${c.nat} no dice dónde va: sin eso el hallazgo no es accionable`)
  }
})

test('la lectura distingue "falta cargarlo" de "no hay ni línea" de "está bien"', () => {
  assert.match(lectura(6368462, 0, true), /faltan \$6\.368\.462/)
  assert.match(lectura(4077785, 0, false), /NO tiene ninguna línea/)
  assert.match(lectura(1282811, 1282811, true), /al peso/)
  assert.match(lectura(0, 0, true), /sin movimientos/)
  // El caso inverso, que también hay que poder ver: el cuadro proyecta MÁS de lo que el banco pagó.
  assert.match(lectura(1066109, 2431573, true), /de MÁS que el banco/)
})

test('sin línea contra la que comparar, la diferencia ES el monto del banco', () => {
  assert.match(formulaDiferencia('B10', null), /=IF\(N\(B10\)=0;"";N\(B10\)\)/)
  assert.match(formulaDiferencia('B10', 'B32'), /N\(B10\)-N\(B32\)/)
})

test('la fórmula del control es es-AR y cierra paréntesis', () => {
  const f = formulaBancoPorNaturaleza('Débitos automáticos (seguros)', '$C$3', '$D$3')
  assert.equal([...f].reduce((n, c) => n + (c === '(' ? 1 : c === ')' ? -1 : 0), 0), 0,
    'la naturaleza tiene paréntesis en el nombre: van adentro de comillas y no desbalancean')
  assert.ok(!f.replace(/"[^"]*"/g, '""').includes(','), `separador con coma: ${f}`)
})

test('cada naturaleza controlada sabe dónde tendría que estar cargada', () => {
  // Reemplaza a "la línea de control produce fórmula": aquélla llamaba expresionReal() sobre la línea
  // del cuadro con bancoNat === 'AFIP', que en main no existe — le pasaba undefined y explotaba. Lo que
  // SÍ se puede probar sin la pestaña es el contrato de esta lib: una naturaleza sin `donde` deja al
  // dueño con un número y sin ninguna acción posible.
  for (const c of CONTROLADAS) {
    assert.ok(c.donde, `${c.nat} no dice dónde cargarlo`)
    assert.ok(Object.hasOwn(c, 'lineaDelCuadro'), `${c.nat} tiene que declarar su línea, aunque sea null`)
    assert.ok(formulaBancoPorNaturaleza(c.nat, '$C$3', '$D$3').includes(`="${c.nat}"`))
  }
  assert.equal(typeof expresionReal, 'function', 'la lib del cuadro sigue exportando expresionReal')
})
