// LO QUE TIENE QUE PROBAR ESTE ARCHIVO: que el caché PUEDE decir que no.
//
// Un caché que siempre devuelve algo no es rápido: es una fuente de datos viejos con buena
// latencia. Los tests que importan acá son los NEGATIVOS —entrada distinta, versión distinta,
// vencido— porque el error que este módulo previene ya ocurrió en este repo y no se vio como error.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { canonicalizar, huellaDeConsulta, crearCache, MOTIVO_MISS, SIN_CACHE } from './cache.mjs'

const CONSULTA = { pregunta: 'rendimiento de mampostería ladrillón e=0,20 en m²/HH', entradas: { zona: 'San Juan', altura_m: 2.6 } }

// ══════════════════════════════════════════════════════════════════════════════════════════════
// LA CLAVE
// ══════════════════════════════════════════════════════════════════════════════════════════════

test('el orden de las llaves de un objeto NO cambia la clave; el de un array SÍ', () => {
  const a = huellaDeConsulta({ pregunta: 'x', entradas: { b: 2, a: 1 }, version: 'v1' })
  const b = huellaDeConsulta({ pregunta: 'x', entradas: { a: 1, b: 2 }, version: 'v1' })
  assert.equal(a.sha256, b.sha256, 'el orden de las llaves no es un dato')
  const l1 = huellaDeConsulta({ pregunta: 'x', entradas: { partidas: ['A', 'B'] }, version: 'v1' })
  const l2 = huellaDeConsulta({ pregunta: 'x', entradas: { partidas: ['B', 'A'] }, version: 'v1' })
  assert.notEqual(l1.sha256, l2.sha256, 'el orden de un array sí lo es')
})

test('Map y Set se canonicalizan ordenados y las fechas por su ISO', () => {
  const m1 = canonicalizar(new Map([['b', 2], ['a', 1]]))
  const m2 = canonicalizar(new Map([['a', 1], ['b', 2]]))
  assert.equal(m1, m2)
  assert.equal(canonicalizar(new Set([3, 1, 2])), canonicalizar(new Set([1, 2, 3])))
  assert.equal(canonicalizar(new Date('2026-08-29T00:00:00Z')), '"@2026-08-29T00:00:00.000Z"')
  assert.equal(canonicalizar(NaN), '"∅NaN"')
  assert.equal(canonicalizar(undefined), '"∅undefined"')
})

test('una FUNCIÓN en la clave se RECHAZA, no se serializa a su nombre', () => {
  // MUTACIÓN QUE LO PONE ROJO: en `canonicalizar`, devolver `"∅función:"+valor.name` en vez de tirar.
  // CORRIDA: con esa mutación este test falla (no tira) Y falla el de abajo, porque dos resolvedores
  // anónimos distintos comparten clave y el segundo come la respuesta del primero.
  assert.throws(() => canonicalizar({ resolver: () => 1 }), /FUNCIÓN no puede formar parte de una clave/)
  assert.throws(() => huellaDeConsulta({ pregunta: 'x', entradas: { f: function () {} }, version: 'v1' }), /FUNCIÓN/)
})

test('sin `version` la clave NO se calcula: el error que evita es servir código viejo', () => {
  assert.throws(() => huellaDeConsulta({ pregunta: 'x', entradas: {} }), /exige `version`/)
  assert.throws(() => crearCache({}), /exige `version`/)
  assert.throws(() => huellaDeConsulta({ pregunta: '  ', version: 'v1' }), /pregunta/)
})

// ══════════════════════════════════════════════════════════════════════════════════════════════
// LOS TRES NEGATIVOS OBLIGATORIOS
// ══════════════════════════════════════════════════════════════════════════════════════════════

test('NEGATIVO · una ENTRADA distinta NO sirve la respuesta vieja', () => {
  // MUTACIÓN QUE LO PONE ROJO: en `huellaDeConsulta`, sacar `entradas` del texto canonicalizado.
  // CORRIDA: con la mutación → `hit: true` y `valor: 12` para una altura de 4,2 m. Rojo.
  const c = crearCache({ version: 'rend@1' })
  c.escribir(CONSULTA, { valor: 12, unidad: 'm2/HH' })
  assert.equal(c.leer(CONSULTA).hit, true)

  const otraAltura = { ...CONSULTA, entradas: { ...CONSULTA.entradas, altura_m: 4.2 } }
  const r = c.leer(otraAltura)
  assert.equal(r.hit, false, 'cambió una entrada que cambia el resultado: el caché no puede contestar')
  assert.equal(r.valor, null)
  assert.equal(r.motivo, MOTIVO_MISS.NO_ESTABA)
})

test('NEGATIVO · una VERSIÓN distinta del productor NO sirve la respuesta vieja', () => {
  // MUTACIÓN QUE LO PONE ROJO: en `crearCache`, `const clave = (c) => huellaDeConsulta({...c, version: 'fija'})`.
  // CORRIDA: con la mutación el caché v2 devuelve el resultado de v1. Rojo.
  //
  // Éste es el defecto real de este repo: el disco tenía la respuesta del lector viejo y el lector
  // nuevo la leyó sin enterarse.
  const v1 = crearCache({ version: 'rend@1' })
  v1.escribir(CONSULTA, { valor: 12 })
  const v2 = crearCache({ version: 'rend@2' })
  assert.equal(v2.leer(CONSULTA).hit, false, 'otro código, otra clave')
  // Y la clave misma es distinta, no sólo el almacén:
  assert.notEqual(v1.clave(CONSULTA).sha256, v2.clave(CONSULTA).sha256)
})

test('NEGATIVO · un `productor` distinto es otra clave', () => {
  const c = crearCache({ version: 'v1' })
  c.escribir({ ...CONSULTA, productor: 'BASE_MAESTRA' }, { valor: 12 })
  assert.equal(c.leer({ ...CONSULTA, productor: 'WEB' }).hit, false)
  assert.equal(c.leer({ ...CONSULTA, productor: 'BASE_MAESTRA' }).hit, true)
})

test('NEGATIVO · lo VENCIDO no se sirve, y lo dice con ese motivo', () => {
  let reloj = 1_000
  const c = crearCache({ version: 'v1', ttlMs: 100, ahora: () => reloj })
  c.escribir(CONSULTA, { valor: 12 })
  reloj = 1_050
  assert.equal(c.leer(CONSULTA).hit, true, 'dentro del TTL todavía sirve')
  reloj = 1_200
  const r = c.leer(CONSULTA)
  assert.equal(r.hit, false)
  assert.equal(r.motivo, MOTIVO_MISS.VENCIDO, 'vencido y ausente no se atienden igual')
  assert.equal(c.contadores().cache_vencidos, 1)
})

// ══════════════════════════════════════════════════════════════════════════════════════════════
// LOS CONTADORES
// ══════════════════════════════════════════════════════════════════════════════════════════════

test('un valor NULL guardado es un HIT: «se buscó y no hay» también se cachea', () => {
  // Si el hit se dedujera de que el valor existe, la ausencia se re-investigaría cada vez — que es
  // exactamente el trabajo caro que el caché tiene que evitar.
  const c = crearCache({ version: 'v1' })
  c.escribir(CONSULTA, null)
  const r = c.leer(CONSULTA)
  assert.equal(r.hit, true)
  assert.equal(r.valor, null)
})

test('cache_hit_rate sin consultas es null, NO 0 ni 100 %', () => {
  // MUTACIÓN QUE LO PONE ROJO: `cache_hit_rate: consultas > 0 ? hits/consultas : 1`.
  // CORRIDA: con la mutación da 1 y un caché jamás consultado publica «100 % de acierto». Rojo.
  const c = crearCache({ version: 'v1' })
  assert.equal(c.contadores().cache_hit_rate, null)
  assert.equal(c.contadores().cache_consultas, 0)
  c.leer(CONSULTA)
  c.escribir(CONSULTA, { valor: 1 })
  c.leer(CONSULTA)
  assert.deepEqual(
    { h: c.contadores().cache_hits, m: c.contadores().cache_misses, r: c.contadores().cache_hit_rate },
    { h: 1, m: 1, r: 0.5 },
  )
})

test('la capacidad desaloja lo más viejo y lo cuenta', () => {
  const c = crearCache({ version: 'v1', capacidad: 2 })
  c.escribir({ pregunta: 'a' }, 1)
  c.escribir({ pregunta: 'b' }, 2)
  c.escribir({ pregunta: 'c' }, 3)
  assert.equal(c.tamano, 2)
  assert.equal(c.contadores().cache_desalojos, 1)
  assert.equal(c.leer({ pregunta: 'a' }).hit, false, 'el más viejo salió')
  assert.equal(c.leer({ pregunta: 'c' }).hit, true)
})

test('SIN_CACHE tiene la misma forma que los contadores reales', () => {
  const reales = crearCache({ version: 'v1' }).contadores()
  assert.deepEqual(Object.keys(SIN_CACHE).sort(), Object.keys(reales).sort())
})
