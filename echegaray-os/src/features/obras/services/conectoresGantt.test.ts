// LO QUE ATRAPAN: una flecha que sale de la actividad equivocada, y una dependencia que desaparece
// del dibujo sin que nadie se entere.
//
// Los dos defectos son mudos. El primero dibuja una L perfecta entre dos barras que no tienen nada
// que ver —y una flecha es una afirmación sobre qué espera a qué—; el segundo deja un Gantt con
// menos secuencia de la que la obra tiene, que es cómo alguien decide reprogramar sin mirar lo que
// arrastra.

import test from 'node:test'
import assert from 'node:assert/strict'
import { conectoresDe, type FilaConector } from './conectoresGantt.ts'

const fila = (id: string | null, izqPct: number | null, anchoPct = 10): FilaConector => ({
  actividadId: id,
  tramo: izqPct == null ? null : { izqPct, anchoPct },
})

test('la L nace en el FIN del origen y muere en el ARRANQUE del destino, en su propia fila', () => {
  const filas = [fila('a', 10), fila('b', 40)]
  const { conectores, omitidas } = conectoresDe(filas, [{ origen_id: 'a', destino_id: 'b' }], { altoFila: 34 })
  assert.equal(omitidas, 0)
  assert.equal(conectores.length, 1)
  const [c] = conectores
  const [h1, v, h2] = c.segmentos
  // Sale del fin de «a» (10 + 10 = 20) a la altura de la fila 0.
  assert.equal(h1.izqPct, 20)
  assert.equal(h1.topPx, 17)
  // Baja hasta la fila 1.
  assert.equal(v.topPx, 17)
  assert.equal(v.altoPx, 34)
  // Y entra al arranque de «b» (40), no a su fin.
  assert.equal(h2.izqPct + h2.anchoPct, 40)
  assert.equal(c.flecha.izqPct, 40)
  assert.equal(c.flecha.topPx, 51)
  assert.equal(c.invertido, false)
})

test('EL ÍNDICE DE LA FILA ES EL QUE MANDA: la flecha no puede apuntar a la fila de al lado', () => {
  // Tres filas, y la dependencia va de la primera a la TERCERA. Un conector que contara filas por
  // otro lado (por posición en la lista de dependencias, por ejemplo) la dibujaría a la segunda.
  const filas = [fila('a', 0), fila('b', 20), fila('c', 50)]
  const { conectores } = conectoresDe(filas, [{ origen_id: 'a', destino_id: 'c' }], { altoFila: 34 })
  assert.equal(conectores[0].flecha.topPx, 2 * 34 + 17)
})

test('una cabecera de frente no es punta de nada: no tiene actividad_id', () => {
  const filas = [fila(null, 0), fila('a', 10), fila('b', 40)]
  const { conectores } = conectoresDe(filas, [{ origen_id: 'a', destino_id: 'b' }], { altoFila: 34 })
  // La fila 0 es la cabecera: el origen es la fila 1 y el destino la 2.
  assert.equal(conectores[0].segmentos[0].topPx, 34 + 17)
})

test('con una punta fuera de la vista NO se dibuja media flecha: se cuenta como omitida', () => {
  const filas = [fila('a', 10)]
  const { conectores, omitidas } = conectoresDe(filas, [{ origen_id: 'a', destino_id: 'z' }], { altoFila: 34 })
  assert.deepEqual(conectores, [])
  assert.equal(omitidas, 1, 'la dependencia existe: el Gantt no puede callarla')
})

test('sin fechas no hay de dónde a dónde: también se cuenta', () => {
  const filas = [fila('a', 10), fila('b', null)]
  const { omitidas } = conectoresDe(filas, [{ origen_id: 'a', destino_id: 'b' }], { altoFila: 34 })
  assert.equal(omitidas, 1)
})

test('el destino que arranca antes de que el origen termine queda marcado como invertido', () => {
  const filas = [fila('a', 30), fila('b', 5)]
  const { conectores } = conectoresDe(filas, [{ origen_id: 'a', destino_id: 'b' }], { altoFila: 34 })
  assert.equal(conectores[0].invertido, true, 'el plan no respeta la precedencia y tiene que verse')
})

test('pasado el techo las dependencias no se dibujan, pero se DICEN', () => {
  const filas = [fila('a', 0), fila('b', 10), fila('c', 20)]
  const deps = [
    { origen_id: 'a', destino_id: 'b' },
    { origen_id: 'b', destino_id: 'c' },
    { origen_id: 'a', destino_id: 'c' },
  ]
  const { conectores, omitidas } = conectoresDe(filas, deps, { altoFila: 34, maximo: 1 })
  assert.equal(conectores.length, 1)
  assert.equal(omitidas, 2)
})
