import test from 'node:test'
import assert from 'node:assert/strict'
import { verificarCuadro, formulaLineaMes, bloqueControl, refProyeccionTabla } from './cash-flow-lineas.mjs'
import { fragmentosViejos } from './cheques-cobertura.mjs'
import { TABLAS as N_TABLAS, pedidos } from './rangos-nombrados.mjs'

// ── La proyección de una tabla va por RANGO CON NOMBRE, no por número de fila ──
// Es el defecto que dejó $157.772.297 (Jornales) y $15.017.169 (Estructura) afuera del cuadro sin un
// solo error: la fórmula tenía la fila escrita adentro y la pestaña de origen se rediseñó abajo.
test('Estructura proyecta por nombre cuando el rango existe', () => {
  const { lineas } = verificarCuadro()
  const est = lineas.find((l) => l.rubro === 'Estructura' && l.excluirSub)
  const f = formulaLineaMes(est, 'I', 'I', 3, {}, [N_TABLAS.Estructura])
  assert.ok(f.includes(`INDEX(${N_TABLAS.Estructura};1;MONTH(`), 'usa el rango con nombre y elige el mes por MONTH')
  assert.ok(!/Estructura!I\$\d+/.test(f), 'NO quedó ningún número de fila escrito a mano')
})

test('sin el nombre, cae al respaldo por rótulo — nunca a una fila inventada', () => {
  const { lineas } = verificarCuadro()
  const est = lineas.find((l) => l.rubro === 'Estructura' && l.excluirSub)
  const f = formulaLineaMes(est, 'I', 'I', 3, { Estructura: 15 }, [])
  assert.ok(f.includes('Estructura!I$15'), 'respaldo por la fila hallada por rótulo')
})

test('refProyeccionTabla exige el rótulo cuando no hay nombre ni fila', () => {
  assert.throws(() => refProyeccionTabla(
    { pestaña: 'Estructura', rotulo: 'TOTAL ESTRUCTURA', nombre: N_TABLAS.Estructura }, 'I$3', 'I', {}, []))
})

// ── El control de jornales que hubiera gritado desde el primer día ──
test('el bloque de control compara el cuadro contra los rangos con nombre de jornales', () => {
  const filas = bloqueControl(10, 25, 'B', 100, { celdaJornales: 'N12' })
  const etiquetas = filas.map((f) => f.etiqueta)
  assert.ok(etiquetas.some((e) => e.includes('lo que muestra este cuadro')))
  const planilla = filas.find((f) => f.formula.includes('JORNALES_REAL_TOTAL'))
  assert.ok(planilla, 'suma JORNALES_REAL_TOTAL + JORNALES_PROY_TOTAL')
  assert.ok(planilla.formula.includes('JORNALES_PROY_TOTAL'))
  const dif = filas.find((f) => f.etiqueta.startsWith('⇒ Diferencia de jornales'))
  assert.ok(dif, 'hay una fila de diferencia que tiene que dar $0')
})

test('sin celda de jornales, el control no agrega el bloque', () => {
  const filas = bloqueControl(10, 25, 'B', 100, {})
  assert.ok(!filas.some((f) => f.etiqueta.startsWith('⇒ Diferencia de jornales')))
})

// ── Un rango con nombre puede abarcar una fila entera de doce meses ──
test('pedidos arma un rango de fila entera con colFin', () => {
  const [req] = pedidos(42, [{ name: N_TABLAS.Estructura, fila: 15, col: 2, colFin: 13 }], [])
  const r = req.addNamedRange.namedRange.range
  assert.equal(r.startRowIndex, 14)
  assert.equal(r.endRowIndex, 15)
  assert.equal(r.startColumnIndex, 1)
  assert.equal(r.endColumnIndex, 13)
})

// ── El residuo del bloque de cobertura que quedó ARRIBA se limpia sin tocar lo de una persona ──
test('fragmentosViejos borra el residuo de arriba y respeta una nota humana', () => {
  const generado = [
    ['CHEQUES — total emitido', '=A', '=B'],
    ['', 'Cantidad', 'Monto'],
    ['TOTAL A CUBRIR', '=A', '=B'],
  ]
  const actual = [
    [], [],
    ['CHEQUES — total emitido', 95, 75593200],   // 3 residuo (números pegados)
    ['', 'Cantidad', 'Monto'],                    // 4 sub-header residuo
    ['julio 26', 8, 2200000],                     // 5 mes residuo
    ['TOTAL A CUBRIR', 27, 13076832],             // 6 residuo
    [' me acordé de pagarle a Pérez', '', ''],    // 7 NOTA humana
    [], [],
    ['CHEQUES — total emitido', '=x', '=y'],      // 10 vivo
    ['', 'Cantidad', 'Monto'],                    // 11 vivo
    ['TOTAL A CUBRIR', '=x', '=y'],               // 12 vivo
  ]
  const borrar = fragmentosViejos(actual, generado, { desde: 10, hasta: 12 })
  assert.deepEqual(borrar, [3, 4, 5, 6], 'borra el residuo entero, incluidos sub-header y mes')
  assert.ok(!borrar.includes(7), 'NUNCA toca la nota de la persona')
  assert.ok(!borrar.some((f) => f >= 10), 'no toca el bloque vivo')
})
