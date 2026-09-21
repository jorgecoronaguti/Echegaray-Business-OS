import { test } from 'node:test'
import assert from 'node:assert/strict'
import { armarParque } from './parque.ts'
import { libroDeMovimientos, resumenLibro } from './movimientos.ts'
import { historial } from './historial.ts'
import { activo, inc, mov, ubicacion } from './fixture.test-util.ts'

const HOY = new Date('2026-09-21T18:00:00-03:00')

function parque() {
  return armarParque({
    ubicaciones: [
      ubicacion({ id: 't', tipo: 'taller', nombre: 'Taller' }),
      ubicacion({ id: 'o', tipo: 'obra', obra_id: 'ob' }),
      ubicacion({ id: 'r', tipo: 'rodado', activo_id: 'hilux' }),
    ],
    obras: [{ id: 'ob', codigo: 'OB-0012', nombre: 'PISOS ARCOR', estado: 'activa', cliente: null }],
    activos: [
      activo({ id: 'a', codigo: 'HER-0001', nombre: 'Amoladora' }),
      activo({ id: 'b', codigo: 'HER-0002', nombre: 'Balde' }),
      activo({ id: 'c', codigo: 'HER-0003', nombre: 'Carretilla', creado_en: '2026-09-17T12:00:00Z' }),
      activo({ id: 'hilux', codigo: 'ROD-0001', clase: 'rodado', nombre: 'Hilux', patente: 'NMN898' }),
    ],
    movimientos: [
      mov({ id: 'm1', activo_id: 'a', origen_id: 't', destino_id: 'o', fecha_hora: '2026-09-21T15:42:00-03:00', lote_id: 'L', usuario_id: 'u1' }),
      mov({ id: 'm2', activo_id: 'b', origen_id: 't', destino_id: 'o', fecha_hora: '2026-09-21T15:42:00-03:00', lote_id: 'L', usuario_id: 'u1' }),
      mov({ id: 'm3', activo_id: 'c', destino_id: 't', fecha_hora: '2026-09-17T09:10:00-03:00', usuario_id: 'u2', nota: 'alta' }),
      mov({ id: 'm4', activo_id: 'a', destino_id: 't', fecha_hora: '2026-03-01T10:00:00-03:00', importado: true, usuario_texto: 'L. Páez' }),
      mov({ id: 'm5', activo_id: 'b', origen_id: 'o', destino_id: 't', fecha_hora: '2026-09-18T10:00:00-03:00', usuario_id: 'u2' }),
      mov({ id: 'm6', activo_id: 'b', origen_id: 't', destino_id: 'o', fecha_hora: '2026-09-19T10:00:00-03:00', usuario_id: 'u2', corrige_a: 'm5', nota: 'el destino estaba mal' }),
    ],
    incidencias: [inc({ id: 'i', activo_id: 'a', creado_en: '2026-09-20T10:00:00-03:00', texto: 'hace ruido' })],
    nombres: { u1: 'L. Páez', u2: 'M. Quiroga' },
  })
}

test('un lote es un renglón; el alta no tiene origen; la corrección queda a la vista', () => {
  const r = libroDeMovimientos(parque(), { dias: 30, ubicacion: null, usuario: null }, HOY)
  assert.equal(r.length, 4, 'm4 es de marzo: fuera de los 30 días')
  assert.deepEqual(r[0].activos.map((a) => a.codigo), ['HER-0001', 'HER-0002'])
  assert.deepEqual(r[0].desde, ['Taller'])
  assert.equal(r[0].hacia, 'OB-0012 · PISOS ARCOR')
  assert.equal(r[0].quien, 'L. Páez')
  const alta = r.find((x) => x.alta)!
  assert.equal(alta.activos[0].codigo, 'HER-0003')
  assert.deepEqual(alta.desde, [])
  const corregido = r.find((x) => x.clave === 'm5')!
  assert.equal(corregido.corregidoPor?.id, 'm6')
})

test('filtros: por lugar (origen o destino) y por persona; el resumen cuenta lo filtrado', () => {
  const p = parque()
  const f = { dias: null, ubicacion: null, usuario: 'u:u2' }
  const r = libroDeMovimientos(p, f, HOY)
  assert.deepEqual(r.map((x) => x.clave).sort(), ['m3', 'm5', 'm6'])
  assert.deepEqual(resumenLibro(r, p, f, HOY), { movimientos: 3, lotes: 0, personas: 1 })
  const todos = { dias: null, ubicacion: null, usuario: null }
  assert.equal(resumenLibro(libroDeMovimientos(p, todos, HOY), p, todos, HOY).personas, 3, 'L. Páez logueado y L. Páez del listado se cuentan aparte: no se adivina que son la misma persona')
})

test('el historial de un activo mezcla movimientos y reportes, y el reporte no mueve', () => {
  const h = historial(parque(), 'a')
  assert.deepEqual(h.map((x) => x.tipo), ['movimiento', 'reporte', 'movimiento', 'alta'])
  assert.equal(h[0].texto, 'Taller → OB-0012 · PISOS ARCOR · L. Páez')
  assert.equal(h[2].texto, 'origen desconocido → Taller · L. Páez')
  const c = historial(parque(), 'c')
  assert.deepEqual(c.map((x) => x.texto), ['Alta en Taller · M. Quiroga'], 'el alta con lugar no se repite')
})
