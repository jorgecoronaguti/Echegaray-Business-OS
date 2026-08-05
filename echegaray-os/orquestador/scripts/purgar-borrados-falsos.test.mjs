// El defecto que estos tests atrapan es el de LOS DOS LADOS: purgar de más ya costó restaurar 72
// borrados que eran del dueño (24/07); no purgar deja marcas falsas que se confirman solas.
import test from 'node:test'
import assert from 'node:assert/strict'
import { clasificar } from './purgar-borrados-falsos.mjs'

test('un rótulo que ESTÁ en la pestaña se purga, con la celda como evidencia', () => {
  const presentes = new Map([['ACTIVIDADES OPERATIVAS', 'B14'], ['Cobranzas de obra civil', 'B16']])
  const { falsos, seQuedan } = clasificar(['ACTIVIDADES OPERATIVAS'], presentes)
  assert.deepEqual(falsos, [{ rotulo: 'ACTIVIDADES OPERATIVAS', celda: 'B14' }])
  assert.deepEqual(seQuedan, [])
})

test('un rótulo AUSENTE se queda: el borrado del dueño manda', () => {
  // Los nueve de "Caja" son de verdad suyos — dejó la pestaña minimalista a propósito.
  const { falsos, seQuedan } = clasificar(['Arqueo de caja', 'Origen del dato'], new Map([['Otra cosa', 'A1']]))
  assert.deepEqual(falsos, [])
  assert.deepEqual(seQuedan, ['Arqueo de caja', 'Origen del dato'])
})

test('sin evidencia no se purga nada: una pestaña que no se pudo leer deja todo en pie', () => {
  const { falsos, seQuedan } = clasificar(['A', 'B', 'C'], new Map())
  assert.deepEqual(falsos, [])
  assert.equal(seQuedan.length, 3)
})

test('el apóstrofo de Sheets y los espacios de borde no impiden reconocer que el rótulo está', () => {
  const { falsos } = clasificar(["  TOTAL FACTURADO "], new Map([['TOTAL FACTURADO', 'D9']]))
  assert.deepEqual(falsos, [{ rotulo: '  TOTAL FACTURADO ', celda: 'D9' }])
})
