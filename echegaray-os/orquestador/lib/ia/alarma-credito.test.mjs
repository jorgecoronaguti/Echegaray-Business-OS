// Alarma de «sin crédito» — SIN RED. `fetch` queda envenenado: si algo de acá intentara hablar con
// api.anthropic.com (o con cualquier host), el test revienta. El 25/09 una prueba vació la cuenta.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { decidir, hhmm, ronda, texto } from './alarma-credito.mjs'

let fetchOriginal
before(() => { fetchOriginal = globalThis.fetch; globalThis.fetch = () => { throw new Error('RED PROHIBIDA en este test') } })
after(() => { globalThis.fetch = fetchOriginal })

const sj = (h) => new Date(`2026-09-25T${h}:00-03:00`)

test('hora de San Juan desde el ts UTC de chat_cost', () => {
  assert.equal(hhmm(new Date('2026-09-25T11:17:26Z')), '08:17')
})

test('sin rechazos por crédito no se avisa nada', () => {
  assert.equal(decidir({ episodio: null, avisado: null }).avisar, false)
})

test('episodio abierto → aviso inmediato; la misma racha no se vuelve a avisar', () => {
  const ep = { inicio: sj('14:00'), recuperadoAt: null, fallas: 4 }
  const a = decidir({ episodio: ep, avisado: sj('08:17').toISOString() })
  assert.equal(a.avisar, true)
  assert.match(a.texto, /🚨 \*\*La API de Anthropic se quedó sin crédito a las 14:00/)
  assert.match(a.texto, /4 llamadas rechazadas/)
  assert.equal(decidir({ episodio: { ...ep, fallas: 30 }, avisado: a.avisado }).avisar, false)
  assert.equal(decidir({ episodio: { ...ep, recuperadoAt: sj('14:20') }, avisado: a.avisado }).avisar, false, 'recuperarse no es un episodio nuevo')
})

test('un episodio nuevo (otro primer rechazo) se avisa aunque haya uno avisado antes', () => {
  const d = decidir({ episodio: { inicio: sj('18:00'), recuperadoAt: null, fallas: 1 }, avisado: sj('14:00').toISOString() })
  assert.equal(d.avisar, true)
  assert.match(d.texto, /1 llamada rechazada\./)
})

test('primera corrida: el corte de esta mañana, ya resuelto, queda como línea de base sin aviso', () => {
  const d = decidir({ episodio: { inicio: sj('08:17'), recuperadoAt: sj('08:30'), fallas: 6 }, avisado: null })
  assert.equal(d.avisar, false)
  assert.equal(d.lineaDeBase, true)
  assert.equal(d.avisado, sj('08:17').toISOString())
})

test('primera corrida con un corte ABIERTO sí avisa', () => {
  assert.equal(decidir({ episodio: { inicio: sj('08:17'), recuperadoAt: null }, avisado: null }).avisar, true)
})

test('un episodio que se abrió y cerró entre dos rondas se avisa igual (con la hora en que volvió)', () => {
  const d = decidir({ episodio: { inicio: sj('14:01'), recuperadoAt: sj('14:04'), fallas: 2 }, avisado: sj('08:17').toISOString() })
  assert.equal(d.avisar, true)
  assert.match(d.texto, /volvió a andar a las 14:04/)
})

test('texto: no pide datos al dueño (25/09: nada de «¿cuánto cargaste?»)', () => {
  assert.doesNotMatch(texto({ inicio: sj('10:00'), recuperadoAt: null }), /cuánto|contest/i)
})

function dobles(episodio, avisado = null) {
  const avisos = []; const guardado = { v: avisado }
  return { avisos, guardado, puertos: {
    leerEpisodio: async () => episodio, leerAvisado: async () => guardado.v,
    guardarAvisado: async (id) => { guardado.v = id }, avisar: async (t) => { avisos.push(t) },
  } }
}

test('ronda: avisa una vez y guarda; la segunda ronda calla', async () => {
  const d = dobles({ inicio: sj('14:00'), recuperadoAt: null, fallas: 2 }, sj('08:17').toISOString())
  assert.equal((await ronda({ puertos: d.puertos })).avisar, true)
  assert.equal((await ronda({ puertos: d.puertos })).avisar, false)
  assert.equal(d.avisos.length, 1)
  assert.equal(d.guardado.v, sj('14:00').toISOString())
})

test('ronda: si Mattermost falla NO se marca como avisado (la próxima ronda reintenta)', async () => {
  const d = dobles({ inicio: sj('14:00'), recuperadoAt: null, fallas: 2 }, sj('08:17').toISOString())
  d.puertos.avisar = async () => { throw new Error('Mattermost 502') }
  await assert.rejects(ronda({ puertos: d.puertos }), /502/)
  assert.equal(d.guardado.v, sj('08:17').toISOString())
})
