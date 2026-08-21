import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SIN_CUADRILLA, iniciales, motivoSinMarca, porCuadrilla, resumenDelDia } from './personas.ts'
import type { Esperado, FilaPresencia, Grupos } from '@/features/administracion/services/presencia'

const p = (persona_id: string): FilaPresencia => ({
  persona_id, nombre_completo: persona_id, categoria: null, puesto: null, fecha: '2026-08-21',
  obra_id: 'o', obra: 'Obra', entrada: '2026-08-21T10:00:00Z', salida: null, incidencias: 0,
  motivo: null, lat: null, lon: null, precision_m: null, origen: 'empleado_web', estado: 'activo',
})
const e = (id: string, cuadrilla: string | null): Esperado => ({
  id, nombre_completo: id, categoria: null, obra_actual_id: 'o', obra_actual: 'Obra', cuadrilla,
})

test('QUIEN MARCÓ Y NO ESTÁ EN EL PLANTEL NO DESAPARECE: cae en «sin cuadrilla»', () => {
  // El defecto que atrapa: cruzar sólo contra el plantel esperado borra de la pantalla a alguien
  // que está parado en la obra —un prestado de otra obra, una asignación que venció hoy—.
  const g = porCuadrilla([p('ajeno')], [])
  assert.equal(g.length, 1)
  assert.equal(g[0].nombre, SIN_CUADRILLA)
  assert.equal(g[0].presentes[0].persona_id, 'ajeno')
})

test('«SIN CUADRILLA» VA ÚLTIMO: es el resto, no un grupo más', () => {
  const g = porCuadrilla([p('a'), p('b')], [e('a', null), e('b', 'Cuadrilla 2')])
  assert.deepEqual(g.map((x) => x.nombre), ['Cuadrilla 2', SIN_CUADRILLA])
})

test('LA CUADRILLA SALE DEL PLANTEL, no de la marca', () => {
  const g = porCuadrilla([p('a')], [e('a', 'Cuadrilla 3')])
  assert.equal(g[0].nombre, 'Cuadrilla 3')
})

test('SIN MARCA NUNCA SE ESCRIBE «AUSENTE» NI «0 HORAS»', () => {
  const texto = motivoSinMarca(e('x', 'Cuadrilla 2'))
  assert.equal(texto, 'Cuadrilla 2 · sin registrar')
  assert.doesNotMatch(texto, /ausen|0 h/i)
})

test('EL QUE NO CERRÓ AYER NO CUENTA COMO GENTE EN OBRA', () => {
  // El defecto que atrapa: sumar `faltaSalida` a los presentes publica gente trabajando hace veinte
  // horas. Le falta la salida: son dos estados distintos y la base ya los distingue.
  const g: Grupos = { enObra: [p('a')], cerradas: [], faltaSalida: [p('b')], sinRegistrar: [e('c', null)] }
  const r = resumenDelDia(g, [e('a', null), e('b', null), e('c', null)])
  assert.equal(r.enObra, 1)
  assert.equal(r.sinCerrar, 1)
  assert.equal(r.sinRegistrar, 1)
  assert.equal(r.asignados, 3)
})

test('LAS INICIALES SON DOS, y un nombre vacío no dibuja un círculo mudo', () => {
  assert.equal(iniciales('QUIROGA SEBASTIAN ADOLFO'), 'QS')
  assert.equal(iniciales('Tello'), 'T')
  assert.equal(iniciales('   '), '—')
})
