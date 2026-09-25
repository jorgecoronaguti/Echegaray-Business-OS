// DICTAR PARTE — el parser, sin red. Lo que se protege: que cada dato salga de lo que se dijo, que
// lo dudoso se marque, que nadie de afuera de la obra aparezca y que nada se registre solo.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { numeroDeTexto, proponerParte, textoResumen, tokenizar } from './voz-parte.mjs'
import { CASOS, CONTEXTO, compararCaso } from './voz-parte.fixtures.mjs'

test('números en palabras y en dígitos', () => {
  const casos = {
    'cuarenta y cinco': 45, 'ocho y media': 8.5, 'doscientos cincuenta': 250, 'mil quinientos': 1500,
    'veintidós': 22, 'cien': 100, '4,5': 4.5, '1.500': 1500, 'una hora': 1, 'cuatro coma cinco': 4.5,
    'treinta y dos bolsas': 32, 'noventa y nueve': 99,
  }
  for (const [t, v] of Object.entries(casos)) assert.equal(numeroDeTexto(t), v, t)
  assert.equal(numeroDeTexto('un poco de arena'), null, '«un» artículo no es un número')
  assert.equal(numeroDeTexto('una losa'), null)
})

test('«por ciento» y «%» son el mismo token', () => {
  assert.deepEqual(tokenizar('cuarenta por ciento').map((t) => t.tipo), ['num', 'pct'])
  assert.deepEqual(tokenizar('40 %').map((t) => t.tipo), ['num', 'pct'])
})

for (const caso of CASOS) {
  test(`fixture: ${caso.nombre}`, () => {
    const p = proponerParte(caso.texto, CONTEXTO)
    const malos = compararCaso(caso, p).filter((c) => !c.ok)
    assert.deepEqual(malos, [], JSON.stringify({ personas: p.personas, avances: p.avances, materiales: p.materiales, novedades: p.novedades }, null, 1))
  })
}

test('NADA de esto es un registro: sale marcado como propuesta', () => {
  const p = proponerParte(CASOS[0].texto, CONTEXTO)
  assert.equal(p.estado, 'propuesta')
  assert.match(p.porQue, /Guardar/)
})

test('el resumen de la maqueta: «Entendí 6 personas, 2 tareas, 1 avance y 1 pedido. Hay 1 dato para confirmar.»', () => {
  const p = proponerParte(CASOS[0].texto, CONTEXTO)
  assert.equal(p.resumen.texto, 'Entendí 6 personas, 2 tareas, 1 avance y 1 pedido. Hay 1 dato para confirmar.')
  assert.equal(textoResumen({ personas: 1, tareas: 0, avances: 0, pedidos: 2, dudas: 3 }), 'Entendí 1 persona, 0 tareas, 0 avances y 2 pedidos. Hay 3 datos para confirmar.')
})

test('cada dato lleva el tramo exacto de donde salió', () => {
  const t = CASOS[0].texto
  const p = proponerParte(t, CONTEXTO)
  const tramoDe = (tr) => t.slice(tr[0], tr[1])
  assert.equal(tramoDe(p.materiales[0].tramo), 'veinte bolsas de cemento')
  assert.equal(tramoDe(p.avances[0].tramo), 'losa quedó al cuarenta por ciento')
  assert.equal(tramoDe(p.personas.find((f) => f.persona_id === 'p-quiroz').tramo), 'Quiroz no vino')
  assert.equal(tramoDe(p.conteo.tramo), 'éramos seis')
  // Las marcas no se solapan y la falta va en naranja.
  for (let i = 1; i < p.marcas.length; i++) assert.ok(p.marcas[i].desde >= p.marcas[i - 1].hasta)
  assert.ok(p.marcas.some((m) => m.tipo === 'duda' && tramoDe([m.desde, m.hasta]) === 'Quiroz no vino'))
})

test('el conteo dicho que no cierra con lo entendido se avisa', () => {
  const p = proponerParte('Éramos cinco. Argüello ocho horas en losa.', CONTEXTO)
  assert.equal(p.avisos.length, 1)
  assert.match(p.avisos[0].texto, /eran 5 y entendí 1/)
})

test('sin plantel no hay personas: sólo las de ESA obra', () => {
  const p = proponerParte(CASOS[0].texto, { ...CONTEXTO, personas: [] })
  assert.equal(p.personas.length, 0)
})

test('un texto vacío no inventa nada', () => {
  const p = proponerParte('', CONTEXTO)
  assert.deepEqual([p.personas, p.avances, p.materiales, p.novedades], [[], [], [], []])
  assert.equal(p.resumen.dudas, 0)
})

test('una persona sin horas dichas toma la jornada de la obra y baja su confianza', () => {
  const p = proponerParte('Navarro en contrapiso.', { ...CONTEXTO, obra: { ...CONTEXTO.obra, jornada_horas: 9 } })
  const f = p.personas[0]
  assert.equal(f.horas, 9)
  assert.equal(f.horasDe, 'jornada')
  assert.equal(f.confianza, 'media')
})

test('«el resto» sin nadie entendido antes se confirma: pueden ser nombres que no se entendieron', () => {
  const p = proponerParte('Xxyyzz y Wwqq ocho horas en losa, el resto en contrapiso.', CONTEXTO)
  assert.ok(p.personas.length > 0)
  assert.ok(p.personas.every((f) => f.dudoso))
  assert.equal(proponerParte('Todos en contrapiso.', CONTEXTO).personas.every((f) => !f.dudoso), true)
})

test('«el resto» con un «no vino» sin nombre se confirma: puede incluir al que faltó', () => {
  const p = proponerParte('Argüello ocho horas en losa, el resto en contrapiso. Cosales no vino.', CONTEXTO)
  const resto = p.personas.filter((f) => f.origen === 'grupo')
  assert.ok(resto.length > 0 && resto.every((f) => f.dudoso))
  assert.match(resto[0].motivo, /no vino/)
})

test('«haremos tres» (éramos, mal transcripto) igual cuenta', () => {
  assert.equal(proponerParte('Hoy haremos tres. Argüello ocho horas en losa.', CONTEXTO).conteo?.dicho, 3)
})

test('«Quiroz sí vino, ocho horas en encofrado»: la cláusula sin sujeto es de quien se nombró antes', () => {
  const p = proponerParte('Quiroz sí vino, ocho horas en encofrado de losa.', CONTEXTO)
  const q = p.personas.find((f) => f.persona_id === 'p-quiroz')
  assert.equal(q.estado, 'presente')
  assert.equal(q.horas, 8)
  assert.equal(q.tarea_id, 't-encofrado')
  assert.equal(p.novedades.length, 0)
})
