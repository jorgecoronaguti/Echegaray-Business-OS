import test from 'node:test'
import assert from 'node:assert/strict'
import { abreLaObra, seccionesVisibles } from './permisos.ts'
import type { PermisosPortal } from '../types.ts'

const permisos = (p: Partial<PermisosPortal> = {}): PermisosPortal => ({
  puede_ver_obra: true,
  puede_ver_montos: true,
  puede_aprobar: true,
  obras: null,
  ...p,
})

test('con los tres permisos se dibuja el portal completo del mockup 29', () => {
  const s = seccionesVisibles(permisos())
  assert.deepEqual(s.solapas, ['obra', 'pagos', 'docs'])
  assert.equal(s.inicial, 'pagos')
  assert.ok(s.contrato && s.montos && s.panel_a_pagar && s.aprobacion && s.obra)
})

test('sin puede_ver_montos NO hay importes en ninguna sección — y ninguna se degrada a «—»', () => {
  const s = seccionesVisibles(permisos({ puede_ver_montos: false }))
  assert.equal(s.montos, false)
  assert.equal(s.contrato, false)
  assert.equal(s.panel_a_pagar, false)
  // La solapa de documentos y certificados sigue: lo que se retira es la plata, no el papel.
  assert.ok(s.solapas.includes('pagos'))
})

test('sin puede_ver_obra la solapa «Mi obra» no existe y el portal abre donde sí puede', () => {
  const s = seccionesVisibles(permisos({ puede_ver_obra: false }))
  assert.deepEqual(s.solapas, ['pagos', 'docs'])
  assert.equal(s.obra, false)
  assert.equal(s.inicial, 'pagos')
})

test('sin montos y sin obra el portal abre en pagos, que es lo único que queda', () => {
  const s = seccionesVisibles(permisos({ puede_ver_obra: false, puede_ver_montos: false }))
  assert.equal(s.inicial, 'pagos')
  assert.deepEqual(s.solapas, ['pagos', 'docs'])
})

test('sin puede_aprobar la tarjeta de aprobación se retira entera', () => {
  // El defecto que atrapa: dibujar «esperando su aprobación» sin los botones. La pantalla pediría
  // algo que ese acceso no puede hacer, y el certificado quedaría trabado esperando a nadie.
  const s = seccionesVisibles(permisos({ puede_aprobar: false }))
  assert.equal(s.aprobacion, false)
  assert.equal(s.montos, true)
})

test('un acceso sin permisos resueltos ve lo mínimo, nunca lo máximo', () => {
  const s = seccionesVisibles(null)
  assert.equal(s.montos, false)
  assert.equal(s.obra, false)
  assert.equal(s.aprobacion, false)
  assert.equal(s.panel_a_pagar, false)
})

test('la lista de obras del acceso decide qué obra abre', () => {
  assert.equal(abreLaObra(permisos({ obras: null }), 'o-9'), true)
  assert.equal(abreLaObra(permisos({ obras: ['o-1', 'o-2'] }), 'o-2'), true)
  assert.equal(abreLaObra(permisos({ obras: ['o-1'] }), 'o-2'), false)
  assert.equal(abreLaObra(permisos({ obras: [] }), 'o-1'), false)
  assert.equal(abreLaObra(null, 'o-1'), false)
})
