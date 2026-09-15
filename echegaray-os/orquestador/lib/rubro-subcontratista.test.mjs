// EL RUBRO «SUBCONTRATISTA» CONFIRMADO POR EL DUEÑO (14/09/2026) — el plan del dry.
//
// «Fredes y Castro, Angel Fernandez (montajes) y Leandro Rojas. FEMENIA NO.» Fredes y Castro tenían el
// rubro declarado por una cuenta de prueba; la declaración pasa a llevar el origen del dueño. QUÉ
// DEFECTOS ATRAPA: que FEMENIA entre, que quede la firma de la cuenta de prueba, que un proveedor que
// no existe (Leandro Rojas) se pierda en silencio, o que se toque a alguien que el dueño no nombró.

import test from 'node:test'
import assert from 'node:assert/strict'
import { CONFIRMADOS, EXCLUIDOS, ORIGEN_DUENO, planDeRubroSubcontratista } from './rubro-subcontratista.mjs'

const prov = (nombre, extra = {}) => ({ id: nombre, nombre, razon_social: null, rubro: null, rubro_declarado_por: null, es_prueba: false, ...extra })
const PROVEEDORES = [
  prov('Pedro Fredes', { rubro: 'Subcontratista', rubro_declarado_por: 'jorge.o.corona+direccion-test-1783513222134@gmail.com' }),
  prov('Gerson Castro', { razon_social: 'CASTRO GALVAN GERSON ULISES', rubro: 'Subcontratista', rubro_declarado_por: 'jorge.o.corona+direccion-test-1783513222134@gmail.com' }),
  prov('Angel Fernandez'),
  prov('FEMENIA'),
  prov('Pedro Tello', { rubro: 'Subcontratista', rubro_declarado_por: 'jorge@ecsas.com.ar' }),
  prov('CORRALON PROGRESO'),
]

test('la lista es la del dueño: cinco confirmados (Pedro Tello, 14/09 18:10) y FEMENIA excluido', () => {
  assert.deepEqual([...CONFIRMADOS].sort(), ['Angel Fernandez', 'Gerson Castro', 'Leandro Rojas', 'Pedro Fredes', 'Pedro Tello'])
  assert.deepEqual([...EXCLUIDOS], ['FEMENIA'])
  assert.equal(ORIGEN_DUENO, 'dueño 14/09/2026')
})

test('el plan actualiza a los que existen con el origen del dueño y propone crear al que falta', () => {
  const plan = planDeRubroSubcontratista(PROVEEDORES)
  const de = (n) => plan.find((p) => p.nombre === n)
  for (const n of ['Pedro Fredes', 'Gerson Castro', 'Angel Fernandez', 'Pedro Tello']) {
    assert.equal(de(n)?.accion, 'actualizar', n)
    assert.deepEqual(de(n).despues, { rubro: 'Subcontratista', rubro_declarado_por: 'dueño 14/09/2026' })
  }
  assert.equal(de('Leandro Rojas')?.accion, 'crear')
  assert.equal(de('FEMENIA'), undefined, 'FEMENIA no es subcontratista')
  assert.equal(de('CORRALON PROGRESO'), undefined, 'lo que el dueño no nombró no se toca')
})

test('un proveedor que ya tiene el rubro con el origen del dueño no cambia', () => {
  const plan = planDeRubroSubcontratista([prov('Angel Fernandez', { rubro: 'Subcontratista', rubro_declarado_por: 'dueño 14/09/2026' })])
  assert.equal(plan.find((p) => p.nombre === 'Angel Fernandez')?.accion, 'sin_cambio')
})

test('se encuentra por razón social y sin mirar mayúsculas ni espacios', () => {
  const plan = planDeRubroSubcontratista([prov('G. CASTRO', { razon_social: '  castro galvan gerson ulises ' })])
  assert.equal(plan.find((p) => p.nombre === 'Gerson Castro')?.accion, 'actualizar')
})
