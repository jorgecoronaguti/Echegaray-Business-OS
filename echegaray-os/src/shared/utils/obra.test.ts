import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { FORMATO_CODIGO_OBRA, coincideObra, rotuloDeObra } from './obra.ts'

const AZUFRE = { codigo: 'OB-0021', nombre: 'ME - PLAYÓN DE AZUFRE', cliente: 'MESSINA' }
const PISOS = { codigo: 'OB-0020', nombre: 'ME - PISOS 120 M² Y RAMPA', cliente: 'MESSINA' }

test('rotuloDeObra: «código · nombre»; sin código el nombre solo, nunca un código inventado', () => {
  assert.equal(rotuloDeObra(AZUFRE), 'OB-0021 · ME - PLAYÓN DE AZUFRE')
  assert.equal(rotuloDeObra({ nombre: 'ME - PLAYÓN DE AZUFRE', codigo: null }), 'ME - PLAYÓN DE AZUFRE')
  assert.equal(rotuloDeObra({ nombre: 'ME - PLAYÓN DE AZUFRE' }), 'ME - PLAYÓN DE AZUFRE')
  assert.equal(rotuloDeObra({ nombre: '  ', codigo: 'OB-0021' }), 'OB-0021')
  assert.equal(rotuloDeObra({ nombre: ' SF - MAMPOSTERÍA ', codigo: ' OB-0023 ' }), 'OB-0023 · SF - MAMPOSTERÍA')
})

test('coincideObra: el buscador encuentra la obra por su código, con o sin ceros, guion o prefijo', () => {
  for (const q of ['OB-0021', 'ob-0021', 'ob21', 'OB 21', '0021', '21']) assert.ok(coincideObra(AZUFRE, q), `«${q}» tiene que encontrar OB-0021`)
  assert.equal(coincideObra(AZUFRE, 'OB-0020'), false, 'otro código no es esta obra')
  assert.equal(coincideObra(AZUFRE, 'zz21'), false, 'el prefijo de prueba no encuentra una obra real')
  assert.equal(coincideObra(AZUFRE, '22'), false, 'el número se compara entero, no por parecido')
})

test('coincideObra: nombre, cliente y consulta vacía se siguen buscando como antes', () => {
  assert.ok(coincideObra(AZUFRE, 'playon'))
  assert.ok(coincideObra(AZUFRE, 'messina'))
  assert.ok(coincideObra(AZUFRE, ''), 'no filtrar nada no vacía la lista')
  assert.ok(coincideObra(PISOS, '120'), 'un número que está en el nombre encuentra por nombre')
  assert.equal(coincideObra({ nombre: 'ME - BSA', codigo: null }, '19'), false, 'sin código no hay búsqueda por número')
})

test('FORMATO_CODIGO_OBRA es el mismo CHECK que impone la migración', () => {
  const sql = readFileSync(new URL('../../../supabase/migrations/20260915T0600_obra_codigo_interno.sql', import.meta.url), 'utf8')
  const check = /check \(codigo ~ '([^']+)'\)/.exec(sql)
  assert.ok(check, 'la migración declara el CHECK de formato')
  assert.equal(check[1], FORMATO_CODIGO_OBRA.source)
  assert.ok(FORMATO_CODIGO_OBRA.test('OB-0001') && FORMATO_CODIGO_OBRA.test('ZZ-0003') && FORMATO_CODIGO_OBRA.test('OB-10000'))
  assert.ok(!FORMATO_CODIGO_OBRA.test('OB-12') && !FORMATO_CODIGO_OBRA.test('ob-0001') && !FORMATO_CODIGO_OBRA.test('messina-bsa'))
})
