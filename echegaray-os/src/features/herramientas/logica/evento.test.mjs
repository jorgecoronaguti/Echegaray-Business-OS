// Libro de vida del rodado: la disponibilidad sale de los eventos abiertos, el costo suma sólo lo cargado y el
// próximo service por km no se inventa sin base.
import test from 'node:test'
import assert from 'node:assert/strict'
import { costoAcumulado, disponibilidadDe, serviceEnKm, numerosDeEvento } from './evento.ts'

const ev = (o) => ({ id: 'e' + Math.random(), activo_id: 'A', tipo: 'reparacion', situacion: 'hecho', fecha: '2026-09-01', km: null, descripcion: 'x', proveedor_id: null,
  taller_texto: null, costo: null, compra_ref: null, proximo_km: null, proximo_fecha: null, ubicacion_origen: null, ubicacion_taller: null, enviado_en: null,
  cerrado_en: null, cerrado_por: null, creado_en: '2026-09-01T10:00:00Z', creado_por: null, ...o })

test('disponibilidad: lo más grave abierto manda y nada abierto es disponible', () => {
  const a = { id: 'A', estado: 'operativo' }
  assert.equal(disponibilidadDe(a, []), 'disponible')
  assert.equal(disponibilidadDe(a, [ev({ situacion: 'pendiente' })]), 'hay_que_llevarlo')
  assert.equal(disponibilidadDe(a, [ev({ situacion: 'pendiente' }), ev({ situacion: 'en_taller' })]), 'en_el_mecanico')
  assert.equal(disponibilidadDe({ id: 'A', estado: 'fuera_servicio' }, [ev({ situacion: 'pendiente' })]), 'fuera_de_servicio')
  assert.equal(disponibilidadDe(a, [ev({ activo_id: 'B', situacion: 'pendiente' })]), 'disponible', 'el evento de otro rodado no cuenta')
})

test('costo: suma lo cargado y cuenta lo que no tiene costo, sin inventarlo', () => {
  assert.deepEqual(costoAcumulado([ev({ costo: 100 }), ev({ costo: 50.5 }), ev({})]), { total: 150.5, cargados: 2, sinCosto: 1 })
})

test('próximo service por km: sin km próximo o sin lectura no hay dato; con base, el semáforo', () => {
  assert.equal(serviceEnKm([ev({})], 1000), null)
  assert.equal(serviceEnKm([ev({ proximo_km: 100000 })], null), null)
  assert.deepEqual(serviceEnKm([ev({ proximo_km: 100000 })], 90000), { proximo: 100000, faltan: 10000, tono: 'pos' })
  assert.equal(serviceEnKm([ev({ proximo_km: 100000 })], 99500).tono, 'warn')
  assert.equal(serviceEnKm([ev({ proximo_km: 100000 })], 100200).tono, 'neg')
})

test('numeric de PostgREST llega como string: se normaliza', () => {
  const e = numerosDeEvento(ev({ km: '84320.0', costo: '185000.50', proximo_km: null }))
  assert.deepEqual([e.km, e.costo, e.proximo_km], [84320, 185000.5, null])
})
