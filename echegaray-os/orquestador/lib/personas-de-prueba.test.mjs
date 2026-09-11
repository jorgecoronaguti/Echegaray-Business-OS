// EL DEFECTO QUE ESTE ARCHIVO ATRAPA: «ZZ-E2E hh-imputacion» en la liquidación real del dueño.
//
// Los primeros casos prueban la regla sin base. El último la corre contra `personas` de verdad: es
// el único que puede decir si HOY hay un residuo, y es el que se iba a poner rojo el 07/09/2026,
// tres días antes de que el dueño lo viera en su pantalla.

import test from 'node:test'
import assert from 'node:assert/strict'
import { query } from './db.mjs'
import {
  esNombreDePrueba, horasDePersonasDePrueba, quejaDeHoras, quejaDeResiduos, residuosEnElPlantel,
} from './personas-de-prueba.mjs'

const SIN_BASE = !process.env.DATABASE_URL
const AHORA = Date.parse('2026-09-10T18:00:00Z')
const hace = (dias) => new Date(AHORA - dias * 24 * 60 * 60 * 1000).toISOString()

test('el residuo real del 07/09 se detecta: marca en el nombre y es_prueba en falso', () => {
  const r = residuosEnElPlantel([{
    id: '15cc4502-1414-4b73-924f-c316f2c0bc97',
    nombre_completo: 'ZZ-E2E hh-imputacion',
    es_prueba: false,
    created_at: hace(3),
  }], AHORA)
  assert.equal(r.length, 1, 'ésta es la fila que el dueño encontró entre sus dieciséis obreros')
})

test('`es_prueba` en null también se publica: la vista filtra «is not true»', () => {
  const r = residuosEnElPlantel(
    [{ id: 'a', nombre_completo: 'ZZ-E2E lo que sea', es_prueba: null, created_at: hace(9) }], AHORA)
  assert.equal(r.length, 1)
})

test('con `es_prueba` puesta no es residuo: la vista ya no la publica', () => {
  const r = residuosEnElPlantel(
    [{ id: 'a', nombre_completo: 'ZZ-E2E lo que sea', es_prueba: true, created_at: hace(9) }], AHORA)
  assert.deepEqual(r, [])
})

test('una prueba que está corriendo AHORA no se denuncia: `asistencia-editar-en-celda` apaga la marca a propósito', () => {
  const r = residuosEnElPlantel(
    [{ id: 'a', nombre_completo: 'ZZ-E2E celda de asistencia', es_prueba: false, created_at: hace(0) }], AHORA)
  assert.deepEqual(r, [], 'un test que corre en paralelo no puede poner rojo a otro')
})

test('una persona REAL nunca es residuo, aunque no tenga es_prueba', () => {
  const r = residuosEnElPlantel(
    [{ id: 'a', nombre_completo: 'ZOGBE RAMOS WALTER LEONARDO', es_prueba: false, created_at: hace(400) }], AHORA)
  assert.deepEqual(r, [])
  assert.equal(esNombreDePrueba('ZOGBE RAMOS WALTER LEONARDO'), false,
    'la marca se mide en la RAÍZ: un apellido que empieza con Z no es una prueba')
})

test('la queja dice qué fila y qué hacer, sin mandar a leer otro archivo', () => {
  const q = quejaDeResiduos([{ id: 'abc', nombre_completo: 'ZZ-E2E hh-imputacion' }])
  assert.match(q, /ZZ-E2E hh-imputacion \(abc\)/)
  assert.match(q, /es_prueba = true/)
})

test('LAS HORAS DE UNA PERSONA DE PRUEBA SE DETECTAN, aunque la persona esté escondida', () => {
  // El residuo real del 11/09/2026: la persona marcada `es_prueba` (invisible en el plantel) y sus
  // 8 h del 19/08 vivas en `registros_hh`, imputadas a Quattropani.
  const filas = [
    { id: 'r1', persona_es_prueba: true, fecha: '2026-08-19', horas: 8, obra: 'Quattropani' },
    { id: 'r2', persona_es_prueba: false, fecha: '2026-08-19', horas: 9, obra: 'Quattropani' },
  ]
  const malas = horasDePersonasDePrueba(filas)
  assert.equal(malas.length, 1)
  assert.equal(malas[0].id, 'r1')
  const q = quejaDeHoras(malas)
  assert.match(q, /8 h imputadas a Quattropani/)
  assert.match(q, /delete from registros_hh/)
})

test('SIN HORAS DE PRUEBA no hay queja', () => {
  assert.deepEqual(horasDePersonasDePrueba([{ id: 'r2', persona_es_prueba: false, horas: 9 }]), [])
})

test('NINGUNA hora de persona de prueba está hoy en la base real', { skip: SIN_BASE }, async () => {
  const { rows } = await query(`
    select h.id, p.es_prueba as persona_es_prueba, h.fecha, h.horas, h.obra_canonica_id as obra
      from public.registros_hh h join public.personas p on p.id = h.persona_id
     where p.es_prueba is true`)
  const malas = horasDePersonasDePrueba(rows)
  assert.deepEqual(malas, [], malas.length === 0 ? '' : quejaDeHoras(malas))
})

test('NINGUNA persona de prueba está hoy en el plantel real', { skip: SIN_BASE }, async () => {
  const { rows } = await query(
    'select id, nombre_completo, es_prueba, created_at from public.personas')
  const residuos = residuosEnElPlantel(rows, Date.now())
  assert.deepEqual(residuos, [], residuos.length === 0 ? '' : quejaDeResiduos(residuos))
})
