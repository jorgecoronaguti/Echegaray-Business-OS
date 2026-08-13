import test from 'node:test'
import assert from 'node:assert/strict'
import {
  SERIE_BADLAR, SERIE_LEIDA_EL, BCRA_URL, BCRA_ID_VARIABLE, aFraccion, parseSerieBcra,
  ultimaObservacion, rangoDeLaSerie, contrastarBadlar, traerSerieBcra, TOLERANCIA_PP,
} from './badlar-bcra.mjs'

// La forma EXACTA en que responde la API v4.0 (recortada a tres ruedas), tal como se leyó el 13/08.
const RESPUESTA_BCRA = {
  status: 200,
  results: [{
    idVariable: 7,
    detalle: [
      { idVariable: 7, fecha: '2026-08-11', valor: 22.81250000000 },
      { idVariable: 7, fecha: '2026-08-10', valor: 21.62500000000 },
      { idVariable: 7, fecha: '2026-08-07', valor: 21.50000000000 },
    ],
  }],
}

test('la respuesta del BCRA se lee en fracción y ordenada por fecha, no como viene', () => {
  const s = parseSerieBcra(RESPUESTA_BCRA)
  assert.equal(s.length, 3)
  assert.deepEqual(s.map((p) => p.fecha), ['2026-08-07', '2026-08-10', '2026-08-11'])
  assert.equal(s[2].valor, 0.228125) // 22,8125% → fracción
  assert.equal(aFraccion(22.8125), 0.228125)
})

test('si el BCRA cambia el shape, la serie sale VACÍA — no a medias ni rellenada', () => {
  for (const basura of [null, undefined, {}, { results: [] }, { results: [{}] }, { results: [{ detalle: 'x' }] }, 'texto']) {
    assert.deepEqual(parseSerieBcra(basura), [], `${JSON.stringify(basura)} debería dar serie vacía`)
  }
  // Una rueda rota no contamina a las sanas, pero tampoco entra con un valor inventado.
  const mixta = { results: [{ detalle: [{ fecha: '2026-08-11', valor: 22.8125 }, { fecha: 'ayer', valor: 21 }, { fecha: '2026-08-10', valor: 'nada' }] }] }
  assert.deepEqual(parseSerieBcra(mixta), [{ fecha: '2026-08-11', valor: 0.228125 }])
})

test('el mínimo, el máximo y las ruedas SALEN de la serie: no son tres números tipeados aparte', () => {
  const r = rangoDeLaSerie(SERIE_BADLAR)
  assert.equal(r.ruedas, SERIE_BADLAR.length)
  assert.equal(r.desde, '2026-07-20')
  assert.equal(r.hasta, '2026-08-11')
  assert.equal(r.min, 0.20875)
  assert.equal(r.min_el, '2026-08-05')
  assert.equal(r.max, 0.228125)
  assert.equal(r.max_el, '2026-08-11')
  // Y se mueven con la serie: si alguien agrega una rueda, el rango la refleja sin tocar nada más.
  const mas = [...SERIE_BADLAR, { fecha: '2026-08-12', valor: 0.30 }]
  assert.equal(rangoDeLaSerie(mas).max, 0.30)
  assert.equal(rangoDeLaSerie(mas).ruedas, SERIE_BADLAR.length + 1)
  assert.equal(ultimaObservacion(mas).fecha, '2026-08-12')
  assert.equal(rangoDeLaSerie([]), null)
  assert.equal(ultimaObservacion([]), null)
})

// ═══ EL DEFECTO QUE ESTE ARCHIVO EXISTE PARA ATRAPAR ═══
// El auditor lo dijo así: "una Badlar mal tipeada pero plausible deja los 11 tests en verde". Un valor
// escrito a mano no tiene control posible contra sí mismo; el único juez es la serie del BCRA.
test('una Badlar mal tipeada pero PLAUSIBLE se caza contra el BCRA', () => {
  const serie = parseSerieBcra(RESPUESTA_BCRA)
  const malCargada = { valor: 0.225, fecha: '2026-08-11' } // 22,5%: verosímil, y falso
  const c = contrastarBadlar(malCargada, serie)
  assert.equal(c.estado, 'mal_cargada')
  assert.equal(c.publicado, 0.228125)
  assert.ok(c.diferencia_pp > TOLERANCIA_PP)
  assert.match(c.motivo, /22,5000%.*22,8125%/)
})

test('no poder leer el BCRA NO es "coincide": no saber no confirma nada', () => {
  assert.equal(contrastarBadlar({ valor: 0.228125, fecha: '2026-08-11' }, []).estado, 'sin_serie')
  assert.equal(contrastarBadlar({ valor: 0.228125, fecha: '2026-08-11' }, null).estado, 'sin_serie')
  // Una fecha que el BCRA no publica tampoco se da por buena.
  const s = parseSerieBcra(RESPUESTA_BCRA)
  assert.equal(contrastarBadlar({ valor: 0.228125, fecha: '2026-08-09' }, s).estado, 'sin_esa_fecha')
})

test('coincidir NO es estar al día: el derrape de las ruedas posteriores se informa', () => {
  const s = parseSerieBcra(RESPUESTA_BCRA)
  const vieja = contrastarBadlar({ valor: 0.215, fecha: '2026-08-07' }, s)
  assert.equal(vieja.estado, 'coincide')
  assert.equal(vieja.ruedas_posteriores, 2)
  assert.ok(Math.abs(vieja.derrape_pp - 1.3125) < 1e-9, `derrape ${vieja.derrape_pp}`)
  // La última de la serie coincide y no tiene posteriores.
  const alDia = contrastarBadlar({ valor: 0.228125, fecha: '2026-08-11' }, s)
  assert.equal(alDia.estado, 'coincide')
  assert.equal(alDia.ruedas_posteriores, 0)
  assert.equal(alDia.derrape_pp, 0)
})

test('traerSerieBcra no tira nunca: un BCRA caído devuelve motivo, no una excepción', async () => {
  const ok = await traerSerieBcra({ fetch: async () => ({ ok: true, json: async () => RESPUESTA_BCRA }) }, { desde: '2026-08-01' })
  assert.equal(ok.ok, true)
  assert.equal(ok.serie.length, 3)
  assert.ok(ok.url.startsWith(BCRA_URL))
  assert.match(ok.url, /desde=2026-08-01/)

  const caido = await traerSerieBcra({ fetch: async () => ({ ok: false, status: 503 }) }, {})
  assert.equal(caido.ok, false)
  assert.match(caido.motivo, /503/)

  const explota = await traerSerieBcra({ fetch: async () => { throw new Error('ETIMEDOUT') } }, {})
  assert.equal(explota.ok, false)
  assert.match(explota.motivo, /ETIMEDOUT/)

  // Shape cambiado = no hay dato, y se dice. No devuelve ok con serie vacía.
  const raro = await traerSerieBcra({ fetch: async () => ({ ok: true, json: async () => ({ results: [] }) }) }, {})
  assert.equal(raro.ok, false)
  assert.match(raro.motivo, /shape/)
})

test('la serie guardada declara de dónde y cuándo salió', () => {
  assert.equal(BCRA_ID_VARIABLE, 7)
  assert.match(BCRA_URL, /api\.bcra\.gob\.ar\/estadisticas\/v4\.0\/monetarias\/7$/)
  assert.match(SERIE_LEIDA_EL, /^\d{4}-\d{2}-\d{2}$/)
  // Toda rueda con fecha ISO y valor plausible (entre 1% y 300% TNA): un dedazo de coma se ve acá.
  for (const p of SERIE_BADLAR) {
    assert.match(p.fecha, /^\d{4}-\d{2}-\d{2}$/)
    assert.ok(p.valor > 0.01 && p.valor < 3, `${p.fecha}: ${p.valor} no es una Badlar plausible`)
  }
})
