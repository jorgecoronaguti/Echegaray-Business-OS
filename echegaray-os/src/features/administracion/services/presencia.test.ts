import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  agrupar, filtrarGrupos, jornadaLarga, lecturaDePunto, mapa, minutosDesde, reloj, resumen,
} from './presencia.ts'
import type { Esperado, FilaPresencia } from './presencia.ts'

const f = (p: Partial<FilaPresencia>): FilaPresencia => ({
  persona_id: p.persona_id ?? 'x', nombre_completo: 'Quien Sea', categoria: null, puesto: null,
  fecha: '2026-08-20', obra_id: 'o', obra: 'Obra', entrada: null, salida: null, incidencias: 0,
  motivo: null, lat: null, lon: null, precision_m: null, origen: 'empleado_web',
  estado: 'sin_registrar', ...p,
})
const e = (id: string, nombre: string): Esperado => ({
  id, nombre_completo: nombre, categoria: null, obra_actual_id: 'o', obra_actual: 'Obra', cuadrilla: null,
})

test('NADIE ESTÁ EN DOS GRUPOS: el que marcó sale de «sin registrar»', () => {
  // El defecto que atrapa: contar dos veces al mismo operario —una en obra y otra como ausente—
  // convierte el renglón de arriba en un número que no cierra con nada.
  const g = agrupar(
    [f({ persona_id: 'a', estado: 'activo', entrada: '2026-08-20T10:00:00Z' })],
    [e('a', 'Ya Marcó'), e('b', 'No Marcó')],
  )
  assert.deepEqual(g.enObra.map((x) => x.persona_id), ['a'])
  assert.deepEqual(g.sinRegistrar.map((x) => x.id), ['b'])
})

test('el día sin salida de ayer NO cuenta como activo', () => {
  // Alguien que entró ayer y nunca cerró no está trabajando hace veinte horas: le falta la salida.
  const g = agrupar([
    f({ persona_id: 'a', estado: 'activo', entrada: '2026-08-20T10:00:00Z' }),
    f({ persona_id: 'b', estado: 'falta_salida', entrada: '2026-08-19T10:00:00Z' }),
  ])
  assert.equal(g.enObra.length, 1)
  assert.equal(g.faltaSalida.length, 1)
})

test('los que están en obra se ordenan por hora de entrada', () => {
  const g = agrupar([
    f({ persona_id: 'tarde', estado: 'activo', entrada: '2026-08-20T12:00:00Z' }),
    f({ persona_id: 'temprano', estado: 'activo', entrada: '2026-08-20T07:00:00Z' }),
  ])
  assert.deepEqual(g.enObra.map((x) => x.persona_id), ['temprano', 'tarde'])
})

test('el reloj corre desde la entrada, y una entrada en el futuro no da negativo', () => {
  const ahora = Date.parse('2026-08-20T15:38:00Z')
  assert.equal(minutosDesde('2026-08-20T07:58:00Z', ahora), 460)
  assert.equal(reloj(460), '7:40')
  assert.equal(reloj(minutosDesde('2026-08-20T15:33:00Z', ahora)), '0:05')
  // Un reloj mal puesto en el teléfono no puede dibujar una jornada negativa.
  assert.equal(minutosDesde('2026-08-20T18:00:00Z', ahora), null)
  assert.equal(reloj(null), '—')
})

test('a las 9 horas la jornada se marca — casi siempre es una salida sin registrar', () => {
  assert.equal(jornadaLarga(8 * 60 + 59), false)
  assert.equal(jornadaLarga(9 * 60), true)
  assert.equal(jornadaLarga(null), false)
})

test('SIN COORDENADA SE DICE «SIN UBICACIÓN», NO SE INVENTA UN PUNTO', () => {
  // El teléfono puede negar el permiso o estar adentro de un galpón. Rellenar con el punto de la
  // obra haría que un dato inventado se vea idéntico a uno real.
  const sin = lecturaDePunto({ lat: null, lon: null, precision_m: null })
  assert.equal(sin.hay, false)
  assert.equal(sin.texto, 'sin ubicación')
  assert.equal(mapa(null, null), null)
})

test('la precisión se dice, porque 2 km y 5 m no son el mismo dato', () => {
  assert.equal(lecturaDePunto({ lat: -31.5, lon: -68.5, precision_m: 12 }).fiable, true)
  assert.equal(lecturaDePunto({ lat: -31.5, lon: -68.5, precision_m: 400 }).fiable, false)
  assert.match(lecturaDePunto({ lat: -31.5, lon: -68.5, precision_m: 2300 }).texto, /2,3 km/)
  assert.equal(mapa(-31.5, -68.5), 'https://www.google.com/maps?q=-31.5,-68.5')
})

test('el resumen no nombra los grupos vacíos', () => {
  const g = agrupar([f({ persona_id: 'a', estado: 'activo', entrada: '2026-08-20T10:00:00Z' })])
  assert.equal(resumen(g), '1 en obra')
  const g2 = agrupar(
    [f({ persona_id: 'a', estado: 'activo' }), f({ persona_id: 'b', estado: 'cerrada' })],
    [e('c', 'Nadie')],
  )
  assert.equal(resumen(g2), '1 en obra · 1 ya cerraron · 1 sin registrar')
})

// ═══ EL BUSCADOR DE «EN OBRA AHORA» ═══

test('el buscador filtra DESPUÉS de agrupar: nadie salta de «en obra» a «sin registrar»', () => {
  // El defecto que atrapa, y es el caro: `agrupar` arma «sin registrar» restando de los esperados a
  // los que ya marcaron. Filtrar la presencia CRUDA por texto le sacaría la marca a alguien que sí
  // marcó, y la resta lo devolvería como «sin registrar» — la pantalla diría que un operario que
  // está trabajando no fichó, sobre la única lista que después se mira para discutir una ausencia.
  const g = agrupar(
    [f({ persona_id: 'a', nombre_completo: 'Ramón Gómez', estado: 'activo', entrada: '2026-08-20T10:00:00Z' })],
    [e('a', 'Ramón Gómez'), e('b', 'Juan Pérez')],
  )
  const soloJuan = filtrarGrupos(g, 'juan')
  assert.deepEqual(soloJuan.enObra.map((x) => x.persona_id), [])
  assert.deepEqual(soloJuan.sinRegistrar.map((x) => x.id), ['b'])

  const soloRamon = filtrarGrupos(g, 'gomez')
  assert.deepEqual(soloRamon.enObra.map((x) => x.persona_id), ['a'])
  // Y NO reaparece del otro lado.
  assert.deepEqual(soloRamon.sinRegistrar.map((x) => x.id), [])
})

test('sin texto los cuatro grupos quedan como estaban', () => {
  const g = agrupar(
    [
      f({ persona_id: 'a', nombre_completo: 'Ramón Gómez', estado: 'activo' }),
      f({ persona_id: 'c', nombre_completo: 'Luis Díaz', estado: 'cerrada' }),
      f({ persona_id: 'd', nombre_completo: 'Ana Ruiz', estado: 'falta_salida' }),
    ],
    [e('a', 'Ramón Gómez'), e('b', 'Juan Pérez')],
  )
  assert.deepEqual(filtrarGrupos(g, ''), g)
  assert.deepEqual(filtrarGrupos(g, '   '), g)
})

test('se busca también por la obra, escrita sin acentos', () => {
  const g = agrupar([f({ persona_id: 'a', nombre_completo: 'Ramón Gómez', obra: 'Galpón Messina', estado: 'activo' })], [])
  assert.equal(filtrarGrupos(g, 'galpon').enObra.length, 1)
  assert.equal(filtrarGrupos(g, 'arcor').enObra.length, 0)
})
