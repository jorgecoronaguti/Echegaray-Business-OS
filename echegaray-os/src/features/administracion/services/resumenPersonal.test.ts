// EL PIE DEL LISTADO DE PERSONAL, PROBADO SIN BASE.
//
// Tres defectos que se pintan en verde y son falsos:
//   1. «EN OBRA HOY 0» cuando la vista de presencia no se pudo leer — dice que no vino nadie.
//   2. «EN OBRA HOY» contado por la ASIGNACIÓN en vez de por la fichada — el rótulo promete
//      presencia y muestra otra cosa. (Es el defecto del Sheet que escondió $292,8 M con otra ropa:
//      el número correcto y la palabra que lo nombra, no.)
//   3. «HH DEL MES 0» cuando la lectura de horas falló.

import test from 'node:test'
import assert from 'node:assert/strict'
import { metricasCanonicas, type FilaDelPie } from './resumenPersonal.ts'
import type { MarcaDeHoy } from './pulsoDelPlantel.ts'

const P: FilaDelPie[] = [
  { id: 'a', obra_actual_id: 'o1', cuadrilla_id: 'c1', en_la_empresa: true },
  { id: 'b', obra_actual_id: 'o1', cuadrilla_id: null, en_la_empresa: true },
  { id: 'c', obra_actual_id: null, cuadrilla_id: null, en_la_empresa: true },
]
// «a» fichó y sigue adentro; «b» está ASIGNADA a la obra pero no fichó. Son dos preguntas distintas.
const MARCAS = new Map<string, MarcaDeHoy>([['a', { persona_id: 'a', estado: 'activo' }]])
const HH = new Map<string, number>([['a', 168], ['b', 8.5]])
const rot = (m: { rotulo: string }[]) => m.map((x) => x.rotulo)
const val = (m: { rotulo: string; valor: string }[], r: string) => m.find((x) => x.rotulo === r)?.valor

test('EN OBRA HOY cuenta la FICHADA, no la asignación', () => {
  const m = metricasCanonicas({
    filtro: 'plantel', buscando: false, personas: P, marcas: MARCAS, hh: HH,
    hoyDisponible: true, hhDisponible: true,
  })
  // Dos personas están asignadas a «o1». Sólo una fichó. El rótulo dice HOY: gana la fichada.
  assert.equal(val(m, 'EN OBRA HOY'), '1')
  assert.equal(val(m, 'PLANTEL'), '3')
  assert.equal(val(m, 'SIN ASIGNAR'), '1')
})

test('una fuente que no se pudo leer NO publica su cifra en cero', () => {
  const m = metricasCanonicas({
    filtro: 'plantel', buscando: false, personas: P, marcas: MARCAS, hh: HH,
    hoyDisponible: false, hhDisponible: false,
  })
  assert.ok(!rot(m).includes('EN OBRA HOY'), '«EN OBRA HOY 0» diría que no vino nadie a trabajar')
  assert.ok(!rot(m).includes('HH DEL MES'), '«HH DEL MES 0» diría que el plantel no trabajó')
  assert.deepEqual(rot(m), ['PLANTEL', 'SIN ASIGNAR'])
})

test('HH DEL MES suma lo imputado y quien no tiene registro no baja el total a cero', () => {
  const m = metricasCanonicas({
    filtro: 'plantel', buscando: false, personas: P, marcas: MARCAS, hh: HH,
    hoyDisponible: true, hhDisponible: true,
  })
  assert.equal(val(m, 'HH DEL MES'), '176,5 h')
})

test('el rótulo del conjunto sigue al filtro, y a los inactivos no se les pregunta por hoy', () => {
  const buscando = metricasCanonicas({
    filtro: 'plantel', buscando: true, personas: P, marcas: MARCAS, hh: HH,
    hoyDisponible: true, hhDisponible: true,
  })
  assert.equal(buscando[0].rotulo, 'COINCIDEN')

  const inactivos = metricasCanonicas({
    filtro: 'inactivos', buscando: false, personas: P, marcas: MARCAS, hh: HH,
    hoyDisponible: true, hhDisponible: true,
  })
  assert.deepEqual(rot(inactivos), ['INACTIVOS'])
})

test('SIN ASIGNAR se enciende en ámbar sólo cuando hay alguien', () => {
  const conTodos: FilaDelPie[] = P.map((p) => ({ ...p, obra_actual_id: 'o1' }))
  const m = metricasCanonicas({
    filtro: 'plantel', buscando: false, personas: conTodos, marcas: MARCAS, hh: HH,
    hoyDisponible: true, hhDisponible: true,
  })
  assert.equal(m.find((x) => x.rotulo === 'SIN ASIGNAR')?.tono, 'ink')
})

