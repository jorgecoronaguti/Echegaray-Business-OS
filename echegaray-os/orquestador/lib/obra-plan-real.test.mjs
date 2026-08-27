import test from 'node:test'
import assert from 'node:assert/strict'
import {
  compararPlanReal, avanceDe, confianzaDe, estadoDelAprendizaje,
  sonComparables, sonConsistentes, afirmacionDe, MINIMO_APRENDIBLE,
} from './obra-plan-real.mjs'

// ── NULL NO ES CERO ──────────────────────────────────────────────────────────────────────────
//
// Es la regla que más plata cuida de este archivo: una actividad sin HH cargadas no rindió cero.

test('sin HH reales no hay rendimiento real, y se dice cuál dato falta', () => {
  const c = compararPlanReal({ unidad: 'm2', cantidad: 100, hh: 50 }, { cantidad: 40, hh: null })
  assert.equal(c.real.hsUnitarias, null)
  assert.equal(c.derivado.desvioProductividadPct, null)
  assert.ok(c.faltantes.includes('HH reales imputadas a la actividad'))
  assert.equal(c.aprendible, false, 'sin rendimiento no se aprende nada')
})

test('cantidad cero no divide: devuelve null, no Infinity', () => {
  const c = compararPlanReal({ unidad: 'm2', cantidad: 0, hh: 50 }, { cantidad: 0, hh: 10 })
  assert.equal(c.plan.hsUnitarias, null)
  assert.equal(c.real.hsUnitarias, null)
})

// ── SE COMPARA POR UNIDAD, NO POR TOTAL ──────────────────────────────────────────────────────

test('una actividad a medio hacer NO se compara contra el plan entero', () => {
  // 100 m² planificados en 200 hs (2 hs/m²). Se hicieron 50 m² en 150 hs.
  // Leído por total: 150 < 200 ⇒ «vamos bien». Leído bien: 3 hs/m² contra 2 ⇒ 50% peor.
  const c = compararPlanReal({ unidad: 'm2', cantidad: 100, hh: 200 }, { cantidad: 50, hh: 150 })
  assert.equal(c.plan.hsUnitarias, 2)
  assert.equal(c.real.hsUnitarias, 3)
  assert.equal(c.derivado.hhPlanAlAvance, 100, 'el plan PARA LO QUE SE HIZO son 100 hs, no 200')
  assert.equal(c.derivado.desvioHhPct, 50)
  assert.equal(c.derivado.desvioProductividadPct, 50)
})

test('el avance medido en obra le gana al deducido de la cantidad', () => {
  assert.equal(avanceDe({ cantidad: 100 }, { cantidad: 20, avancePct: 65 }), 65)
  assert.equal(avanceDe({ cantidad: 100 }, { cantidad: 20 }), 20)
})

test('ejecutar más cantidad que la prevista no da un avance del 130%', () => {
  assert.equal(avanceDe({ cantidad: 100 }, { cantidad: 130 }), 100)
})

// ── LA CONFIANZA VIAJA CON EL DATO ───────────────────────────────────────────────────────────

test('la confianza sale del avance y de qué datos existen', () => {
  assert.equal(confianzaDe({ avance: 100, cantidadReal: 10, hhReal: 5 }), 'alta')
  assert.equal(confianzaDe({ avance: 60, cantidadReal: 10, hhReal: 5 }), 'media')
  assert.equal(confianzaDe({ avance: 30, cantidadReal: 10, hhReal: 5 }), 'baja')
  assert.equal(confianzaDe({ avance: 100, cantidadReal: 10, hhReal: null }), 'baja', 'sin HH no hay confianza alta')
})

test('el arranque de una actividad no enseña rendimiento', () => {
  const c = compararPlanReal({ unidad: 'm3', cantidad: 100, hh: 300 }, { cantidad: MINIMO_APRENDIBLE - 5, hh: 40 })
  assert.equal(c.aprendible, false, 'los primeros metros incluyen armar el frente')
})

// ── LA REFERENCIA MAESTRA NO SE PISA CON UN CASO ─────────────────────────────────────────────

// Cada observación lleva su actividad: dos casos son dos ACTIVIDADES distintas, nunca la misma
// medida dos veces. `n` va como identidad para que los fixtures no se confirmen solos por descuido.
let n = 0
const obs = (hs, extra = {}) => ({ tareaTipoId: 't1', unidad: 'm2', hsUnitarias: hs, confianza: 'alta', actividadId: `act-${++n}`, obraId: `obra-${n}`, ...extra })

test('el primer caso real entra como CANDIDATO, nunca como VALIDADO', () => {
  const r = estadoDelAprendizaje(obs(0.12), [])
  assert.equal(r.estado, 'CANDIDATO')
  assert.equal(r.vecesConfirmado, 1)
})

test('la semilla del xlsm no valida nada — es referencia, no un caso de obra', () => {
  const r = estadoDelAprendizaje(obs(0.12), [{ ...obs(0.12), estado: 'REFERENCIA' }])
  assert.equal(r.estado, 'CANDIDATO', 'confirmar contra la propia referencia sería confirmarse solo')
})

test('un segundo caso comparable y consistente valida', () => {
  const r = estadoDelAprendizaje(obs(0.13), [{ ...obs(0.12), estado: 'CANDIDATO' }])
  assert.equal(r.estado, 'VALIDADO')
  assert.equal(r.vecesConfirmado, 2)
})

test('dos casos que se contradicen NO se promedian: queda CANDIDATO', () => {
  const r = estadoDelAprendizaje(obs(0.50), [{ ...obs(0.12), estado: 'CANDIDATO' }])
  assert.equal(r.estado, 'CANDIDATO')
  assert.match(r.porQue, /no se confirman/)
})

test('la confianza del conjunto no supera la del peor caso que lo sostiene', () => {
  const r = estadoDelAprendizaje(obs(0.13), [{ ...obs(0.12), estado: 'CANDIDATO', confianza: 'baja' }])
  assert.equal(r.estado, 'VALIDADO')
  assert.equal(r.confianza, 'baja')
})

test('distinta unidad o distinta tarea no son comparables', () => {
  assert.equal(sonComparables(obs(1), { ...obs(1), unidad: 'm3' }), false)
  assert.equal(sonComparables(obs(1), { ...obs(1), tareaTipoId: 't2' }), false)
  assert.equal(sonComparables({ unidad: 'm2' }, { unidad: 'm2' }), false, 'sin tipo de tarea no hay comparación')
  assert.equal(sonConsistentes(obs(0.12), obs(0.13)), true)
  assert.equal(sonConsistentes(obs(0.12), obs(0.30)), false)
})

// ── LA FRASE QUE SE GUARDA DICE LOS NÚMEROS, NO UNA OPINIÓN ──────────────────────────────────

test('la afirmación lleva el número, la unidad, el avance y contra qué se comparó', () => {
  const f = afirmacionDe({
    tarea: 'REPLANTEO', obra: 'quattropani', unidad: 'm2',
    hsUnitarias: 0.1159, hsUnitariasPlan: 0.12, desvioPct: -3.4, cantidad: 258.77, avancePct: 100,
  })
  assert.match(f, /REPLANTEO/)
  assert.match(f, /0\.1159 hs\/m2/)
  assert.match(f, /258\.77/)
  assert.match(f, /-3\.4%/)
})

test('sin plan con qué comparar, la afirmación lo dice en vez de inventar un desvío', () => {
  const f = afirmacionDe({ tarea: 'X', obra: 'o', unidad: 'm2', hsUnitarias: 1, hsUnitariasPlan: null, cantidad: 5, avancePct: 100 })
  assert.match(f, /sin rendimiento planificado/)
})

test('la MISMA actividad medida dos veces no se valida a sí misma', () => {
  // Sin esto, dejar pasar una semana bastaría para «confirmar» cualquier rendimiento.
  const r = estadoDelAprendizaje(
    { ...obs(0.12), actividadId: 'a1' },
    [{ ...obs(0.12), actividadId: 'a1', estado: 'CANDIDATO' }],
  )
  assert.equal(r.estado, 'CANDIDATO')
  assert.match(r.porQue, /primer caso/)
})

test('dos actividades de OBRAS distintas sí se confirman', () => {
  const r = estadoDelAprendizaje(
    { ...obs(0.12), actividadId: 'a1', obraId: 'o1' },
    [{ ...obs(0.13), actividadId: 'a2', obraId: 'o2', estado: 'CANDIDATO' }],
  )
  assert.equal(r.estado, 'VALIDADO')
})

test('dos frentes de la MISMA obra no validan: comparten cuadrilla, terreno y clima', () => {
  // La vista `rendimiento_recomendado` ya lo había decidido así. Dos respuestas distintas a
  // «¿esto ya sirve para cotizar?» sería peor que ninguna.
  const r = estadoDelAprendizaje(
    { ...obs(0.12), actividadId: 'a1', obraId: 'o1' },
    [{ ...obs(0.13), actividadId: 'a2', obraId: 'o1', estado: 'CANDIDATO' }],
  )
  assert.equal(r.estado, 'CANDIDATO')
  assert.match(r.porQue, /misma obra/)
})
