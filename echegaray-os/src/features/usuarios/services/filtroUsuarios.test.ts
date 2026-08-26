import test from 'node:test'
import assert from 'node:assert/strict'
import { coincide, esFiltro } from './filtroUsuarios.ts'
import type { UsuarioGestion } from '../types.ts'

// EL DEFECTO QUE ATRAPA: contar como «de Administración» a una cuenta SIN ACCESO. No ve nada, esté
// donde esté, y contarla diría que hay más gente mirando la economía de la empresa que la que hay.

const cuenta = (p: Partial<UsuarioGestion>): UsuarioGestion => ({
  id: 'u1', persona: null, nombre: 'Ana Laura', email: 'ana@ecsas.com.ar',
  rol: 'administracion', area: 'administracion', estado: 'activo', obras: [],
  ultimoIngreso: null, creado: null,
  ...p,
} as UsuarioGestion)

test('«todos» no recorta por área, pero sí por texto', () => {
  assert.equal(coincide(cuenta({}), '', 'todos'), true)
  assert.equal(coincide(cuenta({}), 'ana', 'todos'), true)
  assert.equal(coincide(cuenta({}), 'pedro', 'todos'), false)
})

test('una cuenta SIN ACCESO no entra en el filtro de su área', () => {
  const sinAcceso = cuenta({ estado: 'sin_acceso' })
  assert.equal(coincide(sinAcceso, '', 'administracion'), false)
  assert.equal(coincide(sinAcceso, '', 'sin_acceso'), true)
})

test('el texto busca en el nombre y en el correo, que es lo único único', () => {
  const u = cuenta({ nombre: null, email: 'zz@ecsas.com.ar' })
  assert.equal(coincide(u, 'zz@', 'todos'), true)
})

test('un filtro inventado en la URL no pasa por válido', () => {
  assert.equal(esFiltro('todos'), true)
  assert.equal(esFiltro('economia'), false)
  assert.equal(esFiltro(undefined), false)
})
