// LAS SEÑALES DE HOY DE LA CARTERA — cada test es un defecto que la pantalla ya cometió o que la
// regla del repo prohíbe cometer. Si se revierte la regla, el test se pone rojo.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ficharonPorObra, impedimentosPorObra, obrasConParteDeHoy, personasQueFicharon,
  tituloImpedimentos, type MarcaDeCartera,
} from './senalesCartera.ts'

test('la obra con varios partes del mismo día aparece UNA vez: la señal es un sí, no un conteo', () => {
  const con = obrasConParteDeHoy([
    { obra_id: 'quattropani' }, { obra_id: 'quattropani' }, { obra_id: 'la-estrella' },
  ])
  assert.deepEqual([...con].sort(), ['la-estrella', 'quattropani'])
})

test('un parte sin obra no se le atribuye a ninguna', () => {
  assert.equal(obrasConParteDeHoy([{ obra_id: null }]).size, 0)
})

test('la obra sin parte no queda en el conjunto — y el conjunto vacío NO es una afirmación', () => {
  const con = obrasConParteDeHoy([])
  assert.equal(con.has('galpones'), false)
  assert.equal(con.size, 0)
})

test('los impedimentos se cuentan por obra, y la obra sin ninguno NO entra con 0', () => {
  const por = impedimentosPorObra([
    { obra_id: 'galpones' }, { obra_id: 'galpones' }, { obra_id: 'pisos' }, { obra_id: null },
  ])
  assert.equal(por.get('galpones'), 2)
  assert.equal(por.get('pisos'), 1)
  // Una clave en 0 invitaría a dibujar un «⚠ 0», que afirma que se miró y no hay — cuando lo que
  // corresponde es no dibujar nada.
  assert.equal(por.has('sin-impedimentos'), false)
  assert.equal(por.size, 2)
})

const MARCAS: MarcaDeCartera[] = [
  { persona_id: 'ana', obra_id: 'galpones', estado: 'activo' },
  { persona_id: 'beto', obra_id: 'galpones', estado: 'cerrada' },
  // La misma persona marcó en dos obras el mismo día: es UNA persona, no dos.
  { persona_id: 'ana', obra_id: 'pisos', estado: 'falta_salida' },
  // Una fila SIN entrada (una incidencia suelta) no es alguien en obra.
  { persona_id: 'carla', obra_id: 'pisos', estado: 'sin_registrar' },
  // Una marca sin obra no se reparte ni se adivina.
  { persona_id: 'dario', obra_id: null, estado: 'activo' },
]

test('sin_registrar no es una persona en obra, y la marca sin obra no se atribuye', () => {
  const por = ficharonPorObra(MARCAS)
  assert.deepEqual([...(por.get('galpones') ?? [])].sort(), ['ana', 'beto'])
  assert.deepEqual([...(por.get('pisos') ?? [])], ['ana'])
  assert.equal(por.size, 2)
})

test('la misma persona en dos obras cuenta UNA vez: el pie cuenta personas, no jornadas', () => {
  const por = ficharonPorObra(MARCAS)
  assert.equal(personasQueFicharon(por, ['galpones', 'pisos']), 2)
})

test('sólo cuentan las obras visibles: filtrada la cartera, el pie habla de lo filtrado', () => {
  const por = ficharonPorObra(MARCAS)
  assert.equal(personasQueFicharon(por, ['pisos']), 1)
})

test('CERO MARCAS DEVUELVE null, NUNCA 0 — «sin fichar» no es «no vino nadie»', () => {
  // Es el defecto medido el 24/08/2026: `asistencia_marca` tiene dos filas en toda la base, así que
  // un 0 sería el número de todos los días mientras las obras cargan partes de avance.
  assert.equal(personasQueFicharon(new Map(), ['galpones']), null)
  assert.equal(personasQueFicharon(ficharonPorObra(MARCAS), []), null)
  // Y una obra donde SÓLO hubo una incidencia sin entrada tampoco publica un cero.
  const soloIncidencia = ficharonPorObra([{ persona_id: 'carla', obra_id: 'pisos', estado: 'sin_registrar' }])
  assert.equal(personasQueFicharon(soloIncidencia, ['pisos']), null)
})

test('el título del icono dice cuántos son, en singular y en plural', () => {
  assert.match(tituloImpedimentos(1), /^1 impedimento abierto/)
  assert.match(tituloImpedimentos(3), /^3 impedimentos abiertos/)
})
