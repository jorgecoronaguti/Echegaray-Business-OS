// EL PIPELINE MIRA DATOS. El test que lo prueba es el que reventaba con `const ACTUAL = 3`.

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { pasosDelPipeline, avanceDelPipeline, type HechosDelPipeline } from './pipeline.ts'

const hechos = (x: Partial<HechosDelPipeline> = {}): HechosDelPipeline => ({
  nPartidas: 8, nSinAnalisis: 0, congelado: false, nConvertidas: 0, planConFechas: false, ...x,
})

const estadoDe = (h: HechosDelPipeline) => pasosDelPipeline(h).map((p) => p.estado)

describe('el paso actual sale de los datos, no de una constante', () => {
  test('presupuesto sin congelar: el actual es el 2, no el 3', () => {
    // MUTACIÓN QUE LO PONE ROJO: volver a `const ACTUAL = 3` daría ['hecho','hecho','actual',...].
    assert.deepEqual(estadoDe(hechos()), ['hecho', 'actual', 'pendiente', 'pendiente', 'sin-dato'])
  })

  test('con partidas sin análisis, el paso 1 NO está hecho', () => {
    assert.equal(estadoDe(hechos({ nSinAnalisis: 3 }))[0], 'actual')
  })

  test('ya convertido entero: el actual pasa al plan de obra, no se queda en la conversión', () => {
    const e = estadoDe(hechos({ congelado: true, nConvertidas: 8 }))
    assert.deepEqual(e.slice(0, 4), ['hecho', 'hecho', 'hecho', 'actual'])
  })

  test('convertido a medias: la conversión es el paso actual', () => {
    assert.equal(estadoDe(hechos({ congelado: true, nConvertidas: 3 }))[2], 'actual')
  })

  test('un presupuesto vacío no tiene la base maestra «hecha»', () => {
    assert.equal(estadoDe(hechos({ nPartidas: 0, nConvertidas: 0 }))[0], 'actual')
  })
})

describe('lo que no se puede mirar dice SIN DATO, no PENDIENTE', () => {
  test('sin `hayAvance`, la ejecución queda sin dato y explica por qué', () => {
    const p = pasosDelPipeline(hechos())
    assert.equal(p[4].estado, 'sin-dato')
    assert.match(p[4].porQue, /no lee el avance/)
  })

  test('con `hayAvance: false` ya se puede afirmar que no arrancó', () => {
    assert.equal(estadoDe(hechos({ hayAvance: false }))[4], 'pendiente')
  })

  test('todo hecho: no queda ningún paso «actual»', () => {
    const e = estadoDe(hechos({ nConvertidas: 8, congelado: true, planConFechas: true, hayAvance: true }))
    assert.deepEqual(e, ['hecho', 'hecho', 'hecho', 'hecho', 'hecho'])
  })
})

describe('cada paso dice de qué dato sale', () => {
  test('el porqué nombra números reales, no una frase fija', () => {
    const p = pasosDelPipeline(hechos({ nPartidas: 8, nSinAnalisis: 3, nConvertidas: 5 }))
    assert.match(p[0].porQue, /5 de 8 partidas con análisis/)
    assert.match(p[2].porQue, /5 de 8 partidas convertidas/)
  })
})

describe('la barra cuenta pasos hechos, no está clavada en 60 %', () => {
  test('sin nada hecho salvo la base maestra: 1 de 4 medibles', () => {
    const a = avanceDelPipeline(pasosDelPipeline(hechos()))
    assert.deepEqual(a, { hechos: 1, medibles: 4, fraccion: 0.25 })
  })

  test('el paso sin dato sale del DENOMINADOR, no cuenta como no hecho', () => {
    const conDato = avanceDelPipeline(pasosDelPipeline(hechos({ hayAvance: false })))
    assert.equal(conDato?.medibles, 5, 'contó el paso sin dato como medible')
    const sinDato = avanceDelPipeline(pasosDelPipeline(hechos()))
    assert.equal(sinDato?.medibles, 4)
    // Con el mismo trabajo hecho, ocultar el paso que no se puede medir NO baja el avance.
    assert.ok((sinDato?.fraccion ?? 0) > (conDato?.fraccion ?? 0))
  })

  test('todo hecho da 100 %, y nada hecho da 0 % — no 60 %', () => {
    assert.equal(avanceDelPipeline(pasosDelPipeline(hechos({ nConvertidas: 8, congelado: true, planConFechas: true, hayAvance: true })))?.fraccion, 1)
    assert.equal(avanceDelPipeline(pasosDelPipeline(hechos({ nPartidas: 0, hayAvance: false })))?.fraccion, 0)
  })
})
