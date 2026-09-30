import { test } from 'node:test'
import assert from 'node:assert/strict'
import { armarParque, cantidadEn, libreEn, lugaresDe, rotuloQuien } from './parque.ts'
import { candidatos, filtrosDeURL, totales } from './inventario.ts'
import { itemsDeRecuento } from './recuento.ts'
import { nombresRepetidos, decisiones } from './resumen.ts'
import { colaDeEtiquetas } from './etiquetas.ts'
import {
  campoDeTalle, compararTalle, historialDePersona, prendas, talleSugerido, tenedoresEn, tenencias,
} from './vestimenta.ts'
import { activo, mov, ubicacion } from './fixture.test-util.ts'
import type { Ajuste, Existencia } from '../types.ts'

// DÓNDE ≠ QUIÉN (dueño, 30/09/2026): «la ubicación es un cliente/una obra, no una persona; eso es quien
// lo tiene». Juan (per-1) trabaja en la obra u-o y tiene 2 camisas M ahí; una más está libre en la obra.
const ubicaciones = [
  ubicacion({ id: 'u-t', tipo: 'taller', nombre: 'Taller' }),
  ubicacion({ id: 'u-o', tipo: 'obra', nombre: 'QP Salón' }),
  ubicacion({ id: 'u-o2', tipo: 'obra', nombre: 'ME Playón' }),
]
const activos = [
  activo({ id: 'h', codigo: 'AMO-001', nombre: 'Amoladora', ubicacion_id: 'u-t' }),
  activo({ id: 'cas', codigo: 'CAS-001', clase: 'epp', categoria: 'EPP', nombre: 'Casco', ubicacion_id: 'u-t' }),
  activo({ id: 'cm', codigo: 'CAM-002', clase: 'ropa', categoria: 'Ropa de trabajo', nombre: 'Camisa de trabajo', talle: 'M', cantidad: 4, ubicacion_id: 'u-t' }),
  activo({ id: 'cs', codigo: 'CAM-001', clase: 'ropa', categoria: 'Ropa de trabajo', nombre: 'Camisa de trabajo', talle: 'S', cantidad: 0, ubicacion_id: null }),
  activo({ id: 'cxl', codigo: 'CAM-004', clase: 'ropa', categoria: 'Ropa de trabajo', nombre: 'Camisa de trabajo', talle: 'XL', cantidad: 0, ubicacion_id: null }),
  activo({ id: 'p44', codigo: 'PAN-004', clase: 'ropa', categoria: 'Ropa de trabajo', nombre: 'Pantalón de trabajo', talle: '44', cantidad: 0, ubicacion_id: null }),
]
const existencias: Existencia[] = [
  { activo_id: 'h', ubicacion_id: 'u-t', cantidad: 1, persona_id: null },
  { activo_id: 'cas', ubicacion_id: 'u-t', cantidad: 1, persona_id: null },
  { activo_id: 'cm', ubicacion_id: 'u-t', cantidad: 1, persona_id: null },
  { activo_id: 'cm', ubicacion_id: 'u-o', cantidad: 1, persona_id: null },
  { activo_id: 'cm', ubicacion_id: 'u-o', cantidad: 2, persona_id: 'per-1' },
]
const personas = { 'per-1': 'Juan Pérez', 'per-2': 'Ana Gómez' }
const parque = (ex: Existencia[] = existencias) => armarParque({ ubicaciones, activos, existencias: ex, obras: [], movimientos: [], incidencias: [], nombres: {}, personas })

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

test('ropa en 0 es «sin stock», no «sin ubicación»; lo entregado está en su obra y cuenta en «lo tiene alguien»', () => {
  const p = parque()
  const t = totales(p, candidatos(p, filtrosDeURL({ clase: 'ropa' })))
  assert.deepEqual(t.porTipo, [{ tipo: 'taller', activos: 1 }, { tipo: 'obra', activos: 1 }, { tipo: 'sin_stock', activos: 3 }])
  assert.equal(t.conAlguien, 1)
  assert.deepEqual(candidatos(p, { ...filtrosDeURL({ clase: 'ropa' }), especial: 'con_alguien' }).map((a) => a.id), ['cm'])
  assert.deepEqual(candidatos(p, { ...filtrosDeURL({ clase: 'ropa' }), q: 'juan' }).map((a) => a.id), ['cm'])
  assert.equal(decisiones(p).find((d) => d.clave === 'sin_ubicacion'), undefined)
})

test('los talles de una misma prenda no son «nombres repetidos» ni van a la cola de etiquetas', () => {
  assert.deepEqual(nombresRepetidos(activos), [])
  assert.deepEqual(colaDeEtiquetas(activos).map((x) => x.activo.id), ['h'])
})

test('el recuento del Taller trae el EPP y la ropa aunque estén en 0; en la obra se cuenta sólo lo libre', () => {
  const p = parque()
  const t = itemsDeRecuento(p, 'u-t')
  assert.deepEqual(t.map((i) => [i.codigo, i.esperado]), [
    ['AMO-001', 1], ['CAM-001', 0], ['CAM-002', 1], ['CAM-004', 0], ['CAS-001', 1], ['PAN-004', 0],
  ])
  assert.equal(t.find((i) => i.codigo === 'CAM-002')?.nombre, 'Camisa de trabajo · M')
  assert.deepEqual(itemsDeRecuento(p, 'u-o').map((i) => [i.codigo, i.esperado]), [['CAM-002', 1]])
  // Si todo lo de la obra lo tiene alguien, no hay nada libre que contar ahí.
  assert.deepEqual(itemsDeRecuento(parque(existencias.filter((e) => !(e.ubicacion_id === 'u-o' && !e.persona_id))), 'u-o'), [])
})

test('prendas: disponible = lo que no tiene nadie (esté donde esté); entregadas = lo que tiene alguien', () => {
  const p = parque()
  const [camisa, pantalon] = prendas(p.activos, p.existencias ?? [], 'ropa')
  assert.equal(camisa.nombre, 'Camisa de trabajo')
  assert.deepEqual(camisa.talles.map((t) => [t.talle, t.disponible, t.entregadas]), [['S', 0, 0], ['M', 2, 2], ['XL', 0, 0]])
  assert.equal(campoDeTalle(camisa), 'camisa')
  assert.equal(campoDeTalle(pantalon), 'pantalon')
  assert.equal(campoDeTalle({ nombre: 'Botín de seguridad', talles: [] }), 'calzado')
  assert.equal(talleSugerido(camisa, { camisa: 'xl', pantalon: null, calzado: null })?.activo.id, 'cxl')
  assert.equal(talleSugerido(camisa, null), null)
})

test('el lugar es la obra; quién lo tiene va aparte: libre, tenidas y «lo tiene»', () => {
  const p = parque()
  const enObra = lugaresDe(p, 'cm').find((e) => e.ubicacion_id === 'u-o')!
  assert.deepEqual([enObra.cantidad, enObra.libre, enObra.tenidas.map((t) => [t.persona_id, t.cantidad])], [3, 1, [['per-1', 2]]])
  assert.equal(cantidadEn(p, 'cm', 'u-o'), 3)
  assert.equal(libreEn(p, 'cm', 'u-o'), 1)
  assert.equal(libreEn(p, 'cm', 'u-t'), 1)
  assert.equal(rotuloQuien(p, { id: 'cm' }), 'Juan Pérez 2')
  assert.equal(rotuloQuien(p, { id: 'cas' }), '')
  // Ningún lugar es una persona: el inventario no tiene un tipo «persona».
  assert.ok(lugaresDe(p, 'cm').every((e) => p.ubicacionPorId.get(e.ubicacion_id)?.tipo !== 'persona'))
  const una = parque([...existencias, { activo_id: 'cas', ubicacion_id: 'u-o', cantidad: 1, persona_id: 'per-2' }])
  assert.equal(rotuloQuien(una, { id: 'cas' }), 'Ana Gómez')
})

test('la vista de una obra lista cada persona con lo que tiene; lo libre no entra', () => {
  const ex: Existencia[] = [...existencias, { activo_id: 'cas', ubicacion_id: 'u-o', cantidad: 1, persona_id: 'per-2' }]
  const t = tenedoresEn('u-o', activos, ex, (id) => personas[id as keyof typeof personas])
  assert.deepEqual(t.map((x) => [x.personaId, x.unidades, x.items.map((i) => [i.activo.id, i.cantidad])]), [
    ['per-2', 1, [['cas', 1]]], ['per-1', 2, [['cm', 2]]],
  ])
  assert.deepEqual(tenedoresEn('u-t', activos, ex), [])
})

test('historial por persona: entrega (queda en su obra), devolución (queda donde está), cambio de obra y baja', () => {
  const movs = [
    mov({ id: 'm1', activo_id: 'cm', origen_id: 'u-t', destino_id: 'u-o', persona_destino: 'per-1', fecha_hora: '2026-09-25T10:00:00Z', cantidad: 3, usuario_id: 'usr' }),
    mov({ id: 'm2', activo_id: 'cm', origen_id: 'u-o', destino_id: 'u-o', persona_origen: 'per-1', persona_destino: null, fecha_hora: '2026-09-25T11:00:00Z', cantidad: 1 }),
    mov({ id: 'm3', activo_id: 'cm', origen_id: 'u-o', destino_id: 'u-o2', persona_origen: 'per-1', persona_destino: 'per-1', fecha_hora: '2026-09-25T13:00:00Z', cantidad: 1 }),
    // De otra persona, y un movimiento de lugar sin persona: no son de Juan.
    mov({ id: 'm4', activo_id: 'cas', origen_id: 'u-t', destino_id: 'u-o', persona_destino: 'per-2', fecha_hora: '2026-09-25T14:00:00Z', cantidad: 1 }),
    mov({ id: 'm5', activo_id: 'h', origen_id: 'u-t', destino_id: 'u-o', fecha_hora: '2026-09-25T15:00:00Z', cantidad: 1 }),
  ]
  const aj = (x: Partial<Ajuste>): Ajuste => ({ id: 'a', activo_id: 'cas', ubicacion_id: 'u-o', persona_id: 'per-1', antes: 0, despues: 1, motivo: 'recuento', detalle: null, usuario_id: null, creado_en: '2026-09-25T09:00:00Z', ...x })
  const h = historialDePersona('per-1', movs, [
    aj({}),
    aj({ id: 'b', activo_id: 'cm', antes: 2, despues: 1, motivo: 'descartada', creado_en: '2026-09-25T12:00:00Z' }),
    aj({ id: 'c', persona_id: null, motivo: 'descartada', antes: 3, despues: 2, creado_en: '2026-09-25T16:00:00Z' }),
  ])
  assert.deepEqual(h.map((e) => [e.tipo, e.activoId, e.cantidad, e.otroLugar, e.donde]), [
    ['traslado', 'cm', 1, 'u-o', 'u-o2'],
    ['baja', 'cm', 1, null, 'u-o'],
    ['devolucion', 'cm', 1, null, 'u-o'],
    ['entrega', 'cm', 3, 'u-t', 'u-o'],
    ['ya_la_tenia', 'cas', 1, null, 'u-o'],
  ])
  const t = tenencias('per-1', activos, [...existencias, { activo_id: 'cas', ubicacion_id: 'u-o', cantidad: 1, persona_id: 'per-1' }], h)
  assert.deepEqual(t.map((x) => [x.activo.id, x.cantidad, x.dondeId, x.ultima?.tipo]), [['cas', 1, 'u-o', 'ya_la_tenia'], ['cm', 2, 'u-o', 'entrega']])
  assert.deepEqual(historialDePersona(null, movs, []), [])
})

test('la entrega de la constancia firmada es «historica»: no sale de ningún lugar y lleva su respaldo', () => {
  const h = historialDePersona('per-1', [
    mov({ id: 'h1', activo_id: 'cas', origen_id: null, destino_id: 'u-o', persona_destino: 'per-1', fecha_hora: '2025-05-28T15:00:00Z', cantidad: 1, respaldo_drive_file_id: '19046gvCV0DW-E8Vwy9LCKPkoOFiVjzyo' }),
    mov({ id: 'h2', activo_id: 'cm', origen_id: null, destino_id: 'u-o', persona_destino: 'per-1', fecha_hora: '2025-05-28T15:00:00Z', cantidad: 1 }),
  ], [])
  assert.deepEqual(h.map((e) => [e.activoId, e.tipo, e.respaldo]), [['cas', 'historica', '19046gvCV0DW-E8Vwy9LCKPkoOFiVjzyo'], ['cm', 'entrega', null]])
  const t = tenencias('per-1', activos, [{ activo_id: 'cas', ubicacion_id: 'u-o', cantidad: 1, persona_id: 'per-1' }], h)
  assert.equal(t[0].ultima?.tipo, 'historica')
})

test('lo cerrado al egresar es «egreso» en el historial y ya no está en su poder', () => {
  const aj: Ajuste = { id: 'e', activo_id: 'cm', ubicacion_id: 'u-o', persona_id: 'per-1', antes: 2, despues: 0, motivo: 'egreso', detalle: 'egresó el 19/12/2025 · no devuelto', usuario_id: null, creado_en: '2025-12-19T15:00:00Z' }
  const h = historialDePersona('per-1', [], [aj])
  assert.deepEqual(h.map((e) => [e.tipo, e.cantidad]), [['egreso', 2]])
  assert.deepEqual(tenencias('per-1', activos, [], h), [])
})
