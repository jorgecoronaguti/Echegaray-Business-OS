// Test del razonador productivo con engine FAKE (0 API). Prueba lo esencial del "enchufado":
// assembleReasoningSystem LEE las SKILL.md reales del repo y las mete en el `system` de cada lente,
// y crearRazonadorProductivo se las pasa al engine. No toca la red: el engine es un fake que registra.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { crearRazonadorProductivo } from './fe-multiexperto-wiring.mjs'
import { analizarMultiexperto } from './fe-multiexperto.mjs'

// Config mínima: el wiring sólo la usa para GOVERNANCE_FULL (el resto lo consume el engine, que acá
// es un fake). No llamamos loadConfig para no exigir DATABASE_URL/credenciales en los tests.
function cfg() {
  return { GOVERNANCE_FULL: false }
}

test('el system de cada lente incluye la gobernanza y el conocimiento de SUS skills', async () => {
  const jobs = []
  const fakeEngine = {
    async run(job) {
      jobs.push(job)
      return { result: 'lectura fake', cost: { usd: 0.01 }, raw: { model: job.model } }
    },
  }
  const razonar = crearRazonadorProductivo({ config: cfg(), engine: fakeEngine })
  const res = await analizarMultiexperto({
    pregunta: '¿Conviene pagar hoy?',
    contexto: { caja: { hoy: 1000000 } },
    razonar,
  })

  assert.equal(res.lecturas.length, 3)
  // Cada job de lente lleva un system con gobernanza + el encabezado de conocimiento de sus skills.
  const lecturaJobs = jobs.slice(0, 3) // las 3 lentes corren primero (Promise.all), luego comparación
  for (const j of lecturaJobs) {
    assert.match(j.system, /GOBERNANZA DEL BUSINESS OS/i)
    assert.match(j.system, /CONOCIMIENTO DE TU DOMINIO/i)
  }
  // El conjunto de systems debe mencionar las skills de las tres lentes (leídas del disco por nombre).
  const todos = jobs.map((j) => j.system).join('\n')
  for (const skill of [
    'contabilidad-constructoras',
    'impuestos-construccion',
    'derecho-construccion-contratos',
    'derecho-laboral-construccion',
    'finanzas-tesoreria-construccion',
    'financial-engineering',
  ]) {
    assert.ok(todos.includes(skill), `el system debe incluir la skill ${skill}`)
  }
})

test('el engine recibe modelo barato por defecto y techo de costo', async () => {
  const jobs = []
  const fakeEngine = { async run(job) { jobs.push(job); return { result: 'ok', cost: { usd: 0 }, raw: {} } } }
  const razonar = crearRazonadorProductivo({ config: cfg(), engine: fakeEngine })
  await analizarMultiexperto({ pregunta: 'x', contexto: {}, razonar })
  assert.ok(jobs.length >= 3)
  for (const j of jobs) {
    assert.equal(j.model, 'haiku')
    assert.ok(typeof j.maxCostUsd === 'number' && j.maxCostUsd > 0)
    // Sin tools: es lectura + razonamiento, NO toca nada (read-only, Nivel D).
    assert.ok(!j.tools)
  }
})
