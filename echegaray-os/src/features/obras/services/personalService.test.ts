import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  bajadaCosto, hhAcumuladas, hhDeSemana, hhSemanaPorPersona, horasPorSemana, legajosSinCategoria,
  lunesDeSemana, numeroDeSemana, rotuloSemana, sublineaPersonalTelefono,
} from './personalService.ts'

const r = (persona_id: string | null, lunes: string, horas: number, tipo_hora = 'normal') =>
  ({ persona_id, fecha_inicio_semana: lunes, horas, tipo_hora })

test('el lunes y el rótulo de la semana salen del texto ISO, sin huso', () => {
  assert.equal(lunesDeSemana('2026-09-23'), '2026-09-21') // miércoles → lunes 21
  assert.equal(lunesDeSemana('2026-09-20'), '2026-09-14') // domingo → lunes anterior
  assert.equal(rotuloSemana('2026-09-09'), 'semana del 07/09 al 12/09')
  assert.equal(numeroDeSemana('2026-09-16'), 38)
})

test('HH de la semana y acumuladas: sin registros es null, nunca 0; la ausencia no suma', () => {
  const regs = [r('a', '2026-09-21', 9), r('b', '2026-09-21', 4.5), r('a', '2026-09-14', 40), r('a', '2026-09-21', 8, 'ausencia')]
  assert.equal(hhDeSemana(regs, '2026-09-21'), 13.5)
  assert.equal(hhDeSemana(regs, '2026-09-07'), null)
  assert.equal(hhAcumuladas(regs), 53.5)
  assert.equal(hhAcumuladas([]), null)
  assert.deepEqual([...hhSemanaPorPersona(regs, '2026-09-21')], [['a', 9], ['b', 4.5]])
})

test('«Horas por semana» trae cinco semanas, la actual primero, con barra sobre la más alta', () => {
  const regs = [r('a', '2026-09-21', 498), r('a', '2026-09-14', 648), r('a', '2026-08-31', 672)]
  const s = horasPorSemana(regs, '2026-09-23')
  assert.deepEqual(s.map((x) => x.rotulo), ['21/09', '14/09', '07/09', '31/08', '24/08'])
  assert.deepEqual(s.map((x) => x.horas), [498, 648, null, 672, null])
  assert.equal(s[3].pct, 100)
  assert.equal(s[0].pct, 74)
  assert.equal(s[2].pct, null)
})

test('los legajos sin categoría se cuentan sobre las asignaciones vigentes', () => {
  const l = legajosSinCategoria([
    { hasta: null, persona_categoria: null }, { hasta: null, persona_categoria: 'oficial' }, { hasta: '2026-01-01', persona_categoria: null },
  ])
  assert.deepEqual(l, { sin: 1, total: 2 })
  assert.equal(bajadaCosto({ sin: 24, total: 30 }), '24 de 30 legajos sin categoría de convenio')
  assert.equal(sublineaPersonalTelefono({ cuadrilla: 'Cuadrilla 1', rol: 'responsable', persona_categoria: 'oficial' }, 'Oficial'), 'Cuadrilla 1 · oficial · responsable')
  assert.equal(sublineaPersonalTelefono({ cuadrilla: null, rol: 'integrante', persona_categoria: null }, null), 'sin cuadrilla')
})

test('un legajo en MAYÚSCULAS se muestra en Título (08), respetando partículas y lo ya escrito con su forma', async () => {
  const { nombreEnTitulo } = await import('./personalService.ts')
  assert.equal(nombreEnTitulo('RUBÉN QUIROGA'), 'Rubén Quiroga')
  assert.equal(nombreEnTitulo('JUAN DE LA FUENTE'), 'Juan de la Fuente')
  assert.equal(nombreEnTitulo('MARÍA DEL CARMEN PÉREZ Y GÓMEZ'), 'María del Carmen Pérez y Gómez')
  assert.equal(nombreEnTitulo('DE LOS SANTOS, JOSÉ'), 'De los Santos, José')
  assert.equal(nombreEnTitulo('ÁNGEL GARCÍA-LÓPEZ'), 'Ángel García-López')
  // Ya escrito con su forma: no se toca (una «Mc» o una partícula puesta a mano se perdería).
  assert.equal(nombreEnTitulo('Rubén Quiroga'), 'Rubén Quiroga')
  assert.equal(nombreEnTitulo('juan pérez'), 'juan pérez')
  assert.equal(nombreEnTitulo(null), null)
  assert.equal(nombreEnTitulo(''), '')
})
