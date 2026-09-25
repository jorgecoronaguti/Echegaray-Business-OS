import { test } from 'node:test'
import assert from 'node:assert/strict'
import { armarParque } from './parque.ts'
import { candidatos, filtrosDeURL, totales } from './inventario.ts'
import { itemsDeRecuento } from './recuento.ts'
import { nombresRepetidos, decisiones } from './resumen.ts'
import { colaDeEtiquetas } from './etiquetas.ts'
import {
  campoDeTalle, compararTalle, historialDePersona, prendas, talleSugerido, tenencias,
} from './vestimenta.ts'
import { activo, mov, ubicacion } from './fixture.test-util.ts'
import type { Ajuste } from '../types.ts'

const ubicaciones = [
  ubicacion({ id: 'u-t', tipo: 'taller', nombre: 'Taller' }),
  ubicacion({ id: 'u-p', tipo: 'persona', nombre: 'Juan Pérez', persona_id: 'per-1' }),
]
const activos = [
  activo({ id: 'h', codigo: 'AMO-001', nombre: 'Amoladora', ubicacion_id: 'u-t' }),
  activo({ id: 'cas', codigo: 'CAS-001', clase: 'epp', categoria: 'EPP', nombre: 'Casco', ubicacion_id: 'u-t' }),
  activo({ id: 'cm', codigo: 'CAM-002', clase: 'ropa', categoria: 'Ropa de trabajo', nombre: 'Camisa de trabajo', talle: 'M', cantidad: 3, ubicacion_id: 'u-t' }),
  activo({ id: 'cs', codigo: 'CAM-001', clase: 'ropa', categoria: 'Ropa de trabajo', nombre: 'Camisa de trabajo', talle: 'S', cantidad: 0, ubicacion_id: null }),
  activo({ id: 'cxl', codigo: 'CAM-004', clase: 'ropa', categoria: 'Ropa de trabajo', nombre: 'Camisa de trabajo', talle: 'XL', cantidad: 0, ubicacion_id: null }),
  activo({ id: 'p44', codigo: 'PAN-004', clase: 'ropa', categoria: 'Ropa de trabajo', nombre: 'Pantalón de trabajo', talle: '44', cantidad: 0, ubicacion_id: null }),
]
const existencias = [
  { activo_id: 'h', ubicacion_id: 'u-t', cantidad: 1 },
  { activo_id: 'cas', ubicacion_id: 'u-t', cantidad: 1 },
  { activo_id: 'cm', ubicacion_id: 'u-t', cantidad: 1 },
  { activo_id: 'cm', ubicacion_id: 'u-p', cantidad: 2 },
]
const parque = () => armarParque({ ubicaciones, activos, existencias, obras: [], movimientos: [], incidencias: [], nombres: {} })

test('talles: único primero, letras en orden de talle, números en orden numérico', () => {
  const t = ['XL', '40', 'S', null, 'XXL', '38', 'M', '56']
  assert.deepEqual([...t].sort(compararTalle), [null, 'S', 'M', 'XL', 'XXL', '38', '40', '56'])
})

test('«Todo» es el parque: el EPP y la ropa salen de ahí y tienen su solapa; buscando, aparecen', () => {
  const p = parque()
  const ids = (clase: string, q = '') => candidatos(p, { ...filtrosDeURL({ clase }), q }).map((a) => a.id).sort()
  assert.deepEqual(ids('todo'), ['h'])
  assert.deepEqual(ids('epp'), ['cas'])
  assert.deepEqual(ids('ropa'), ['cm', 'cs', 'cxl', 'p44'])
  assert.deepEqual(ids('herramienta'), ['h'])
  assert.deepEqual(ids('todo', 'camisa'), ['cm', 'cs', 'cxl'])
})

test('ropa en 0 es «sin stock», no «sin ubicación», y lo entregado cuenta aparte', () => {
  const p = parque()
  const t = totales(p, candidatos(p, filtrosDeURL({ clase: 'ropa' })))
  assert.deepEqual(t.porTipo, [{ tipo: 'taller', activos: 1 }, { tipo: 'persona', activos: 1 }, { tipo: 'sin_stock', activos: 3 }])
  assert.equal(decisiones(p).find((d) => d.clave === 'sin_ubicacion'), undefined)
})

test('los talles de una misma prenda no son «nombres repetidos» ni van a la cola de etiquetas', () => {
  assert.deepEqual(nombresRepetidos(activos), [])
  assert.deepEqual(colaDeEtiquetas(activos).map((x) => x.activo.id), ['h'])
})

test('el recuento del Taller trae el EPP y la ropa aunque estén en 0; el de otro lugar, no', () => {
  const p = parque()
  const t = itemsDeRecuento(p, 'u-t')
  assert.deepEqual(t.map((i) => [i.codigo, i.esperado]), [
    ['AMO-001', 1], ['CAM-001', 0], ['CAM-002', 1], ['CAM-004', 0], ['CAS-001', 1], ['PAN-004', 0],
  ])
  assert.equal(t.find((i) => i.codigo === 'CAM-002')?.nombre, 'Camisa de trabajo · M')
  assert.deepEqual(itemsDeRecuento(p, 'u-p').map((i) => i.codigo), ['CAM-002'])
})

test('prendas: disponible (no está en una persona) y entregadas, por talle', () => {
  const p = parque()
  const [camisa, pantalon] = prendas(p.activos, p.existencias ?? [], (id) => p.ubicacionPorId.get(id)?.tipo ?? null, 'ropa')
  assert.equal(camisa.nombre, 'Camisa de trabajo')
  assert.deepEqual(camisa.talles.map((t) => [t.talle, t.disponible, t.entregadas]), [['S', 0, 0], ['M', 1, 2], ['XL', 0, 0]])
  assert.equal(campoDeTalle(camisa), 'camisa')
  assert.equal(campoDeTalle(pantalon), 'pantalon')
  assert.equal(campoDeTalle({ nombre: 'Botín de seguridad', talles: [] }), 'calzado')
  assert.equal(talleSugerido(camisa, { camisa: 'xl', pantalon: null, calzado: null })?.activo.id, 'cxl')
  assert.equal(talleSugerido(camisa, null), null)
})

test('historial y tenencia: entrega, «ya la tenía», devolución y baja en la persona', () => {
  const movs = [
    mov({ id: 'm1', activo_id: 'cm', origen_id: 'u-t', destino_id: 'u-p', fecha_hora: '2026-09-25T10:00:00Z', cantidad: 3, usuario_id: 'usr' }),
    mov({ id: 'm2', activo_id: 'cm', origen_id: 'u-p', destino_id: 'u-t', fecha_hora: '2026-09-25T11:00:00Z', cantidad: 1 }),
  ]
  const aj = (x: Partial<Ajuste>): Ajuste => ({ id: 'a', activo_id: 'cas', ubicacion_id: 'u-p', antes: 0, despues: 1, motivo: 'recuento', detalle: null, usuario_id: null, creado_en: '2026-09-25T09:00:00Z', ...x })
  const h = historialDePersona('u-p', movs, [aj({}), aj({ id: 'b', activo_id: 'cm', antes: 2, despues: 1, motivo: 'descartada', creado_en: '2026-09-25T12:00:00Z' })])
  assert.deepEqual(h.map((e) => [e.tipo, e.activoId, e.cantidad]), [
    ['baja', 'cm', 1], ['devolucion', 'cm', 1], ['entrega', 'cm', 3], ['ya_la_tenia', 'cas', 1],
  ])
  const t = tenencias('u-p', activos, [...existencias, { activo_id: 'cas', ubicacion_id: 'u-p', cantidad: 1 }], h)
  assert.deepEqual(t.map((x) => [x.activo.id, x.cantidad, x.ultima?.tipo]), [['cas', 1, 'ya_la_tenia'], ['cm', 2, 'entrega']])
  assert.deepEqual(historialDePersona(null, movs, []), [])
})

test('la entrega de la constancia firmada es «historica»: no sale de ningún lugar y lleva su respaldo', () => {
  const h = historialDePersona('u-p', [
    mov({ id: 'h1', activo_id: 'cas', origen_id: null, destino_id: 'u-p', fecha_hora: '2025-05-28T15:00:00Z', cantidad: 1, respaldo_drive_file_id: '19046gvCV0DW-E8Vwy9LCKPkoOFiVjzyo' }),
    mov({ id: 'h2', activo_id: 'cm', origen_id: null, destino_id: 'u-p', fecha_hora: '2025-05-28T15:00:00Z', cantidad: 1 }),
  ], [])
  assert.deepEqual(h.map((e) => [e.activoId, e.tipo, e.respaldo]), [['cas', 'historica', '19046gvCV0DW-E8Vwy9LCKPkoOFiVjzyo'], ['cm', 'entrega', null]])
  const t = tenencias('u-p', activos, [{ activo_id: 'cas', ubicacion_id: 'u-p', cantidad: 1 }], h)
  assert.equal(t[0].ultima?.tipo, 'historica')
})

test('lo cerrado al egresar es «egreso» en el historial y ya no está en su poder', () => {
  const aj: Ajuste = { id: 'e', activo_id: 'cm', ubicacion_id: 'u-p', antes: 2, despues: 0, motivo: 'egreso', detalle: 'egresó el 19/12/2025 · no devuelto', usuario_id: null, creado_en: '2025-12-19T15:00:00Z' }
  const h = historialDePersona('u-p', [], [aj])
  assert.deepEqual(h.map((e) => [e.tipo, e.cantidad]), [['egreso', 2]])
  assert.deepEqual(tenencias('u-p', activos, [], h), [])
})
