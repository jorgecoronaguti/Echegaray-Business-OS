import { test } from 'node:test'
import assert from 'node:assert/strict'
import { decidirCeldaDia, formatearHoras, type EntradaCeldaDia } from './celdaDia.ts'

// EL DEFECTO QUE ESTOS TESTS ATRAPAN: que la capa de horas vuelva a hablar de presencia («sin horas»
// pintado como falta) o que la capa de presencia vuelva a inventar un «no fichó» donde sólo hay
// silencio. Cada capa mira su dato y nada más.

const habil = (x: Partial<EntradaCeldaDia>): EntradaCeldaDia =>
  ({ presencia: 'sin_marca', horas: null, dia: 'habil', ...x })

test('presente sin horas: ● verde arriba, abajo vacío con «sin cargar» neutro — no es una falta', () => {
  const c = decidirCeldaDia(habil({ presencia: 'ficho' }))
  assert.equal(c.arriba.simbolo, '●')
  assert.equal(c.arriba.tono, 'pos')
  assert.equal(c.abajo.texto, '')
  assert.equal(c.abajo.sinCargar, true)
  assert.match(c.titulo, /no es una falta/)
  assert.doesNotMatch(c.titulo, /ausen/i)
})

test('horas sin fichaje: el número en tinta y arriba NADA — jamás «no fichó»', () => {
  const c = decidirCeldaDia(habil({ horas: 8 }))
  assert.equal(c.abajo.texto, '8,0')
  assert.equal(c.abajo.tono, 'tinta')
  assert.equal(c.abajo.sinCargar, false)
  assert.equal(c.arriba.simbolo, '')
  assert.equal(c.arriba.tono, 'ninguno')
  assert.doesNotMatch(c.titulo, /no fich/i)
})

test('las dos verdades juntas: fichó Y tiene horas → ● y el número, cada uno en su capa', () => {
  const c = decidirCeldaDia(habil({ presencia: 'ficho', horas: 9.5 }))
  assert.equal(c.arriba.simbolo, '●')
  assert.equal(c.abajo.texto, '9,5')
  assert.equal(c.titulo, 'Fichó · 9,5 h cargadas')
})

test('ausencia declarada: A en rojo arriba, abajo vacío y SIN marco de «sin cargar»', () => {
  const c = decidirCeldaDia(habil({ presencia: 'ausente', motivo: 'Enfermedad' }))
  assert.equal(c.arriba.simbolo, 'A')
  assert.equal(c.arriba.tono, 'neg')
  assert.equal(c.abajo.sinCargar, false)
  assert.equal(c.titulo, 'Ausencia declarada: enfermedad')
})

test('licencia: L neutra — no es positivo ni problema', () => {
  const c = decidirCeldaDia(habil({ presencia: 'licencia', motivo: 'Vacaciones' }))
  assert.equal(c.arriba.simbolo, 'L')
  assert.equal(c.arriba.tono, 'neutro')
  assert.equal(c.abajo.sinCargar, false)
  assert.equal(c.titulo, 'Licencia: vacaciones')
})

test('día hábil pasado sin nada: nada arriba, «sin cargar» abajo — el silencio se ve, no se acusa', () => {
  const c = decidirCeldaDia(habil({}))
  assert.equal(c.arriba.simbolo, '')
  assert.equal(c.abajo.sinCargar, true)
  assert.equal(c.titulo, 'Sin marca de entrada/salida · Sin horas cargadas: no es una falta')
})

test('no laborable sin horas: guión inerte y sin reclamo; con horas (sábado trabajado) el número', () => {
  const sin = decidirCeldaDia(habil({ dia: 'no_laborable' }))
  assert.equal(sin.abajo.texto, '—')
  assert.equal(sin.abajo.tono, 'inerte')
  assert.equal(sin.abajo.sinCargar, false)
  assert.equal(sin.arriba.titulo, '')
  const con = decidirCeldaDia(habil({ dia: 'no_laborable', horas: 4 }))
  assert.equal(con.abajo.texto, '4,0')
})

test('futuro: no se pinta nada y no se reclama nada', () => {
  const c = decidirCeldaDia(habil({ dia: 'futuro' }))
  assert.equal(c.arriba.simbolo, '')
  assert.equal(c.abajo.texto, '')
  assert.equal(c.abajo.sinCargar, false)
  assert.equal(c.titulo, '')
})

test('cero horas NO es «sin cargar»: 0 es una afirmación y se escribe', () => {
  const c = decidirCeldaDia(habil({ horas: 0 }))
  assert.equal(c.abajo.texto, '0,0')
  assert.equal(c.abajo.sinCargar, false)
})

test('el color semántico vive SÓLO en la capa de presencia: la de horas nunca sale pos/neg', () => {
  const casos: EntradaCeldaDia[] = [
    habil({ presencia: 'ficho', horas: 8 }), habil({ presencia: 'ausente' }), habil({ horas: 12 }),
    habil({ presencia: 'licencia' }), habil({ dia: 'no_laborable' }), habil({ dia: 'futuro' }),
  ]
  for (const e of casos) {
    const c = decidirCeldaDia(e)
    assert.ok(['tinta', 'inerte', 'vacio'].includes(c.abajo.tono), JSON.stringify(e))
  }
})

test('formatearHoras: una sola forma de escribir horas', () => {
  assert.equal(formatearHoras(8), '8,0')
  assert.equal(formatearHoras(7.25), '7,3')
  assert.equal(formatearHoras(10), '10,0')
})
