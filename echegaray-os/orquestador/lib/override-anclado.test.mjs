import test from 'node:test'
import assert from 'node:assert/strict'
import { anclaDeFila, colDeEncabezado, overridesDesdeDiff, aplicarOverrides } from './override-anclado.mjs'

test('anclaDeFila: el primer valor no vacío es el rótulo', () => {
  assert.equal(anclaDeFila(['', '  ', 'Estructura', 'x']), 'Estructura')
  assert.equal(anclaDeFila(['IVA', 'a'], 0), 'IVA')          // columna fija
  assert.equal(anclaDeFila(['', '']), '')                    // fila vacía → sin ancla
})

test('colDeEncabezado: encuentra por nombre, insensible a mayúsculas/espacios', () => {
  const h = ['Rubro', ' Enero ', 'Marzo']
  assert.equal(colDeEncabezado(h, 'marzo'), 2)
  assert.equal(colDeEncabezado(h, 'Enero'), 1)
  assert.equal(colDeEncabezado(h, 'Diciembre'), -1)
})

test('overridesDesdeDiff: cada celda cambiada queda anclada a su rótulo y encabezado', () => {
  const headers = ['Rubro', 'Enero', 'Febrero']
  const previo = [headers, ['Estructura', '100', '200'], ['Materiales', '50', '60']]
  const actual = [headers, ['Estructura', '999', '200'], ['Materiales', '50', '60']] // editó Enero de Estructura
  const ovs = overridesDesdeDiff(previo, actual)
  assert.equal(ovs.length, 1)
  assert.deepEqual(ovs[0], { ancla: 'Estructura', col: 1, encabezado: 'Enero', valor: '999' })
})

// ── EL TEST QUE IMPORTA: tu edición SOBREVIVE aunque el generador mueva la fila ──────────────────
// Editaste "Enero de Estructura" = 999. El generador regenera y ahora Estructura está DOS filas más
// abajo (agregó rubros arriba). Por posición (A1) el 999 caería en la fila equivocada — el bug de las
// 7 pérdidas. Anclado por rótulo, el 999 sigue a "Estructura" donde sea que esté.
test('aplicarOverrides: la edición sigue a su fila aunque el generador la corra de lugar', () => {
  const headers = ['Rubro', 'Enero', 'Febrero']
  const previo = [headers, ['Estructura', '100', '200']]
  const actual = [headers, ['Estructura', '999', '200']]
  const overrides = overridesDesdeDiff(previo, actual)

  // Grilla FRESCA del generador: metió dos rubros ARRIBA de Estructura, con datos nuevos (frescos).
  const generado = [
    headers,
    ['Obra Nueva', '11', '22'],
    ['Impuestos', '33', '44'],
    ['Estructura', '150', '250'],   // el generador recalculó 150 (fresco), pero vos habías puesto 999
    ['Materiales', '70', '80'],
  ]
  const { grid, aplicados, huerfanos, ambiguos } = aplicarOverrides(generado, overrides)
  assert.equal(huerfanos.length, 0)
  assert.equal(ambiguos.length, 0)
  assert.equal(aplicados.length, 1)
  // Estructura ahora está en la fila 3; tu 999 aterrizó AHÍ, no en la fila 1.
  assert.equal(grid[3][1], '999')      // tu edición, preservada en la fila correcta
  assert.equal(grid[1][1], '11')       // el dato fresco de arriba, intacto
  assert.equal(grid[4][2], '80')       // el resto, fresco
})

test('aplicarOverrides: columna por ENCABEZADO aunque el generador reordene las columnas', () => {
  const overrides = [{ ancla: 'Estructura', col: 1, encabezado: 'Marzo', valor: '999' }]
  // El generador ahora pone Marzo en otra posición (col 2 en vez de 1).
  const generado = [['Rubro', 'Enero', 'Marzo'], ['Estructura', '10', '20']]
  const { grid, aplicados } = aplicarOverrides(generado, overrides)
  assert.equal(aplicados.length, 1)
  assert.equal(grid[1][2], '999')   // fue a Marzo (col 2), no a la col 1 vieja
  assert.equal(grid[1][1], '10')    // Enero intacto
})

test('aplicarOverrides: HUÉRFANO — si el rótulo ya no existe, NO se aplica a ciegas (se reporta)', () => {
  const overrides = [{ ancla: 'RubroViejo', col: 1, encabezado: 'Enero', valor: '999' }]
  const generado = [['Rubro', 'Enero'], ['Estructura', '10']]
  const { grid, aplicados, huerfanos } = aplicarOverrides(generado, overrides)
  assert.equal(aplicados.length, 0)
  assert.equal(huerfanos.length, 1)
  assert.equal(grid[1][1], '10')    // nada se corrompió
})

test('aplicarOverrides: AMBIGUO — rótulo duplicado → no se adivina, se reporta', () => {
  const overrides = [{ ancla: 'Estructura', col: 1, encabezado: 'Enero', valor: '999' }]
  const generado = [['Rubro', 'Enero'], ['Estructura', '10'], ['Estructura', '20']]
  const { grid, aplicados, ambiguos } = aplicarOverrides(generado, overrides)
  assert.equal(aplicados.length, 0)
  assert.equal(ambiguos.length, 1)
  assert.equal(grid[1][1], '10')    // ninguna de las dos se tocó
  assert.equal(grid[2][1], '20')
})

test('aplicarOverrides: no muta la grilla de entrada', () => {
  const generado = [['Rubro', 'Enero'], ['Estructura', '10']]
  const copia = JSON.parse(JSON.stringify(generado))
  aplicarOverrides(generado, [{ ancla: 'Estructura', col: 1, encabezado: 'Enero', valor: '999' }])
  assert.deepEqual(generado, copia)  // la entrada quedó igual
})

// El ciclo completo: OS deja una grilla → vos editás → el OS regenera fresco moviendo filas → tu edición
// sobrevive. Es el escenario real de "documento vivo que respeta lo que hacés", extremo a extremo.
test('ciclo vivo: editás, el OS regenera fresco moviendo filas, tu edición sigue viva', () => {
  const headers = ['Rubro', 'Monto']
  const osDejo = [headers, ['A', '1'], ['B', '2'], ['C', '3']]
  const vosEditaste = [headers, ['A', '1'], ['B', '999'], ['C', '3']]  // corregiste B
  const overrides = overridesDesdeDiff(osDejo, vosEditaste)

  // Nueva corrida: datos frescos y B ahora está última.
  const generadoFresco = [headers, ['A', '10'], ['C', '30'], ['B', '20']]
  const { grid } = aplicarOverrides(generadoFresco, overrides)
  const filaB = grid.find((f) => f[0] === 'B')
  assert.equal(filaB[1], '999')                 // tu corrección, viva
  assert.equal(grid.find((f) => f[0] === 'A')[1], '10')  // A, fresco
  assert.equal(grid.find((f) => f[0] === 'C')[1], '30')  // C, fresco
})
