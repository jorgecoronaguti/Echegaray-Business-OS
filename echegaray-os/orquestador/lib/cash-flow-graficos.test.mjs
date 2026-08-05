// UN GRÁFICO QUE SE ARMA SU PROPIA SUMA ES UNA SEGUNDA VERDAD ESPERANDO SU TURNO.
//
// Estos tests miran dos cosas y nada más: que los gráficos apunten a las MISMAS celdas que la tabla,
// y que un gráfico que no se puede dibujar lo DIGA en vez de desaparecer. Las dos ya fallaron: un
// `addChart` con un ancla fuera de grilla devuelve 400 y se lleva puesto el lote entero, y un
// `getCharts` que falla y se trata como "no hay ninguno" apila un juego de gráficos por corrida.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  graficoLiquidez, graficoDesvio, planDeGraficos, requestsDeGraficos, MARCA, COL_ANCLA,
} from './cash-flow-graficos.mjs'

const G = {
  filaCab: 3, filaCierre: 55, filaColchon: 57, filaEntradas: 56, filaSalidas: 58, colN: 54,
  desvioCab: 78, desvioEsperado: 79, desvioReal: 80, desvioColN: 8,
}
const spec = (r) => r.addChart.chart.spec
const series = (r) => spec(r).basicChart.series
/** Las filas (1-based) que una serie o dominio lee del Sheet. */
const filasDe = (s) => (s.series ?? s.domain).sourceRange.sources.map((x) => x.startRowIndex + 1)

test('la curva de liquidez es un COMBO: barras de movimiento y líneas de posición', () => {
  // El dueño lo pidió con ese nombre. Dos gráficos separados —uno de saldo y otro de movimiento—
  // obligan a cruzar a ojo dos dibujos con el mismo eje horizontal para contestar una sola pregunta:
  // en qué período no alcanza la plata Y por qué.
  const s = series(graficoLiquidez(7, G))
  assert.equal(spec(graficoLiquidez(7, G)).basicChart.chartType, 'COMBO')
  assert.equal(s.length, 4, 'el combo perdió una serie: entradas, salidas, posición y colchón')
  assert.deepEqual(s.map((x) => x.type), ['COLUMN', 'COLUMN', 'LINE', 'LINE'],
    '`type` por serie es lo que hace COMBO a un basicChart: sin él la posición sale como una barra más')
})

test('el movimiento y la posición NO comparten eje', () => {
  // Están en órdenes de magnitud distintos: en un solo eje la curva de posición aplasta las barras
  // contra el piso y deja de verse cuál es el período que no se paga solo.
  const s = series(graficoLiquidez(7, G))
  assert.deepEqual(s.map((x) => x.targetAxis),
    ['LEFT_AXIS', 'LEFT_AXIS', 'RIGHT_AXIS', 'RIGHT_AXIS'])
})

test('las cuatro series leen las filas del cuadro que el generador ubicó, sin recalcular nada', () => {
  // Si un gráfico apuntara a una fila distinta de la que muestra la tabla, la pestaña diría dos cosas
  // sobre la misma plata y la más creíble sería el dibujo.
  const s = series(graficoLiquidez(7, G))
  assert.deepEqual(s.flatMap(filasDe), [G.filaEntradas, G.filaSalidas, G.filaCierre, G.filaColchon])
  assert.deepEqual(filasDe(spec(graficoLiquidez(7, G)).basicChart.domains[0]), [G.filaCab],
    'el eje de períodos no lee el encabezado del cuadro')
})

test('el desvío tiene su PROPIA ventana de tiempo — no la fila 3', () => {
  // Son períodos YA CERRADOS, que es otra ventana que la del cuadro. Mezclarlas es la Regla de Oro 3
  // (nunca mezclar ventanas de tiempo incompatibles) rota adentro de un gráfico, donde no se ve.
  const g = graficoDesvio(7, G)
  assert.deepEqual(filasDe(spec(g).basicChart.domains[0]), [G.desvioCab])
  assert.notEqual(G.desvioCab, G.filaCab)
  assert.deepEqual(series(g).flatMap(filasDe), [G.desvioEsperado, G.desvioReal])
})

test('el ancla es una celda REAL y siempre la misma columna', () => {
  // `anchorCell` fuera de la grilla hace que la API devuelva 400 y —como los requests viajan en
  // lote— se caiga TODO, formato incluido. Por eso `COL_ANCLA` se exporta: el generador ensancha la
  // hoja antes de pedir nada.
  for (const g of [graficoLiquidez(7, G), graficoDesvio(7, G)]) {
    const a = g.addChart.chart.position.overlayPosition.anchorCell
    assert.equal(a.columnIndex, COL_ANCLA)
    assert.equal(a.sheetId, 7)
    assert.ok(a.rowIndex >= 0)
  }
})

test('los gráficos no se pisan entre sí', () => {
  const anclas = [graficoLiquidez(7, G), graficoDesvio(7, G)]
    .map((g) => g.addChart.chart.position.overlayPosition.anchorCell.rowIndex)
  assert.equal(new Set(anclas).size, anclas.length, 'dos gráficos anclados en la misma fila')
})

test('un gráfico que no se puede dibujar se OMITE con su motivo, no desaparece', () => {
  // Devolver `[]` en silencio ya pasó y dejó una pestaña sin gráficos sin que el log dijera una
  // palabra. "No hay meses cerrados todavía" es una respuesta legítima; el silencio no.
  const { dibujables, omitidos } = planDeGraficos({ ...G, desvioCab: undefined })
  assert.deepEqual(dibujables.map((d) => d.clave), ['liquidez'])
  assert.deepEqual(omitidos, [{ clave: 'desvio', falta: ['desvioCab'] }])
})

test('el combo se omite ENTERO si le falta una serie — nunca a medias', () => {
  // Una curva de liquidez sin la línea del colchón muestra un saldo que baja y no dice si eso está
  // mal. Es peor que no tenerla: parece que la pregunta ya está contestada.
  const { dibujables, omitidos } = planDeGraficos({ ...G, filaColchon: undefined })
  assert.deepEqual(dibujables.map((d) => d.clave), ['desvio'])
  assert.deepEqual(omitidos[0].falta, ['filaColchon'])
})

test('borra los PROPIOS antes de dibujar, y sólo los propios', () => {
  // `addChart` SIEMPRE agrega: no existe "crear o actualizar". Sin borrar primero, cada corrida apila
  // un juego más. Se borra por MARCA, así que un gráfico que dibuje el dueño es suyo y no se toca —
  // y los que este módulo dejó de dibujar se van igual, porque el prefijo los alcanza.
  const charts = [
    { chartId: 1, title: `${MARCA}Curva de liquidez — hasta dónde baja la caja` }, // uno RETIRADO
    { chartId: 2, title: 'Mi gráfico del dueño' },
    { chartId: 3, title: `${MARCA}Cobranzas: lo esperado contra lo cobrado` },
  ]
  const google = { getCharts: async () => [{ sheetId: 7, charts }, { sheetId: 9, charts: [{ chartId: 99, title: `${MARCA}otro` }] }] }
  return requestsDeGraficos(google, 'f', 7, G).then((reqs) => {
    const borrados = reqs.filter((r) => r.deleteEmbeddedObject).map((r) => r.deleteEmbeddedObject.objectId)
    assert.deepEqual(borrados, [1, 3], 'borró el del dueño, o dejó vivo un gráfico retirado, o tocó otra hoja')
    assert.equal(reqs.filter((r) => r.addChart).length, 2)
    assert.ok(reqs.findIndex((r) => r.deleteEmbeddedObject) < reqs.findIndex((r) => r.addChart),
      'dibuja antes de borrar: la corrida siguiente encuentra el doble')
  })
})

test('si no se pueden leer los existentes NO se dibuja — dibujar sin borrar los apila', () => {
  // No poder leer no es "no hay ninguno". Sin la lectura no se puede decidir, así que no se dibuja.
  const google = { getCharts: async () => { throw new Error('429') } }
  return requestsDeGraficos(google, 'f', 7, G).then((reqs) => assert.deepEqual(reqs, []))
})

test('el cliente de Google expone getCharts: sin eso este módulo no puede borrar los suyos', async () => {
  const { readFileSync } = await import('node:fs')
  const src = readFileSync(new URL('./google.mjs', import.meta.url), 'utf8')
  assert.match(src, /async getCharts\(fileId\)/, 'falta el lector de gráficos en el cliente')
})
