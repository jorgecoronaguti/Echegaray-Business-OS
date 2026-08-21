// EL DEFECTO QUE ATRAPA: que un error de lectura se convierta en silencio en una lista vacía.
//
// Si alguien vuelve a escribir `return lectura.data ?? vacio` sin registrar el error —que es
// exactamente el `?? []` que había en la ficha de obra—, el primer test se pone rojo: la lista
// sigue vacía, pero ya nadie sabe que hubo un fallo y la pantalla dice «no hay datos».

import test from 'node:test'
import assert from 'node:assert/strict'
import { crearLector, resumenDeFallas } from './lecturas.ts'

test('una lectura fallida deja rastro aunque la lista quede vacía', () => {
  const l = crearLector()
  const partes = l.leer<string[]>({ data: null, error: 'permission denied for table partes' }, [])
  assert.deepEqual(partes, [], 'la pantalla se tiene que poder dibujar igual')
  assert.equal(l.falla(), 'permission denied for table partes', 'el error no puede desaparecer')
})

test('sin errores no hay cartel', () => {
  const l = crearLector()
  assert.deepEqual(l.leer({ data: ['a'], error: null }, []), ['a'])
  assert.equal(l.falla(), null)
})

test('el mismo error repetido se dice una sola vez', () => {
  const l = crearLector()
  for (let i = 0; i < 6; i++) l.leer<string[]>({ data: null, error: 'fetch failed' }, [])
  assert.equal(l.falla(), 'fetch failed')
})

test('errores distintos se muestran todos: son fuentes distintas', () => {
  const l = crearLector()
  l.leer<string[]>({ data: null, error: 'fetch failed' }, [])
  l.leer<string[]>({ data: null, error: 'permission denied for table hh' }, [])
  assert.equal(l.falla(), 'fetch failed · permission denied for table hh')
})

test('un dato que llega vacío DE VERDAD no se confunde con una falla', () => {
  const l = crearLector()
  assert.deepEqual(l.leer<string[]>({ data: [], error: null }, []), [])
  assert.equal(l.falla(), null, 'una obra sin partes no es una obra que no se pudo leer')
})

test('un error en blanco no fabrica un cartel vacío', () => {
  assert.equal(resumenDeFallas(['', '   ']), null)
})

test('el lector respeta el vacío que le dan, no impone una lista', () => {
  const l = crearLector()
  const mapa = l.leer<Map<string, number>>({ data: null, error: 'x' }, new Map())
  assert.equal(mapa.size, 0)
})
