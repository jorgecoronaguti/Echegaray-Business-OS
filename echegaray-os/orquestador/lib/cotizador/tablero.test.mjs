// EL TABLERO TIENE QUE PODER DECIR «NO LO SÉ».
//
// La orden del dueño es una sola línea —«Nunca convertir NO_MEDIDO en 0%»— y es la más fácil de
// violar sin darse cuenta: `(n ?? 0) / (d ?? 1)` la rompe, y el resultado se ve igual de prolijo
// que una medición real. Cada test de acá abajo cierra una de las formas de romperla.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { METRICAS, ESTADO, FALTA, medir, correrTablero, comoMarkdown } from './tablero.mjs'

const def = { id: 'X', dice: 'x', numerador: 'los que sí', denominador: 'los que podían' }

test('tablero · un numerador sin medir NO es 0%', () => {
  const f = medir({ ...def, n: undefined, d: 100 })
  assert.equal(f.estado, ESTADO.NO_MEDIDO)
  assert.equal(f.valor, null)          // ← lo que impide que alguien imprima `valor ?? 0`
  assert.equal(f.falta, FALTA.SIN_NUMERADOR)
})

test('tablero · un denominador CERO no es 0% — es una pregunta sin universo', () => {
  // 0/0 no es cero. Y 5/0 tampoco es «infinito por ciento»: no hay universo.
  const f = medir({ ...def, n: 0, d: 0 })
  assert.equal(f.estado, ESTADO.NO_MEDIDO)
  assert.equal(f.valor, null)
  assert.equal(f.falta, FALTA.DENOMINADOR_CERO)
})

test('tablero · un denominador sin medir invalida el numerador, por bueno que sea', () => {
  const f = medir({ ...def, n: 87, d: null })
  assert.equal(f.estado, ESTADO.NO_MEDIDO)
  assert.equal(f.valor, null)
  assert.equal(f.falta, FALTA.SIN_DENOMINADOR)
})

test('tablero · CERO sobre un universo real SÍ es una medición, y de las que importan', () => {
  // Ésta es la contracara y es igual de importante: «cero precios resueltos solo sobre 107
  // recursos» es un dato duro, no una ausencia. Confundirlo con NO_MEDIDO sería la trampa inversa
  // —tapar un resultado malo diciendo que no se pudo medir—.
  const f = medir({ ...def, n: 0, d: 107 })
  assert.equal(f.estado, ESTADO.MEDIDO)
  assert.equal(f.valor, 0)
})

test('tablero · NaN e Infinity no son números medidos', () => {
  // `typeof NaN === 'number'` es true: sin `Number.isFinite` un NaN entra como medición y sale
  // impreso como «NaN%», que un lector apurado lee como un número raro y no como «no se midió».
  for (const malo of [NaN, Infinity, -Infinity]) {
    assert.equal(medir({ ...def, n: malo, d: 10 }).estado, ESTADO.NO_MEDIDO, `numerador ${malo}`)
    assert.equal(medir({ ...def, n: 10, d: malo }).estado, ESTADO.NO_MEDIDO, `denominador ${malo}`)
  }
})

test('tablero · una métrica de conteo puro no fabrica un denominador', () => {
  // Llamadas al modelo, USD, latencia: no son cocientes. Inventarles un denominador para poder
  // publicar un porcentaje es la forma elegante de mentir con una división.
  const f = medir({ id: 'LLM', dice: 'llamadas', numerador: 'llamadas', denominador: undefined, n: 0, d: undefined, unidad: 'llamadas' })
  assert.equal(f.estado, ESTADO.MEDIDO)
  assert.equal(f.valor, 0)
  assert.equal(f.d, null)
})

test('tablero · una lectura que se rompe es NO_MEDIDO, jamás un cero', () => {
  const rota = [{ id: 'R', dice: 'r', numerador: 'a', denominador: 'b', lee: () => { throw new Error('la consulta murió') } }]
  const t = correrTablero({}, { metricas: rota })
  assert.equal(t.filas[0].estado, ESTADO.NO_MEDIDO)
  assert.equal(t.filas[0].valor, null)
  assert.match(t.filas[0].porque, /la consulta murió/)
})

test('tablero · sin evidencia, las quince salen NO_MEDIDO y ninguna sale en cero', () => {
  const t = correrTablero({})
  assert.equal(t.medidas, 0)
  assert.equal(t.cobertura, `0/${METRICAS.length}`)
  for (const f of t.filas) assert.equal(f.valor, null, `«${f.id}» publicó un valor sin evidencia`)
})

test('tablero · las quince tienen definición, numerador y lector', () => {
  assert.equal(METRICAS.length, 17)
  const ids = new Set()
  for (const m of METRICAS) {
    assert.ok(m.dice && m.numerador, `«${m.id}» no dice qué mide`)
    assert.equal(typeof m.lee, 'function')
    assert.ok(!ids.has(m.id), `«${m.id}» está repetida`)
    ids.add(m.id)
  }
})

test('tablero · con evidencia real las métricas se calculan y el markdown las muestra', () => {
  const t = correrTablero({
    dod: { pass: 12, total: 24, noAplica: 0 },
    precios: { actualizados: 0, requeridos: 107 },
    costo: { llamadasLlm: 0, msFrio: 1840 },
  })
  const cap = t.filas.find((f) => f.id === 'CAPABILITY_COVERAGE')
  assert.equal(cap.estado, ESTADO.MEDIDO)
  assert.equal(cap.valor, 50)
  const md = comoMarkdown(t)
  assert.match(md, /50\.0%/)
  assert.match(md, /NO_MEDIDO/)   // las que no se midieron se ven como tales, no en blanco
})
