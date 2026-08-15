// LO QUE ESTOS TESTS IMPIDEN: que la pasada de reparación arregle un glifo y rompa una fórmula.
//
// El script escribe sobre una pestaña de CARGA, donde el dueño tipea. Los tres modos de falla que se
// prueban acá son los que este repo ya pagó: pisar el derrame de una ARRAYFORMULA, inventarle un
// reemplazo a un glifo que nadie mapeó, y escribir de nuevo lo que ya está bien.

import test from 'node:test'
import assert from 'node:assert/strict'
import { planDeTraduccion, aRangos, porColumna, letra, loQueNoEsTraduccion } from './cobranzas-glifos.mjs'
import { ALERTA } from '../lib/glifos.mjs'

/** Dos filas reales de `Cobranzas!V`, tal como llegan con `render: FORMULA`. */
const formulaV = (n) => `=IF(J${n}="";"";IF(O${n}="Cobrado";"✅ Cobrado";IF(O${n}="Vencido";"🔴 Vencido";`
  + `IF(O${n}="Proyectado";"🔵 Proyectado";IF(Q${n}<TODAY();"🔴 Vencido";`
  + `IF(Q${n}-TODAY()<=7;"🟠 Por vencer";"🟢 Vigente"))))))`

test('EL DEFECTO: las fórmulas de V entran al plan, y sale la fórmula entera traducida', () => {
  const { cambios, sinMapear, derrames } = planDeTraduccion([[], [], [], [], [formulaV(5)], [formulaV(6)]])
  assert.equal(cambios.length, 2)
  assert.deepEqual(cambios.map((c) => c.fila), [5, 6])
  assert.deepEqual(cambios.map((c) => letra(c.col)), ['A', 'A'])
  assert.ok(cambios[0].despues.startsWith('=IF(J5="";"";'), 'sigue siendo la fórmula del dueño')
  assert.ok(cambios[0].despues.includes(`"${ALERTA} Vencido"`))
  assert.ok(cambios[0].despues.includes('"⇒ Por vencer"'))
  assert.equal(sinMapear.length + derrames.length, 0)
})

test('IDEMPOTENTE: sobre la pestaña ya traducida no queda una sola escritura', () => {
  const traducida = planDeTraduccion([[formulaV(5)]]).cambios[0].despues
  assert.deepEqual(planDeTraduccion([[traducida]]).cambios, [], 'la segunda pasada no escribe nada')
})

test('NO PISA EL DERRAME: un literal debajo de una ARRAYFORMULA de su columna no se toca', () => {
  // El defecto: con `render: FORMULA` el derrame llega como TEXTO, indistinguible de un literal. Si
  // se escribe, la celda pasa a ser texto pegado y la ARRAYFORMULA que la producía muere.
  const grilla = [['=ARRAYFORMULA(IF(A2:A="";"";"🟢 Vigente"))'], ['🟢 Vigente'], ['🟢 Vigente']]
  const { cambios, derrames } = planDeTraduccion(grilla)
  assert.deepEqual(cambios.map((c) => c.fila), [1], 'sólo el ancla: el derrame se recalcula solo')
  assert.equal(cambios[0].despues, '=ARRAYFORMULA(IF(A2:A="";"";"· Vigente"))')
  assert.deepEqual(derrames.map((d) => d.fila), [2, 3], 'y los de abajo se nombran, no desaparecen del informe')
})

test('un glifo sin traducción declarada NO se escribe: se nombra', () => {
  const { cambios, sinMapear } = planDeTraduccion([['🟡 En revisión']])
  assert.deepEqual(cambios, [])
  assert.deepEqual(sinMapear[0].glifos, ['🟡'])
})

test('una celda con un glifo mapeado Y otro que no, tampoco se escribe a medias', () => {
  // Escribirla dejaría la celda "arreglada" en el informe y todavía rota en el PDF: el peor
  // resultado posible, porque apaga el control que la venía marcando.
  const { cambios, sinMapear } = planDeTraduccion([['✅ Cobrado 🟡 revisar']])
  assert.deepEqual(cambios, [])
  assert.deepEqual(sinMapear[0].glifos, ['🟡'])
})

test('el rótulo de texto plano de Z4 también entra: es la misma celda y el mismo PDF', () => {
  const { cambios } = planDeTraduccion([[], [], [], ['Retención 2,5%/3,5% del neto ⚠ rótulo original perdido']])
  assert.equal(cambios.length, 1)
  assert.equal(cambios[0].fila, 4)
  assert.equal(cambios[0].despues, `Retención 2,5%/3,5% del neto ${ALERTA} rótulo original perdido`)
})

test('los rangos salen de a UNA celda: un rango ancho escribiría celdas que nadie planificó', () => {
  const grilla = [[], [], [], [], [null, null, null, null, null, null, null, null, null, null,
    null, null, null, null, null, null, null, null, null, null, null, formulaV(5)]]
  const { cambios } = planDeTraduccion(grilla)
  assert.deepEqual(aRangos(cambios, 'Cobranzas').map((r) => r.range), ["'Cobranzas'!V5"])
  assert.deepEqual(porColumna(cambios), [['V', 1]])
})

test('una celda vacía o ya limpia no genera escritura', () => {
  assert.deepEqual(planDeTraduccion([['', null, 'Cobrado', '=SUM(A1:A2)']]).cambios, [])
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// LA INVARIANTE QUE SUSTITUYE A LA REGLA 0: no se escribe una sola celda de contenido propio.
// ══════════════════════════════════════════════════════════════════════════════════════════════════

test('EL DEFECTO: un plan con contenido propio no llega a la API', () => {
  // Es la forma que tomaría cualquier bug futuro: un `despues` que no sale de su `antes`. Ahí el
  // script dejaría de ser un traductor y pasaría a ser un generador que pisa lo que el dueño editó,
  // que es exactamente lo que la Regla 0 existe para impedir.
  const trucho = [{ fila: 5, col: 21, antes: '✅ Cobrado', despues: 'Cobrado (revisado por el OS)' }]
  assert.deepEqual(loQueNoEsTraduccion(trucho).map((c) => c.fila), [5])
})

test('una celda que venía vacía tampoco se escribe: no habría nada que traducir', () => {
  assert.equal(loQueNoEsTraduccion([{ fila: 9, col: 21, antes: '', despues: '· Vigente' }]).length, 1)
  assert.equal(loQueNoEsTraduccion([{ fila: 9, col: 21, antes: '   ', despues: '· Vigente' }]).length, 1)
})

test('el plan real pasa la invariante entero', () => {
  const { cambios } = planDeTraduccion([[formulaV(5)], [formulaV(6)], ['Retención ⚠ perdido']])
  assert.deepEqual(loQueNoEsTraduccion(cambios), [])
})
