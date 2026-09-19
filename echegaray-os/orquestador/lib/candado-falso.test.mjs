import test from 'node:test'
import assert from 'node:assert/strict'
import { diferencias, veredicto, resumen } from './candado-falso.mjs'

test('sin snapshot el veredicto es DESCONOCIDO, nunca "no lo editó"', () => {
  // La regla que protege al dueño: la ausencia de evidencia no es evidencia de ausencia. Si esto
  // devolviera "falso", el auditor propondría destrabar pestañas sobre las que no sabe nada.
  const v = veredicto({ diffs: [], huboSnapshot: false })
  assert.equal(v.veredicto, 'desconocido')
  assert.match(v.motivo, /no puedo afirmar/)
})

test('una fórmula distinta es de otro generador, no de una persona', () => {
  // EL CASO REAL (01/08). "Cash Flow Mensual" candada por 45 celdas así: el bloque de cobertura le
  // ensanchó el rango a sus propias fórmulas y el control lo leyó como una edición del dueño.
  const os = [['CHEQUES', "=SUMPRODUCT(--('Cheques Emitidos'!$M$2:$M$399>0))"]]
  const vivo = [['CHEQUES', "=SUMPRODUCT(--('Cheques Emitidos'!$M$2:$M$400>0))"]]
  const d = diferencias(vivo, os)
  assert.equal(d.length, 1)
  assert.equal(d[0].pegada, false, 'una fórmula nunca es "pegada a mano"')
  assert.equal(veredicto({ diffs: d, huboSnapshot: true }).veredicto, 'falso')
})

test('un texto nuevo que NO es fórmula es una mano humana: el candado se sostiene', () => {
  const os = [['Cobranzas', '=SUM(A1:A9)']]
  const vivo = [['Cobranzas', '=SUM(A1:A9)', 'ojo: este cobro entra el 15'], []]
  const d = diferencias(vivo, os)
  const v = veredicto({ diffs: d, huboSnapshot: true })
  assert.equal(v.veredicto, 'real')
  assert.equal(v.pegadas, 1)
})

test('un rótulo que el OS ya escribía en otra parte NO cuenta como edición del dueño', () => {
  // Un generador que MUEVE su propio rótulo de fila deja una celda de texto nueva. Sin esta regla,
  // cada reordenamiento del OS se leería como una edición humana y candaría la pestaña.
  const os = [['TOTAL A CUBRIR', '=SUM(B1:B9)'], []]
  const vivo = [['TOTAL A CUBRIR', '=SUM(B1:B9)'], ['TOTAL A CUBRIR']]
  const d = diferencias(vivo, os)
  assert.equal(veredicto({ diffs: d, huboSnapshot: true, rotulosDelOS: new Set(['TOTAL A CUBRIR']) }).veredicto, 'falso')
  // …pero sin conocer el rótulo, falla hacia el lado cerrado y lo trata como del dueño.
  assert.equal(veredicto({ diffs: d, huboSnapshot: true }).veredicto, 'real')
})

test('una pestaña idéntica a la que dejó el OS no tiene por qué estar candada', () => {
  const g = [['a', '=1'], ['b', '=2']]
  assert.equal(veredicto({ diffs: diferencias(g, g), huboSnapshot: true }).veredicto, 'sin-cambios')
})

test('borrar una celda que el OS había escrito NO se marca como pegada, pero se ve', () => {
  // Un borrado del dueño es una edición real y el candado tiene que sostenerse por otro lado; acá se
  // verifica que al menos la diferencia se REPORTA y no desaparece del listado.
  const d = diferencias([['a', '']], [['a', '=1']])
  assert.equal(d.length, 1)
  assert.equal(d[0].pegada, false)
  assert.equal(d[0].os, '=1')
  assert.equal(d[0].vivo, '')
})

test('el resumen agrupa por fila y marca cuál tiene una celda pegada', () => {
  const d = diferencias([['a', '=1', 'nota mía'], ['b', '=9']], [['a', '=1'], ['b', '=2']])
  const r = resumen(d)
  assert.equal(r.length, 2)
  assert.ok(r[0].pegada, 'la fila con el texto a mano se marca')
  assert.equal(r[1].pegada, false)
})

test('las filas de más en el vivo se comparan igual (no se cortan por longitud)', () => {
  const d = diferencias([['a'], ['b'], ['c']], [['a']])
  assert.equal(d.length, 2, 'las dos filas nuevas tienen que aparecer')
})
