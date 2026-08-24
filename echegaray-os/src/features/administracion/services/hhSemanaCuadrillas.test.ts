// HH DE LA SEMANA POR CUADRILLA — los tres defectos que hacían mentir a la tarjeta.
//
//  1 · CONTAR UNA AUSENCIA COMO TRABAJO. `registros_hh` guarda las ausencias con horas: si el
//      agrupado no filtra por `tipo_hora`, la cuadrilla que faltó el jueves aparece con la semana
//      completa, y el jefe de obra lee dotación donde hubo un ausente.
//  2 · CONTAR DOS VECES A QUIEN ESTÁ EN DOS CUADRILLAS. Los integrantes son PERÍODOS y nada impide
//      dos abiertos. Sus horas deben verse en las dos filas y NO deben sumar dos veces en el total
//      de la empresa.
//  3 · UNA CUADRILLA SIN REGISTROS NO TRABAJÓ 0. No está en el mapa, y quien dibuja muestra «—».

import test from 'node:test'
import assert from 'node:assert/strict'
import { agruparHHSemana, type RegistroHH, type VinculoVigente } from './hhSemanaCuadrillas.ts'

const reg = (p: Partial<RegistroHH> = {}): RegistroHH => ({
  persona_id: 'p1', obra_canonica_id: 'o1', nombre_obra: 'Escuela San Juan',
  fecha: '2026-08-19', horas: 8, tipo_hora: 'normal', ...p,
})

const SEM = { desde: '2026-08-18', hasta: '2026-08-24' }

test('una ausencia tiene horas y NO es trabajo', () => {
  const r = agruparHHSemana(
    [{ cuadrilla_id: 'c1', persona_id: 'p1' }],
    [reg({ horas: 8 }), reg({ horas: 8, tipo_hora: 'ausencia' })],
    SEM.desde, SEM.hasta,
  )
  assert.equal(r.total, 8, 'sumó la ausencia como si hubiera trabajado')
  assert.equal(r.porCuadrilla.get('c1'), 8)
})

test('quien está en dos cuadrillas suma en las dos filas y UNA sola vez en el total', () => {
  const vinculos: VinculoVigente[] = [
    { cuadrilla_id: 'c1', persona_id: 'p1' },
    { cuadrilla_id: 'c2', persona_id: 'p1' },
  ]
  const r = agruparHHSemana(vinculos, [reg({ horas: 8 })], SEM.desde, SEM.hasta)
  assert.equal(r.porCuadrilla.get('c1'), 8)
  assert.equal(r.porCuadrilla.get('c2'), 8, 'la segunda cuadrilla también trabajó con esa persona')
  assert.equal(r.total, 8, 'el total de la empresa contó dos veces las mismas 8 horas')
})

test('una cuadrilla sin registros NO figura con 0: no se sabe si trabajó', () => {
  const r = agruparHHSemana(
    [{ cuadrilla_id: 'c1', persona_id: 'p1' }, { cuadrilla_id: 'c9', persona_id: 'p9' }],
    [reg({ horas: 8 })],
    SEM.desde, SEM.hasta,
  )
  assert.equal(r.porCuadrilla.has('c9'), false, 'afirmó 0 HH sobre una cuadrilla de la que no sabe nada')
})

test('lo de afuera de la semana no entra, aunque la consulta lo haya traído', () => {
  const r = agruparHHSemana(
    [{ cuadrilla_id: 'c1', persona_id: 'p1' }],
    [reg({ fecha: '2026-08-17' }), reg({ fecha: '2026-08-25' }), reg({ fecha: '2026-08-24' })],
    SEM.desde, SEM.hasta,
  )
  assert.equal(r.total, 8, 'mezcló horas de otra semana en el total de ésta')
})

test('el reparto por obra ordena de más a menos y no pierde al que no tiene obra', () => {
  const r = agruparHHSemana(
    [{ cuadrilla_id: 'c1', persona_id: 'p1' }],
    [
      reg({ obra_canonica_id: 'o1', nombre_obra: 'Escuela', horas: 10 }),
      reg({ obra_canonica_id: 'o2', nombre_obra: 'Depósito', horas: 40 }),
      reg({ obra_canonica_id: null, nombre_obra: null, horas: 3 }),
    ],
    SEM.desde, SEM.hasta,
  )
  assert.deepEqual(r.porObra.map((o) => [o.nombre, o.horas]), [['Depósito', 40], ['Escuela', 10], [null, 3]])
  assert.equal(r.total, 53)
})

test('las HH de quien no está en ninguna cuadrilla entran al total y se declaran aparte', () => {
  // Si se descartaran, la tarjeta de cabecera diría que la semana tuvo menos HH de las que tuvo.
  const r = agruparHHSemana(
    [{ cuadrilla_id: 'c1', persona_id: 'p1' }],
    [reg({ persona_id: 'p1', horas: 8 }), reg({ persona_id: 'p7', horas: 8 })],
    SEM.desde, SEM.hasta,
  )
  assert.equal(r.total, 16)
  assert.equal(r.porCuadrilla.get('c1'), 8, 'le imputó a la cuadrilla horas de alguien que no la integra')
  assert.equal(r.personasFueraDeCuadrilla, 1)
})
