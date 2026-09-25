// LA COLA DE «DICTAR PARTE», sin base ni modelo: un puerto falso que responde por la forma de la consulta.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { drenarDictados } from './dictado-parte.mjs'
import { CONTEXTO, CASOS } from './ml/voz-parte.fixtures.mjs'

function puertoFalso({ pendientes = [] } = {}) {
  const escritas = []
  const cola = [...pendientes]
  return {
    escritas,
    async query(sql, params = []) {
      if (/set estado = case when intentos/.test(sql) && /tomado_en </.test(sql)) return { rows: [] }
      if (/with siguiente as/.test(sql)) { const f = cola.shift(); return { rows: f ? [f] : [] } }
      if (/from public\.obra_canonica/.test(sql)) return { rows: [CONTEXTO.obra] }
      if (/from public\.personas/.test(sql)) return { rows: CONTEXTO.personas }
      if (/from public\.obra_actividad_control/.test(sql)) return { rows: CONTEXTO.tareas }
      if (/set estado = 'listo'/.test(sql)) { escritas.push({ tipo: 'listo', id: params[0], texto: params[1], propuesta: JSON.parse(params[2]) }); return { rows: [{ id: params[0] }] } }
      if (/then 'error' else 'pendiente' end, motivo = \$2/.test(sql)) { escritas.push({ tipo: 'error', id: params[0], motivo: params[1], definitivo: params[2] }); return { rows: [] } }
      throw new Error(`consulta no esperada: ${sql.slice(0, 60)}`)
    },
  }
}
const fila = (id) => ({ id, obra_id: 'ob', fecha: '2026-09-25', audio_path: `obra/ob/2026-09-25/${id}.wav`, intentos: 1 })

test('una vuelta sin audios no carga el modelo', async () => {
  let cargas = 0
  const r = await drenarDictados({ port: puertoFalso(), bajar: async () => ({ ok: true }), cargarMotor: () => { cargas++; return {} }, transcribir: () => ({}) })
  assert.equal(cargas, 0)
  assert.equal(r.motorCargado, false)
})

test('el audio se transcribe, se interpreta con el plantel de la obra y queda LISTO como propuesta', async () => {
  const port = puertoFalso({ pendientes: [fila('a1'), fila('a2')] })
  let cargas = 0
  const r = await drenarDictados({
    port,
    bajar: async () => ({ ok: true, data: Buffer.from('RIFF').toString('base64') }),
    cargarMotor: () => { cargas++; return { modelo: 'm' } },
    transcribir: () => ({ ok: true, texto: CASOS[0].texto, ms: 100, segundos: 12, modelo: 'm' }),
  })
  assert.equal(cargas, 1, 'el motor se carga UNA vez por vuelta')
  assert.equal(r.hechos.length, 2)
  const listo = port.escritas.find((e) => e.tipo === 'listo')
  assert.equal(listo.propuesta.estado, 'propuesta')
  assert.equal(listo.propuesta.resumen.personas, 6)
})

test('un WAV ilegible va a error sin reintentar; una bajada fallida vuelve a la cola', async () => {
  const port = puertoFalso({ pendientes: [fila('roto'), fila('sinbajar')] })
  await drenarDictados({
    port,
    bajar: async (p) => (p.includes('sinbajar') ? { ok: false, error: 'Storage contestó 500' } : { ok: true, data: '' }),
    cargarMotor: () => ({}),
    transcribir: () => ({ ok: false, error: 'el audio no es un WAV' }),
  })
  const [roto, sinBajar] = port.escritas
  assert.equal(roto.definitivo, true)
  assert.equal(sinBajar.definitivo, false)
})

test('si la interpretación revienta, la fila no queda colgada en transcribiendo', async () => {
  const port = puertoFalso({ pendientes: [fila('x')] })
  await drenarDictados({ port, bajar: async () => ({ ok: true, data: '' }), cargarMotor: () => ({}), transcribir: () => { throw new Error('onnx') } })
  assert.equal(port.escritas[0].tipo, 'error')
  assert.match(port.escritas[0].motivo, /onnx/)
})
