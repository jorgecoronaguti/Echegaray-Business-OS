// A QUÉ OBRA VA UN DÍA QUE SE TECLEA EN UNA CELDA VACÍA. Cada test es un peso de mano de obra que
// puede terminar en la obra equivocada.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { obraParaElDia } from './obraDelDia.ts'

test('LA ASIGNACIÓN VIGENTE ESE DÍA LE GANA AL HISTORIAL', () => {
  // EL DEFECTO QUE ATRAPA: tomar «la última obra en la que estuvo» cuando alguien ya la movió de obra
  // con fecha. La asignación es una decisión firmada; el historial es una pista.
  const r = obraParaElDia(
    '2026-09-10',
    [{ obraId: 'nueva', desde: '2026-09-08', hasta: null }],
    [{ fecha: '2026-09-04', obraId: 'vieja' }],
  )
  assert.deepEqual(r, { ok: true, obraId: 'nueva', porque: 'asignacion' })
})

test('UN TRAMO QUE YA CERRÓ NO CUBRE EL DÍA', () => {
  const r = obraParaElDia(
    '2026-09-10',
    [{ obraId: 'vieja', desde: '2026-08-01', hasta: '2026-09-05' }],
    [{ fecha: '2026-09-09', obraId: 'actual' }],
  )
  assert.deepEqual(r, { ok: true, obraId: 'actual', porque: 'ultima-obra' })
})

test('DOS ASIGNACIONES ABIERTAS EL MISMO DÍA NO SE DESEMPATAN SOLAS', () => {
  // EL DEFECTO QUE ATRAPA: elegir la primera del array. Dos candidatas igual de válidas y una
  // elección en silencio mueven costo de una obra a otra sin que nadie lo vea.
  const r = obraParaElDia(
    '2026-09-10',
    [
      { obraId: 'a', desde: '2026-09-01', hasta: null },
      { obraId: 'b', desde: '2026-09-02', hasta: null },
    ],
    [{ fecha: '2026-09-09', obraId: 'a' }],
  )
  assert.deepEqual(r, { ok: false, porque: 'varias-asignaciones' })
})

test('DOS TRAMOS DE LA MISMA OBRA NO SON UNA AMBIGÜEDAD', () => {
  // Partir un tramo (una baja y un alta de la misma obra) no puede apagar la celda: la respuesta es
  // una sola obra aunque haya dos filas.
  const r = obraParaElDia(
    '2026-09-10',
    [
      { obraId: 'a', desde: '2026-09-01', hasta: null },
      { obraId: 'a', desde: '2026-09-05', hasta: null },
    ],
    [],
  )
  assert.deepEqual(r, { ok: true, obraId: 'a', porque: 'asignacion' })
})

test('SIN ASIGNACIÓN, LA ÚLTIMA OBRA ANTES DE ESE DÍA — NO LA MÁS RECIENTE DE TODAS', () => {
  // EL DEFECTO QUE ATRAPA: ordenar el historial y tomar el último elemento sin mirar la fecha del
  // día que se está cargando. Corregir un día de la quincena anterior imputaría a la obra de hoy.
  const r = obraParaElDia(
    '2026-09-03',
    [],
    [
      { fecha: '2026-09-01', obraId: 'primera' },
      { fecha: '2026-09-02', obraId: 'segunda' },
      { fecha: '2026-09-11', obraId: 'posterior' },
    ],
  )
  assert.deepEqual(r, { ok: true, obraId: 'segunda', porque: 'ultima-obra' })
})

test('EL PRIMER DÍA DE UNA PERSONA MIRA HACIA ADELANTE, Y LO DICE CON OTRO MOTIVO', () => {
  const r = obraParaElDia('2026-09-01', [], [{ fecha: '2026-09-02', obraId: 'unica' }])
  assert.deepEqual(r, { ok: true, obraId: 'unica', porque: 'proxima-obra' })
})

test('SIN OBRA ASIGNADA NI HORAS EN NINGUNA, NO SE INVENTA UNA', () => {
  assert.deepEqual(obraParaElDia('2026-09-10', [], []), { ok: false, porque: 'sin-obra-conocida' })
})
