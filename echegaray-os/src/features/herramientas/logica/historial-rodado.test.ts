import { test } from 'node:test'
import assert from 'node:assert/strict'
import { historialDeRodado } from './historial-rodado.ts'
import type { Revision } from './revision.ts'
import type { Evento } from './evento.ts'
import type { Incidencia } from '../types.ts'

const rev = { id: 'r1', activo_id: 'A', tipo: 'rto', fecha: '2026-05-26', vencimiento: '2027-05-26', lectura: 84000, resultado: 'apto', lugar: 'Planta 1', numero: null, costo: null, observaciones: null, adjunto_url: null, creado_en: '2026-05-26T12:00:00Z', creado_por: null } as Revision
const ev = { id: 'e1', activo_id: 'A', tipo: 'reparacion', situacion: 'en_taller', fecha: '2026-09-20', descripcion: 'Falla en el contactor', trabajo_hecho: null, creado_en: '2026-09-20T12:00:00Z' } as Evento
const inc = { id: 'i1', activo_id: 'A', tipo: 'no_anda', texto: 'no arranca', creado_en: '2026-10-01T10:00:00Z', cerrada_en: null } as Incidencia

test('junta fallas, arreglos y revisiones del activo, lo último primero', () => {
  const h = historialDeRodado('A', { revisiones: [rev], eventos: [ev], incidencias: [inc] }, 'km')
  assert.deepEqual(h.map((r) => r.clase), ['falla', 'arreglo', 'revision'])
  assert.match(h[0].titulo, /fuera de servicio/)
  assert.match(h[1].detalle ?? '', /en el mecánico/)
  assert.match(h[2].detalle ?? '', /84\.000 km/)
})

test('no mezcla activos ni revienta con las fuentes sin migración (null)', () => {
  assert.deepEqual(historialDeRodado('B', { revisiones: [rev], eventos: [ev], incidencias: [inc] }, 'km'), [])
  assert.deepEqual(historialDeRodado('A', { revisiones: null, eventos: undefined, incidencias: null }, 'h'), [])
})
