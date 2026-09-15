// UN DÍA DEJADO «SIN HORAS» EN LA WEB NO FRENA A LA PLANILLA — dueño, 15/09/2026: «quiero dejar sin
// hs una celda para completar más tarde».
//
// Vaciar una celda BORRA la fila (`registros_hh` exige horas > 0) y no deja marca. Lo que este test
// fija es el contrato con el importador: sin fila no hay nada que «gane la web», así que si JORNALES
// trae horas para ese día las escribe — la planilla completa el hueco. Y al revés: lo que quedó en
// el día después de vaciar (una extra corregida a mano) sigue protegiendo el día entero.
//
// LA MUTACIÓN QUE PONE ESTO ROJO: que alguien agregue una lápida del vaciado que proteja el día, o
// que `separarLoQueGanaLaWeb` empiece a proteger días sin filas de la web.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { separarLoQueGanaLaWeb, pisarLoDeLaWeb } from './jornales-a-registros-hh.mjs'

const dePlanilla = (extra = {}) => ({
  persona_id: 'p1', fecha: '2026-09-08', obra_canonica_id: 'obra-a', horas: 9, tipo_hora: 'normal', ...extra,
})

test('EL DÍA VACIADO (sin filas) LO COMPLETA LA PLANILLA', () => {
  // Otro día de la misma persona, corregido a mano, no protege el día vaciado.
  const otroDia = {
    id: 'r0', persona_id: 'p1', fecha: '2026-09-07', obra_canonica_id: 'obra-a', horas: 8,
    tipo_hora: 'normal', fuente_legacy: 'web:correccion-horas', actualizado_por: 'u-admin',
  }
  const r = separarLoQueGanaLaWeb([dePlanilla()], [otroDia])
  assert.deepEqual(r.filas, [dePlanilla()])
  assert.equal(r.ganaLaWeb.length, 0)
  const pisa = pisarLoDeLaWeb(r.filas, r.existentes, { hoy: '2026-09-15' })
  assert.deepEqual(pisa.intocables, [])
  assert.deepEqual(pisa.pisar, [])
})

test('lo que quedó en el día después de vaciar (una extra a mano) sigue protegiendo el día', () => {
  const extra = {
    id: 'r1', persona_id: 'p1', fecha: '2026-09-08', obra_canonica_id: 'obra-a', horas: 2,
    tipo_hora: 'extra_50', fuente_legacy: 'web:correccion-horas', actualizado_por: 'u-admin',
  }
  const r = separarLoQueGanaLaWeb([dePlanilla()], [extra])
  assert.equal(r.filas.length, 0)
  assert.equal(r.ganaLaWeb.length, 1)
})
