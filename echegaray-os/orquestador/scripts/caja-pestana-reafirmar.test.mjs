// EL EMPAREJAMIENTO request↔gráfico REAL. Por TÍTULO desde el 03/09/2026: antes era por posición
// contra los replies de la API, y `spreadsheetBatchUpdate` filtra los requests vacíos y los que la
// guarda bloquea antes de mandarlos (google.mjs: `requests = g.requests`). La API contesta alineada a
// la lista FILTRADA, así que con un solo request descartado cada especificación se aplicaba al gráfico
// de al lado — sin error, con los cuatro gráficos existiendo, y el log diciendo que salió bien.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { reafirmarEspecificaciones } from './caja-pestana.mjs'

const spec = { title: '⟡ ¿Alcanza la caja?', basicChart: { chartType: 'COMBO', stackedType: 'STACKED', series: [{ targetAxis: 'RIGHT_AXIS' }] } }
const otro = { ...spec, title: 'otro' }
/** Lo que devuelve la relectura de la hoja. */
const enLaHoja = (...pares) => pares.map(([title, chartId]) => ({ chartId, spec: { title } }))

test('cada addChart se reafirma con el chartId que la hoja tiene para SU título', () => {
  const requests = [
    { deleteEmbeddedObject: { objectId: 1 } },
    { addChart: { chart: { spec } } },
    { addChart: { chart: { spec: otro } } },
  ]
  const out = reafirmarEspecificaciones(requests, enLaHoja([spec.title, 777], ['otro', 778]))
  assert.equal(out.length, 2)
  assert.equal(out[0].updateChartSpec.chartId, 777)
  assert.equal(out[0].updateChartSpec.spec.basicChart.series[0].targetAxis, 'RIGHT_AXIS')
  assert.equal(out[1].updateChartSpec.chartId, 778)
})

test('EL ORDEN DE LA HOJA NO IMPORTA: es identidad por título, no posición', () => {
  // LA MUTACIÓN QUE ESTE TEST PROHÍBE: volver a emparejar por índice. Con la hoja devolviendo los
  // gráficos al revés —o con un request descartado por la guarda—, el emparejamiento posicional manda
  // la especificación del combo al gráfico equivocado y los dos siguen existiendo.
  const requests = [{ addChart: { chart: { spec } } }, { addChart: { chart: { spec: otro } } }]
  const out = reafirmarEspecificaciones(requests, enLaHoja(['otro', 778], [spec.title, 777]))
  assert.deepEqual(out.map((r) => r.updateChartSpec.chartId), [777, 778])
  assert.deepEqual(out.map((r) => r.updateChartSpec.spec.title), [spec.title, 'otro'])
})

test('sin un id LEÍDO de la hoja no se reafirma nada: no se adivina un id', () => {
  assert.deepEqual(reafirmarEspecificaciones([{ addChart: { chart: { spec } } }], []), [])
  assert.deepEqual(reafirmarEspecificaciones([{ addChart: { chart: { spec } } }], undefined), [])
  // Un gráfico del dueño con otro título no presta su id.
  assert.deepEqual(reafirmarEspecificaciones([{ addChart: { chart: { spec } } }], enLaHoja(['ajeno', 1])), [])
})
