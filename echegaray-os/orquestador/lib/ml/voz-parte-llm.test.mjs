// LA ESCOTILLA DEL MODELO: apagada por defecto, y cuando está prendida no puede inventar personas.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { completarConModelo, fallaClara } from './voz-parte-llm.mjs'
import { proponerParte } from './voz-parte.mjs'
import { CONTEXTO } from './voz-parte.fixtures.mjs'

const RARO = 'Che mirá lo que pasó hoy con la gente del galpón que vino temprano y se quedó hasta tarde con todo el tema del hierro.'

test('APAGADA por defecto: sin ORQ_VOZ_LLM=1 no llama a nadie', async () => {
  let llamadas = 0
  const p = proponerParte(RARO, CONTEXTO)
  const r = await completarConModelo(p, CONTEXTO, { pedirTexto: async () => { llamadas++; return { texto: '{}' } }, env: {} })
  assert.equal(llamadas, 0)
  assert.equal(r, p)
})

test('prendida, sólo corre si las reglas fallaron en algo claro', async () => {
  let llamadas = 0
  const pedirTexto = async () => { llamadas++; return { texto: '{"personas":[]}' } }
  const bien = proponerParte('Argüello ocho horas en losa. Navarro nueve horas en contrapiso. Mansilla siete horas en losa.', CONTEXTO)
  assert.equal(fallaClara(bien), false)
  await completarConModelo(bien, CONTEXTO, { pedirTexto, env: { ORQ_VOZ_LLM: '1' } })
  assert.equal(llamadas, 0)
})

test('lo que devuelve el modelo entra DUDOSO y sólo con ids de la obra', async () => {
  const p = proponerParte(RARO, CONTEXTO)
  assert.equal(fallaClara(p), true)
  const pedirTexto = async () => ({ texto: JSON.stringify({ personas: [
    { persona_id: 'p-navarro', estado: 'presente', horas: 8, tarea_id: 't-losa' },
    { persona_id: 'inventado', estado: 'presente', horas: 8 },
    { persona_id: 'p-quiroz', estado: 'presente', horas: 99, tarea_id: 't-no-existe' },
  ] }) })
  const r = await completarConModelo(p, CONTEXTO, { pedirTexto, env: { ORQ_VOZ_LLM: '1' } })
  assert.deepEqual(r.personas.map((f) => f.persona_id), ['p-navarro', 'p-quiroz'])
  assert.ok(r.personas.every((f) => f.dudoso && f.origen === 'modelo'))
  assert.equal(r.personas[1].horas, null)
  assert.equal(r.personas[1].tarea_id, null)
})

test('si el modelo falla, el dictado sigue con lo de las reglas', async () => {
  const p = proponerParte(RARO, CONTEXTO)
  const r = await completarConModelo(p, CONTEXTO, { pedirTexto: async () => { throw new Error('sin crédito') }, env: { ORQ_VOZ_LLM: '1' } })
  assert.equal(r, p)
})
