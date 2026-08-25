import { test } from 'node:test'
import assert from 'node:assert/strict'
import { reafirmarEspecificaciones } from './caja-pestana.mjs'

const spec = { title: '⟡ ¿Alcanza la caja?', basicChart: { chartType: 'COMBO', stackedType: 'STACKED', series: [{ targetAxis: 'RIGHT_AXIS' }] } }

test('cada addChart se reafirma con su chartId, por posición, salteando los borrados', () => {
  const requests = [
    { deleteEmbeddedObject: { objectId: 1 } },
    { addChart: { chart: { spec } } },
    { addChart: { chart: { spec: { ...spec, title: 'otro' } } } },
  ]
  const respuesta = { replies: [{}, { addChart: { chart: { chartId: 777 } } }, { addChart: { chart: { chartId: 778 } } }] }
  const out = reafirmarEspecificaciones(requests, respuesta)
  assert.equal(out.length, 2)
  assert.equal(out[0].updateChartSpec.chartId, 777)
  assert.equal(out[0].updateChartSpec.spec.basicChart.series[0].targetAxis, 'RIGHT_AXIS')
  assert.equal(out[1].updateChartSpec.chartId, 778)
})

test('sin respuesta (o sin chartId) no se reafirma nada: no se adivina un id', () => {
  assert.deepEqual(reafirmarEspecificaciones([{ addChart: { chart: { spec } } }], undefined), [])
  assert.deepEqual(reafirmarEspecificaciones([{ addChart: { chart: { spec } } }], { replies: [{}] }), [])
})
