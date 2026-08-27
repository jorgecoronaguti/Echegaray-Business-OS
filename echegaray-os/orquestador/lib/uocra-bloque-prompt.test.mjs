import test from 'node:test'
import assert from 'node:assert/strict'
import { bloqueUocra, origenDeLaEscala, periodoDe } from './uocra-bloque-prompt.mjs'
import { ESCALA_VERIFICADA, ORIGEN_ACUERDO, ORIGEN_PROYECCION } from './uocra-paritaria.mjs'

// El defecto real: el prompt llevaba la escala de JULIO rotulada «VIGENTES … VERIFICADO» mientras la
// canónica de agosto estaba 9,1 % más arriba. Cada presupuesto de agosto subestimó la mano de obra.

test('el bloque publica la escala CANÓNICA, no una copia pegada a mano', () => {
  const b = bloqueUocra({ hoyISO: '2026-08-26T12:00:00Z' })
  // Los cuatro valores de agosto, tal como los declara la fuente verificada.
  for (const v of Object.values(ESCALA_VERIFICADA)) {
    assert.ok(b.includes(v.toLocaleString('es-AR')), `falta ${v} en el bloque`)
  }
  // Y NINGUNO de los de julio, que son los que estaban pegados en el prompt.
  for (const viejo of ['4.948', '5.375', '5.817', '6.800']) {
    assert.ok(!b.includes(viejo), `el bloque todavía trae el valor de julio ${viejo}`)
  }
})

test('dentro de la vigencia dice ACUERDO; pasada, dice PROYECCIÓN y avisa', () => {
  assert.equal(origenDeLaEscala('2026-08-31'), ORIGEN_ACUERDO, 'el último día del acuerdo sigue siendo acuerdo')
  assert.equal(origenDeLaEscala('2026-09-01'), ORIGEN_PROYECCION)

  const enVigencia = bloqueUocra({ hoyISO: '2026-08-26' })
  assert.match(enVigencia, /ACUERDO FIRMADO/)

  // Un presupuesto armado sobre una paritaria sin firmar es una apuesta: quien lo firma tiene
  // derecho a saberlo, y por eso el bloque le ORDENA al modelo decirlo.
  const despues = bloqueUocra({ hoyISO: '2026-09-15' })
  assert.match(despues, /PROYECCIÓN/)
  assert.match(despues, /DECILE AL USUARIO/)
})

test('el sereno va aparte: se paga por mes y no se compara contra un jornal', () => {
  const b = bloqueUocra({ hoyISO: '2026-08-26' })
  assert.match(b, /por MES, no por hora/)
})

test('periodoDe recorta el mes sin inventar zona horaria', () => {
  assert.equal(periodoDe('2026-08-26T23:59:00Z'), '2026-08')
  assert.equal(periodoDe(''), '')
})
