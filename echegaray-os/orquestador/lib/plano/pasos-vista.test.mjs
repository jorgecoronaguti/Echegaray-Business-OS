// Los siete pasos como dato. Lo que se prueba acá es el CRITERIO DE CERTEZA: que un paso no pueda
// decir «firme» cuando le falta una cita, y que la plata de un paso sea null y no cero cuando
// ninguna de sus partidas tiene precio.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { razonar } from './razonamiento.mjs'
import { vistaDePasos, certezaDeLectura, pasoDeItem, ESTADO, ESQUELETO } from './pasos-vista.mjs'

const lamina = (over = {}) => ({
  archivo: 'B-01.pdf',
  lamina: { codigo: 'B-01', vistas: ['fundaciones'] },
  grilla: { largoTotal: 40, anchoTotal: 32, lucesEntreEjes: [6, 6, 4.85], textoLiteral: '40,00 × 32,00' },
  elementos: [],
  proyecto: { superficie_cubierta_m2: 1284, notas_generales: [] },
  ...over,
})

const item = (id, over = {}) => ({ id, nombre: id, cantidadElementos: 4, lamina: 'B-01', dimensiones: { ancho_m: 1.8, alto_m: 0.5 }, ...over })

test('los siete pasos salen con su pregunta y en el orden de la lectura', () => {
  const pasos = vistaDePasos(razonar({ computo: { items: [] }, laminas: [lamina()], documentos: {} }))
  assert.equal(pasos.length, 7)
  assert.deepEqual(pasos.map((p) => p.id), ESQUELETO.map((e) => e.id))
  assert.deepEqual(pasos.map((p) => p.etiqueta), ['1', '2', 'x', '3', '4', '5', '6'])
  for (const p of pasos) assert.ok(p.pregunta.length > 10, `el paso ${p.id} tiene que traer su pregunta`)
})

test('un paso sin la cita del plano NO puede declararse firme', () => {
  // Base contada pero sin sección citada: se cuenta, no se cotiza.
  const items = [item('B1', { dimensiones: {} })]
  const pasos = vistaDePasos(razonar({ computo: { items }, laminas: [lamina()], documentos: {} }), { items })
  const bases = pasos.find((p) => p.id === 'p2')
  assert.equal(bases.estado, ESTADO.SIN_DATO)
  assert.ok(bases.filas.some((f) => f.falta), 'la fila sin sección viene marcada como falta')
  assert.match(bases.supuesto, /supuesto/i)
})

test('con sección citada y cantidad, la base queda firme', () => {
  const items = [item('B1')]
  const pasos = vistaDePasos(razonar({ computo: { items }, laminas: [lamina()], documentos: {} }), { items })
  assert.equal(pasos.find((p) => p.id === 'p2').estado, ESTADO.FIRME)
})

test('el arriostramiento sin exigencia sísmica declarada queda en CONFLICTO, no en economía', () => {
  const items = [item('Arriostramiento transversal')]
  const pasos = vistaDePasos(razonar({ computo: { items }, laminas: [lamina()], documentos: {} }), { items })
  const vigas = pasos.find((p) => p.id === 'p4')
  assert.equal(vigas.estado, ESTADO.CONFLICTO)
  assert.ok(vigas.filas.some((f) => f.disputa))
})

test('si el plano nombra la exigencia sísmica, el arriostramiento deja de estar en disputa', () => {
  const l = lamina({ proyecto: { notas_generales: ['Estructura según INPRES-CIRSOC 103 zona sísmica 4.'] } })
  const items = [item('Arriostramiento transversal')]
  const pasos = vistaDePasos(razonar({ computo: { items }, laminas: [l], documentos: {} }), { items })
  const vigas = pasos.find((p) => p.id === 'p4')
  assert.notEqual(vigas.estado, ESTADO.CONFLICTO)
  assert.match(vigas.supuesto, /INPRES/i)
})

test('sin ninguna lámina leída el barrido no dice que cierra', () => {
  const pasos = vistaDePasos(razonar({ computo: { items: [] }, laminas: [], documentos: {} }))
  assert.equal(pasos.find((p) => p.id === 'p7').estado, ESTADO.SIN_DATO)
})

test('un elemento sin paso asignado se ve en el barrido y no se cotiza en silencio', () => {
  const items = [item('Foso de bomba', { dimensiones: {} })]
  const pasos = vistaDePasos(razonar({ computo: { items }, laminas: [lamina()], documentos: {} }), { items })
  const barrido = pasos.find((p) => p.id === 'p7')
  assert.equal(barrido.estado, ESTADO.REVISAR)
  assert.ok(barrido.filas.some((f) => f.v === 'sin paso'))
  assert.equal(pasoDeItem(items[0]), 'p7')
})

test('la plata de un paso es null cuando ninguna partida tiene precio — nunca cero', () => {
  const items = [item('B1', { cantidad: 4, costoUnitario: null })]
  const pasos = vistaDePasos(razonar({ computo: { items }, laminas: [lamina()], documentos: {} }), { items })
  const bases = pasos.find((p) => p.id === 'p2')
  assert.equal(bases.deriva.partidas, 1)
  assert.equal(bases.deriva.importe, null)
  assert.equal(bases.deriva.sinCotizar, 1)
})

test('la plata se suma sólo de las partidas con precio, y las sin precio se cuentan', () => {
  const items = [
    item('B1', { cantidad: 4, costoUnitario: 100000 }),
    item('B2', { cantidad: 2, costoUnitario: null }),
  ]
  const pasos = vistaDePasos(razonar({ computo: { items }, laminas: [lamina()], documentos: {} }), { items })
  const bases = pasos.find((p) => p.id === 'p2')
  assert.equal(bases.deriva.importe, 400000)
  assert.equal(bases.deriva.sinCotizar, 1)
})

test('un paso que no deriva partidas lo declara con cero partidas y sin importe', () => {
  const pasos = vistaDePasos(razonar({ computo: { items: [] }, laminas: [lamina()], documentos: {} }), { items: [] })
  const luces = pasos.find((p) => p.id === 'p6')
  assert.deepEqual(luces.deriva, { partidas: 0, importe: null, sinCotizar: 0 })
})

test('la certeza de la lectura es el PEOR de sus pasos', () => {
  const items = [item('Arriostramiento transversal')]
  const pasos = vistaDePasos(razonar({ computo: { items }, laminas: [lamina()], documentos: {} }), { items })
  const c = certezaDeLectura(pasos)
  assert.equal(c.estado, ESTADO.CONFLICTO)
  assert.equal(c.total, 7)
})

test('sin razonamiento no hay pasos inventados', () => {
  assert.deepEqual(vistaDePasos(null), [])
  assert.deepEqual(certezaDeLectura([]), { estado: null, porEstado: {}, firmes: 0, total: 0 })
})
