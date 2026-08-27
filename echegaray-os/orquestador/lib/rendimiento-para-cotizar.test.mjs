import test from 'node:test'
import assert from 'node:assert/strict'
import { rendimientoParaCotizar, mediana } from './rendimiento-para-cotizar.mjs'

const ref = (hs) => ({ hsUnitarias: hs, estado: 'REFERENCIA', confianza: 'media' })
const cand = (hs, c = 'alta', obra = 'o1') => ({ hsUnitarias: hs, estado: 'CANDIDATO', confianza: c, obraId: obra })
const val = (hs, c = 'alta', obra = 'o1') => ({ hsUnitarias: hs, estado: 'VALIDADO', confianza: c, obraId: obra })

test('sin experiencia propia, se cotiza con la referencia y se dice por qué', () => {
  const r = rendimientoParaCotizar([ref(0.12)])
  assert.equal(r.recomendado, 'referencia')
  assert.equal(r.experiencia, null)
  assert.match(r.porQue, /no hay ejecución real/)
})

test('UN caso real NO cambia el precio: se muestra al lado de la referencia', () => {
  // Es la regla que impide que una actividad rara mueva una cotización.
  const r = rendimientoParaCotizar([ref(0.12), cand(0.04)])
  assert.equal(r.recomendado, 'referencia')
  assert.equal(r.experiencia.casos, 1)
  assert.equal(r.experiencia.estado, 'CANDIDATO')
  assert.match(r.porQue, /sin confirmar/)
  assert.ok(r.desvioPct < -60, 'el desvío se calcula igual: es la señal de que la tabla puede estar vieja')
})

test('la experiencia VALIDADA sí pasa a ser la recomendación', () => {
  const r = rendimientoParaCotizar([ref(0.12), val(0.09), val(0.10)])
  assert.equal(r.recomendado, 'experiencia')
  assert.equal(r.experiencia.casos, 2)
  assert.equal(r.experiencia.hsUnitarias, 0.095)
  assert.ok(r.referencia, 'la referencia NO desaparece: se sigue viendo debajo')
})

test('sin referencia, lo medido es lo único que hay — y se dice con qué confianza', () => {
  const r = rendimientoParaCotizar([cand(0.5, 'media')])
  assert.equal(r.recomendado, 'experiencia')
  assert.equal(r.experiencia.confianza, 'media')
  assert.equal(r.desvioPct, null, 'sin referencia no hay desvío que calcular')
})

test('la confianza del conjunto es la del peor caso', () => {
  const r = rendimientoParaCotizar([val(0.09, 'alta'), val(0.10, 'baja')])
  assert.equal(r.experiencia.confianza, 'baja')
})

test('una tarea sin nada devuelve nada, no un cero', () => {
  const r = rendimientoParaCotizar([])
  assert.equal(r.recomendado, null)
  assert.equal(r.referencia, null)
  assert.equal(r.experiencia, null)
})

test('la mediana no se deja arrastrar por un caso descontrolado', () => {
  assert.equal(mediana([0.1, 0.11, 9]), 0.11)
  assert.equal(mediana([]), null)
  assert.equal(mediana([null, undefined, 'x']), null)
})

test('un único caso de confianza BAJA se muestra pero no se recomienda', () => {
  // Cotizar con el rendimiento de una actividad que arrancó hace tres días es peor que cotizar
  // sabiendo que no se sabe.
  const r = rendimientoParaCotizar([cand(0.4, 'baja')])
  assert.equal(r.recomendado, null)
  assert.equal(r.experiencia.hsUnitarias, 0.4, 'el número igual se devuelve')
  assert.match(r.porQue, /no se recomienda/)
})
