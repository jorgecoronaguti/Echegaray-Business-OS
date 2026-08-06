// LOS GRÁFICOS DE CAJA, VERIFICADOS EN FRÍO.
//
// POR QUÉ EXISTE (05/08/2026). La primera corrida real NO dibujó ningún gráfico y el log no dijo una
// palabra: dos de las tres salidas devolvían `[]` en silencio. "No apareció y no sé por qué" es el peor
// estado posible — no se puede arreglar ni descartar.
//
// ═══ ESTE ARCHIVO SE REESCRIBIÓ CON LA PORTADA ═══
//
// Antes había dos gráficos que leían la tabla de CAJA (el combo del calendario y el ranking de
// clientes). Ahora son cuatro y leen `_CAJA_ANEXO`, porque una serie diaria de sesenta puntos es una
// matriz y en la portada no entra una matriz. Los tests de la forma del request se conservan —el
// envoltorio `{ data: … }` que devuelve un 400 sigue siendo el error fácil de cometer—; los que medían
// las columnas del calendario se retiran con el layout que medían.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { graficos, requestsDeGraficos, MARCA, FILA_ANCLA, COL_ANCLA } from './caja-graficos.mjs'
import { COL } from './caja-anexo-series.mjs'

const SERIES = {
  historia: { f0: 40, f1: 99 }, proyeccion: { f0: 101, f1: 160 },
  pagos: { f0: 162, f1: 166 }, cobranzas: { f0: 168, f1: 172 },
}
const ANEXO = 99
const fake = (charts) => ({ getCharts: async () => [{ sheetId: 7, title: 'Caja', charts }] })

test('SON CUATRO Y CADA UNO CONTESTA UNA PREGUNTA DISTINTA', () => {
  // El dueño los eligió: evolución, proyección, concentración de pagos y de cobranzas. Ninguno repite
  // lo que ya dice una tabla — un gráfico que resume algo que está al lado es decoración.
  const { requests, faltan } = graficos(7, ANEXO, SERIES)
  assert.equal(requests.length, 4)
  assert.deepEqual(faltan, [])
  assert.deepEqual(requests.map((r) => r.addChart.chart.spec.title), [
    `${MARCA}Evolución de la caja`, `${MARCA}Proyección de la caja`,
    `${MARCA}Concentración de pagos`, `${MARCA}Concentración de cobranzas`,
  ])
  for (const r of requests) {
    assert.ok(r.addChart.chart.spec.subtitle, 'un gráfico sin la pregunta que contesta es decoración')
  }
})

test('LOS DATOS SALEN DEL ANEXO, NUNCA DE UNA SEGUNDA FUENTE', () => {
  // Un gráfico alimentado por su propio cálculo es la forma más elegante de tener dos verdades, y esta
  // pestaña ya pagó $41,7M por tener dos definiciones de lo mismo.
  for (const r of graficos(7, ANEXO, SERIES).requests) {
    const b = r.addChart.chart.spec.basicChart
    for (const s of [...b.series.map((x) => x.series), b.domains[0].domain]) {
      const f = s.sourceRange.sources[0]
      assert.equal(f.sheetId, ANEXO, 'la serie tiene que leer _CAJA_ANEXO, no la propia CAJA')
      // Y EL ENVOLTORIO IMPORTA: en un basicChart la ChartData va directa. Con `{ data: … }` —que es lo
      // que pide un waterfall— la API devuelve 400 "Unknown name data" y no se dibuja nada. Costó una
      // corrida contra el archivo real descubrirlo.
      assert.equal(s.data, undefined, 'en un basicChart la ChartData va SIN envoltorio `data`')
    }
  }
})

test('LAS CURVAS LEEN FECHA CONTRA IMPORTE; LOS RANKINGS, NOMBRE CONTRA IMPORTE', () => {
  const [ev, pr, pag, cob] = graficos(7, ANEXO, SERIES).requests.map((r) => r.addChart.chart.spec.basicChart)
  for (const c of [ev, pr]) {
    assert.equal(c.chartType, 'LINE', 'un saldo diario es una curva: como barras son sesenta barras ilegibles')
    assert.equal(c.domains[0].domain.sourceRange.sources[0].startColumnIndex, COL.fecha - 1)
    assert.equal(c.series[0].series.sourceRange.sources[0].startColumnIndex, COL.importe - 1)
  }
  for (const c of [pag, cob]) {
    // BAR y no COLUMN: los nombres de contraparte son largos y en vertical se dibujan rotados.
    assert.equal(c.chartType, 'BAR')
    assert.equal(c.domains[0].domain.sourceRange.sources[0].startColumnIndex, COL.rotulo - 1)
    assert.equal(c.legendPosition, 'NO_LEGEND', 'una sola serie: la leyenda roba ancho y no agrega nada')
  }
})

test('EL ANCLA CAE DEBAJO DE LA GRILLA, y el generador garantiza esa fila', () => {
  // Los gráficos FLOTAN, pero su ancla es una celda REAL: si la hoja no llega a esa fila, `addChart`
  // devuelve 400 y se cae el lote entero. Y van DEBAJO y no a la derecha: la portada mide veinte filas
  // y tiene que entrar en una pantalla — un gráfico a la derecha obliga a scrollear en horizontal.
  const { requests } = graficos(7, ANEXO, SERIES)
  for (const r of requests) {
    const p = r.addChart.chart.position.overlayPosition
    assert.equal(p.anchorCell.rowIndex, FILA_ANCLA)
    assert.equal(p.anchorCell.columnIndex, COL_ANCLA)
  }
  // Dos por fila: se leen en el orden natural, evolución y proyección arriba, concentraciones abajo.
  const xs = requests.map((r) => r.addChart.chart.position.overlayPosition.offsetXPixels)
  const ys = requests.map((r) => r.addChart.chart.position.overlayPosition.offsetYPixels)
  assert.equal(xs[0], 0)
  assert.ok(xs[1] > 0 && ys[1] === 0)
  assert.ok(ys[2] > 0 && xs[2] === 0)
  const src = readFileSync(new URL('../scripts/caja-pestana.mjs', import.meta.url), 'utf8')
  assert.match(src, /FILA_ANCLA \+ 4/, 'el generador tiene que extender la hoja hasta pasado el ancla')
  assert.match(src, /gridProperties\.rowCount/, 'y pedirle a la API que cambie el alto, no suponerlo')
})

test('SE BORRAN TODOS LOS DE LA PESTAÑA ANTES DE DIBUJAR, y los borrados van primero', async () => {
  // `addChart` SIEMPRE agrega: sin borrar, la corrida de cada dos horas apila doce por día.
  //
  // LA REGLA CAMBIÓ Y SE DECLARA: antes se borraban sólo los propios, para no tocar el que dibujara el
  // dueño. Ahora se borran TODOS por orden explícita —*"eliminá TODOS los actuales de la pestaña"*— y
  // porque el rediseño lo obliga: cualquier gráfico anterior lee filas de un layout que ya no existe,
  // así que dibujaría una curva perfecta de datos equivocados.
  const reqs = await requestsDeGraficos(fake([
    { chartId: 1, title: `${MARCA}El recorrido de la caja` },
    { chartId: 3, title: 'un gráfico que hizo el dueño sobre el layout viejo' },
  ]), 'file', 7, ANEXO, SERIES)
  assert.deepEqual(reqs.filter((r) => r.deleteEmbeddedObject).map((r) => r.deleteEmbeddedObject.objectId), [1, 3])
  assert.equal(reqs.filter((r) => r.addChart).length, 4)
  assert.ok(reqs.findIndex((r) => r.deleteEmbeddedObject) < reqs.findIndex((r) => r.addChart),
    'al revés se borraría el que se acaba de crear')
})

test('NINGUNA SALIDA SE QUEDA MUDA: si no dibuja, dice por qué', async () => {
  // Es el defecto que este archivo pagó: no se dibujó nada y el log no dijo nada.
  const dichos = []
  const warn = console.warn
  console.warn = (m) => dichos.push(String(m))
  try {
    assert.deepEqual(await requestsDeGraficos(fake([]), 'f', 7, undefined, SERIES), [])
    assert.deepEqual(await requestsDeGraficos({ getCharts: async () => { throw new Error('429') } }, 'f', 7, ANEXO, SERIES), [])
    assert.deepEqual(await requestsDeGraficos(fake([]), 'f', 7, ANEXO, {}), [])
    // Y una serie que falta NO cancela las otras tres: media portada es mejor que ninguna.
    const parcial = await requestsDeGraficos(fake([]), 'f', 7, ANEXO, { ...SERIES, pagos: null })
    assert.equal(parcial.filter((r) => r.addChart).length, 3)
  } finally { console.warn = warn }
  assert.ok(dichos.some((d) => d.includes('_CAJA_ANEXO')), 'sin el sheetId del anexo se dice cuál falta')
  assert.ok(dichos.some((d) => d.includes('429')), 'el error de la API se propaga al log, no se traga')
  assert.ok(dichos.some((d) => d.includes('pagos')), 'la serie que falta se nombra')
})

test('el cliente de Google expone getCharts: sin eso el módulo no puede borrar', () => {
  // Se verifica sobre el FUENTE porque instanciar el cliente pide credenciales. Un método que no existe
  // haría fallar el `catch` genérico y el skip se vería igual que un 429 — dos causas, un solo síntoma.
  const src = readFileSync(new URL('./google.mjs', import.meta.url), 'utf8')
  assert.match(src, /async getCharts\(fileId\)/, 'falta el lector de gráficos en el cliente')
  assert.match(src, /charts\(chartId,spec\(title\)\)/, 'y tiene que traer el título')
})
