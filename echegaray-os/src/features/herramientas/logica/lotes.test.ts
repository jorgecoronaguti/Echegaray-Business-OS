import { test } from 'node:test'
import assert from 'node:assert/strict'
import { armarParque, activosEn, cantidadEn, rotuloLugares, origenPara } from './parque.ts'
import { advertencias, conCantidad, conOrigen, itemPorDefecto, origenesDeItems, paraLaBase, textoBotonMover, textoParte } from './mover.ts'
import { cantidadVisible, filtrar, filtrosDeURL, totales } from './inventario.ts'
import { controlDeUbicacion } from './planilla.ts'
import { dondeEstaElParque, obrasConHerramientas } from './resumen.ts'
import { historial } from './historial.ts'
import { activo, ubicacion } from './fixture.test-util.ts'
import type { ObraIndice } from '../types.ts'

// LOTES REPARTIDOS (20260922T1300): BAL-001 con 8 baldes, 5 en el Taller y 3 en la obra.

const obras: ObraIndice[] = [{ id: 'ob-ee', codigo: 'OB-0010', nombre: 'SF - ENTREPISO', estado: 'activa', cliente: 'San Francisco' }]

function parque() {
  return armarParque({
    ubicaciones: [
      ubicacion({ id: 'u-taller', tipo: 'taller', nombre: 'Taller' }),
      ubicacion({ id: 'u-ee', tipo: 'obra', obra_id: 'ob-ee' }),
    ],
    obras,
    activos: [
      activo({ id: 'bal', codigo: 'BAL-001', nombre: 'Balde de albañil · lote', cantidad: 8, ubicacion_id: 'u-taller' }),
      activo({ id: 'amo', codigo: 'AMO-001', nombre: 'Amoladora', ubicacion_id: 'u-ee' }),
      activo({ id: 'cas', codigo: 'CAS-001', nombre: 'Casco · lote', cantidad: 4, ubicacion_id: 'u-taller' }),
    ],
    existencias: [
      { activo_id: 'bal', ubicacion_id: 'u-taller', cantidad: 5 },
      { activo_id: 'bal', ubicacion_id: 'u-ee', cantidad: 3 },
      { activo_id: 'amo', ubicacion_id: 'u-ee', cantidad: 1 },
      { activo_id: 'cas', ubicacion_id: 'u-taller', cantidad: 4 },
    ],
    ajustes: [{ id: 'j1', activo_id: 'bal', ubicacion_id: 'u-ee', antes: 4, despues: 3, motivo: 'descartada', detalle: 'se rompió', usuario_id: null, creado_en: '2026-09-22T12:00:00Z' }],
    movimientos: [{ id: 'm1', activo_id: 'bal', origen_id: 'u-taller', destino_id: 'u-ee', fecha_hora: '2026-09-22T11:00:00Z', usuario_id: null, usuario_texto: null, lote_id: null, nota: null, corrige_a: null, importado: false, cantidad: 4 }],
    incidencias: [], nombres: {},
  })
}

test('el lote está en los dos lugares, con sus unidades en cada uno', () => {
  const p = parque()
  assert.deepEqual(activosEn(p, 'u-ee').map((a) => a.id).sort(), ['amo', 'bal'])
  assert.equal(cantidadEn(p, 'bal', 'u-ee'), 3)
  assert.equal(rotuloLugares(p, p.activoPorId.get('bal')!), 'Taller 5 · OB-0010 · SF - ENTREPISO 3')
  assert.equal(rotuloLugares(p, p.activoPorId.get('amo')!), 'OB-0010 · SF - ENTREPISO')
})

test('sin existencias cargadas (antes de la migración) cada activo está entero en su lugar', () => {
  const p = armarParque({ ...parque(), existencias: undefined })
  assert.equal(cantidadEn(p, 'bal', 'u-taller'), 8)
  assert.equal(cantidadEn(p, 'bal', 'u-ee'), 0)
})

test('inventario filtrado por la obra: el lote aparece con las 3 de ahí y los totales cuentan 3', () => {
  const p = parque()
  const f = filtrosDeURL({ ubicacion: 'u-ee' })
  const lista = filtrar(p, f)
  assert.deepEqual(lista.map((a) => a.id).sort(), ['amo', 'bal'])
  assert.equal(cantidadVisible(p, p.activoPorId.get('bal')!, 'u-ee'), 3)
  assert.equal(totales(p, lista, 'u-ee').unidades, 4)
  const todo = totales(p, filtrar(p, filtrosDeURL({})))
  assert.equal(todo.unidades, 13)
  assert.deepEqual(todo.porObra.map((o) => [o.rotulo, o.activos]), [['OB-0010 · SF - ENTREPISO', 2]])
})

test('mover: sale del lugar pedido, pregunta cuántas y no deja pasar más de las que hay', () => {
  const p = parque()
  const bal = p.activoPorId.get('bal')!
  let it = itemPorDefecto(p, bal, 'u-ee')
  assert.deepEqual([it.origen, it.cantidad, it.disponible], ['u-ee', 3, 3])
  it = conOrigen(p, it, 'u-taller')
  assert.deepEqual([it.cantidad, it.disponible], [5, 5])
  assert.equal(conCantidad(it, 9).cantidad, 5)
  assert.equal(conCantidad(it, 0).cantidad, 1)
  it = conCantidad(it, 2)
  assert.equal(textoParte(it), '2 de 5')
  assert.deepEqual(paraLaBase([it]), [{ activo: 'bal', origen: 'u-taller', cantidad: 2 }])
  assert.equal(origenPara(p, bal, 'u-inexistente'), 'u-taller', 'sin unidades en el pedido: de donde hay más')
  const amo = itemPorDefecto(p, p.activoPorId.get('amo')!)
  assert.deepEqual(origenesDeItems(p, [it, amo]).map((g) => [g.rotulo, g.cuenta, g.unidades]), [['Taller', 1, 2], ['OB-0010 · SF - ENTREPISO', 1, 1]])
  assert.equal(textoBotonMover(2, 3), 'Mover 2 activos · 3 unidades')
  assert.equal(textoBotonMover(2, 2), 'Mover 2 activos')
})

test('«ya está ahí» mira de dónde sale, no dónde tiene otras unidades', () => {
  const p = parque()
  const it = itemPorDefecto(p, p.activoPorId.get('bal')!, 'u-taller')
  assert.equal(advertencias(p, [it.activo], 'u-ee', [it]).yaEstan.length, 0)
  assert.equal(advertencias(p, [it.activo], 'u-taller', [it]).yaEstan.length, 1)
})

test('la planilla de la obra cuenta lo que hay ahí', () => {
  const c = controlDeUbicacion(parque(), 'u-ee', new Date('2026-09-22T15:00:00Z'))
  assert.equal(c.activos, 2)
  assert.equal(c.unidades, 4)
  assert.equal(c.porCategoria.flatMap((g) => g.filas).find((f) => f.activo.id === 'bal')?.cantidad, 3)
})

test('resumen: cada obra con lo que tiene, y el parque por tipo cuenta el lote en los dos', () => {
  const p = parque()
  assert.deepEqual(obrasConHerramientas(p).map((o) => [o.rotulo, o.cliente, o.activos, o.unidades]), [['OB-0010 · SF - ENTREPISO', 'San Francisco', 2, 4]])
  assert.deepEqual(dondeEstaElParque(p).map((f) => [f.tipo, f.activos]), [['taller', 2], ['obra', 2]])
})

test('historial: el movimiento dice cuántas y la baja parcial queda', () => {
  const h = historial(parque(), 'bal').map((r) => r.texto)
  assert.ok(h.includes('4 u. · Taller → OB-0010 · SF - ENTREPISO'), h.join(' | '))
  assert.ok(h.includes('Baja de 1 u. en OB-0010 · SF - ENTREPISO por descarte'), h.join(' | '))
})
