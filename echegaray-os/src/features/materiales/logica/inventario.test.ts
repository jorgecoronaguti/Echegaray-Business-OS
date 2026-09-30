// Inventario, resumen y libro de Material (dueño, 29-30/09/2026: «control de stock» calcando Herramientas).
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  cifrasMaterial, decisionesMaterial, dondeEstaMaterial, entregadoSinLlegada, esParcial, inventarioPorMaterial, libroMaterial, normalizar,
  obrasDeMaterial, tipoLibroDeUrl, type MovimientoMaterial,
} from './inventario.ts'
import { lecturaPedido } from '../../../shared/lib/estadoPedidoMaterial.ts'
import type { Pedido } from './pedidos.ts'
import type { Existencia, Lugar, Remito } from './stock.ts'

const TALLER: Lugar = { id: 'u-t', rotulo: 'Taller', tipo: 'taller', obra_id: null }
const OBRA_A: Lugar = { id: 'u-a', rotulo: 'OB-0001 · Arcor', tipo: 'obra', obra_id: 'o-a' }
const OBRA_B: Lugar = { id: 'u-b', rotulo: 'OB-0002 · Barrio', tipo: 'obra', obra_id: 'o-b' }
const LUGARES = [OBRA_B, TALLER, OBRA_A]

const ex = (material_id: string, material: string, ubicacion_id: string, cantidad: number, unidad: string | null = 'bolsa'): Existencia =>
  ({ material_id, material, unidad, ubicacion_id, cantidad })

const mov = (p: Partial<MovimientoMaterial> & Pick<MovimientoMaterial, 'id' | 'tipo' | 'creado_en'>): MovimientoMaterial => ({
  material_id: 'm-cal', material: 'Cal', unidad: 'bolsa', origen_id: null, destino_id: null, cantidad: 1, pedido_id: null, remito_id: null,
  motivo: null, nota: null, quien: null, ...p,
})

const ped = (p: Partial<Pedido> & Pick<Pedido, 'id_pedido' | 'estado'>): Pedido => ({
  obra_texto: null, obra_canonica_id: null, fecha: null, material: 'Cal', cantidad: 10, unidad: 'bolsa', origen: null, urgencia: null, nota: null,
  pedido_grupo: null, created_at: '2026-09-20T12:00:00Z', cantidad_recibida: 0, obra: 'o-a', obra_rotulo: 'OB-0001 · Arcor',
  lectura: lecturaPedido(p.estado), ...p,
})

test('inventario: una fila por material, suma los lugares, Taller primero, sin los ceros', () => {
  const r = inventarioPorMaterial(
    [ex('m-cal', 'Cal', 'u-a', 3), ex('m-cal', 'Cal', 'u-t', 7.5), ex('m-hie', 'Hierro del 8', 'u-b', 0, 'tira'), ex('m-are', 'Arena', 'u-b', 2, 'm3')],
    LUGARES, [mov({ id: '1', tipo: 'entrada', creado_en: '2026-09-29T10:00:00Z' }), mov({ id: '2', tipo: 'consumo', creado_en: '2026-09-30T10:00:00Z' })],
  )
  assert.deepEqual(r.map((f) => f.material), ['Arena', 'Cal'])
  const cal = r[1]
  assert.equal(cal.total, 10.5)
  assert.deepEqual(cal.lugares.map((l) => l.rotulo), ['Taller', 'OB-0001 · Arcor'])
  assert.equal(cal.ultimo, '2026-09-30T10:00:00Z')
  assert.equal(r[0].ultimo, null)
})

test('inventario: la búsqueda ignora tildes y mayúsculas; el filtro de lugar deja sólo lo de ese lugar', () => {
  const e = [ex('m-cal', 'Cal hidráulica', 'u-a', 3), ex('m-cal', 'Cal hidráulica', 'u-t', 7), ex('m-are', 'Arena', 'u-t', 2)]
  assert.deepEqual(inventarioPorMaterial(e, LUGARES, [], { q: 'HIDRAULICA' }).map((f) => f.material), ['Cal hidráulica'])
  const soloA = inventarioPorMaterial(e, LUGARES, [], { lugar: 'u-a' })
  assert.equal(soloA.length, 1)
  assert.equal(soloA[0].total, 3)
  assert.equal(normalizar('  Ñandú Cañería '), 'nandu caneria')
})

test('inventario: un saldo en un lugar que la lectura no trajo se muestra como «Otro lugar», no se esconde', () => {
  const r = inventarioPorMaterial([ex('m-cal', 'Cal', 'u-archivada', 4)], LUGARES, [])
  assert.equal(r[0].lugares[0].rotulo, 'Otro lugar')
  assert.equal(r[0].total, 4)
})

test('parcial y entregado sin llegada: dos cosas distintas', () => {
  assert.equal(esParcial(ped({ id_pedido: 'p', estado: 'COMPRADO', cantidad_recibida: 4 })), true)
  assert.equal(esParcial(ped({ id_pedido: 'p', estado: 'ENTREGADO', cantidad_recibida: 10 })), false)
  assert.equal(esParcial(ped({ id_pedido: 'p', estado: 'PEDIDO', cantidad_recibida: 0 })), false)
  assert.equal(esParcial(ped({ id_pedido: 'p', estado: 'CANCELADO', cantidad_recibida: 4 })), false)
  assert.equal(esParcial(ped({ id_pedido: 'p', estado: 'PEDIDO', cantidad: null, cantidad_recibida: 4 })), false)
  assert.equal(entregadoSinLlegada(ped({ id_pedido: 'p', estado: 'ENTREGADO', cantidad_recibida: 0 })), true)
  assert.equal(entregadoSinLlegada(ped({ id_pedido: 'p', estado: 'ENTREGADO', cantidad_recibida: null })), true)
  assert.equal(entregadoSinLlegada(ped({ id_pedido: 'p', estado: 'ENTREGADO', cantidad_recibida: 10 })), false)
})

test('cifras: cuenta sin entregar, parciales, materiales y lugares con saldo, movimientos de 7 días', () => {
  const hoy = new Date('2026-09-30T12:00:00Z')
  const c = cifrasMaterial(
    [ped({ id_pedido: '1', estado: 'PEDIDO' }), ped({ id_pedido: '2', estado: 'COMPRADO', cantidad_recibida: 3 }),
      ped({ id_pedido: '3', estado: 'ENTREGADO' }), ped({ id_pedido: '4', estado: 'CANCELADO' })],
    [ex('m-cal', 'Cal', 'u-a', 3), ex('m-cal', 'Cal', 'u-t', 1), ex('m-are', 'Arena', 'u-t', 0)],
    [mov({ id: 'a', tipo: 'entrada', creado_en: '2026-09-29T12:00:00Z' }), mov({ id: 'b', tipo: 'entrada', creado_en: '2026-09-20T12:00:00Z' })],
    hoy,
  )
  assert.deepEqual(c, { sinEntregar: 2, parciales: 1, materialesConStock: 1, lugaresConStock: 2, movimientos7: 1, entregadosSinLlegada: 1 })
})

test('obras: las que tienen saldo o pedidos abiertos, primero las que más esperan', () => {
  const r = obrasDeMaterial(
    [ped({ id_pedido: '1', estado: 'PEDIDO', obra: 'o-b', obra_rotulo: 'OB-0002 · Barrio' }), ped({ id_pedido: '2', estado: 'VISTO', obra: 'o-b', obra_rotulo: 'OB-0002 · Barrio' }),
      ped({ id_pedido: '3', estado: 'ENTREGADO', cantidad_recibida: 10 }), ped({ id_pedido: '4', estado: 'PEDIDO', obra: 'o-c', obra_rotulo: 'OB-0003 · Casa' })],
    [ex('m-cal', 'Cal', 'u-a', 3), ex('m-are', 'Arena', 'u-a', 1), ex('m-cal', 'Cal', 'u-t', 9)],
    LUGARES,
  )
  assert.deepEqual(r.map((o) => [o.rotulo, o.materiales, o.abiertos, o.lugar_id]), [
    ['OB-0002 · Barrio', 0, 2, 'u-b'],
    ['OB-0003 · Casa', 0, 1, null],
    ['OB-0001 · Arcor', 2, 0, 'u-a'],
  ])
})

test('decisiones: parcial por pedido, sin llegar por obra, sin obra y entregados sin llegada agregados', () => {
  const d = decisionesMaterial([
    ped({ id_pedido: '1', estado: 'COMPRADO', cantidad: 10, cantidad_recibida: 4, material: 'Hierro', unidad: 'tira' }),
    ped({ id_pedido: '2', estado: 'PEDIDO', created_at: '2026-09-25T00:00:00Z' }),
    ped({ id_pedido: '3', estado: 'VISTO', created_at: '2026-09-22T00:00:00Z', material: 'Arena' }),
    ped({ id_pedido: '4', estado: 'PEDIDO', obra: null, obra_rotulo: null }),
    ped({ id_pedido: '5', estado: 'ENTREGADO', obra: null }),
    ped({ id_pedido: '6', estado: 'ENTREGADO' }),
  ])
  assert.deepEqual(d.map((x) => x.clave), ['parcial', 'sin_llegar', 'sin_obra', 'entregado_sin_llegada'])
  assert.match(d[0].detalle, /Faltan 6 tira/)
  // pedido 1 (COMPRADO) también está sin entregar: la obra A tiene 3 abiertos y el más viejo manda la fecha
  assert.equal(d[1].titulo, '3 pedidos sin llegar')
  assert.equal(d[1].desde, '2026-09-20T12:00:00Z')
  assert.equal(d[3].titulo, '2 pedidos figuran Entregado sin llegada contada')
  assert.ok(d.every((x) => x.href.startsWith('/herramientas/material?ver=pedidos')))
  assert.equal(new Set(d.map((x) => x.id)).size, d.length)
  assert.deepEqual(decisionesMaterial([ped({ id_pedido: 'x', estado: 'ENTREGADO', cantidad_recibida: 10 })]), [])
})

test('dónde está: Taller contra obras, con lugares y renglones', () => {
  assert.deepEqual(dondeEstaMaterial(LUGARES, [ex('m1', 'Cal', 'u-t', 1), ex('m2', 'Arena', 'u-t', 2), ex('m1', 'Cal', 'u-a', 1), ex('m1', 'Cal', 'u-b', 0)]), [
    { tipo: 'taller', lugares: 1, renglones: 2 },
    { tipo: 'obra', lugares: 1, renglones: 1 },
  ])
})

test('libro: más nuevo primero, signo por tipo, remito por número, filtros por tipo y por lugar', () => {
  const rem: Remito = { id: 'r1', numero: 7, emitido_en: '', origen_id: 'u-a', destino_id: 'u-t', origen_rotulo: '', destino_rotulo: '', entrega_nombre: null, recibe_nombre: null, nota: null, items: [] }
  const m = [
    mov({ id: '1', tipo: 'entrada', destino_id: 'u-a', pedido_id: 'p', cantidad: 10, creado_en: '2026-09-28T10:00:00Z' }),
    mov({ id: '2', tipo: 'entrada', destino_id: 'u-t', cantidad: 12.5, creado_en: '2026-09-28T11:00:00Z', nota: 'stock inicial' }),
    mov({ id: '3', tipo: 'consumo', origen_id: 'u-a', cantidad: 2, creado_en: '2026-09-29T10:00:00Z' }),
    mov({ id: '4', tipo: 'traslado', origen_id: 'u-a', destino_id: 'u-t', cantidad: 3, remito_id: 'r1', creado_en: '2026-09-29T11:00:00Z' }),
    mov({ id: '5', tipo: 'ajuste', destino_id: 'u-t', motivo: 'recuento', cantidad: 1, creado_en: '2026-09-30T10:00:00Z' }),
    mov({ id: '6', tipo: 'ajuste', origen_id: 'u-t', motivo: 'perdido', cantidad: 1, creado_en: '2026-09-30T11:00:00Z' }),
  ]
  const r = libroMaterial(m, LUGARES, [rem])
  assert.deepEqual(r.map((x) => x.id), ['6', '5', '4', '3', '2', '1'])
  assert.deepEqual(r.map((x) => x.que), ['Recuento · perdido', 'Recuento · recuento', 'Envío', 'Usé', 'Ingreso', 'Llegó'])
  assert.deepEqual(r.map((x) => x.cantidad), ['−1 bolsa', '+1 bolsa', '3 bolsa', '−2 bolsa', '+12,5 bolsa', '+10 bolsa'])
  assert.equal(r[2].remito, 'R-0007')
  assert.equal(r[2].desde, 'OB-0001 · Arcor')
  assert.equal(r[2].hacia, 'Taller')
  assert.deepEqual(libroMaterial(m, LUGARES, [], { tipo: 'entrada' }).map((x) => x.id), ['2', '1'])
  assert.deepEqual(libroMaterial(m, LUGARES, [], { lugar: 'u-a' }).map((x) => x.id), ['4', '3', '1'])
  assert.equal(tipoLibroDeUrl('consumo'), 'consumo')
  assert.equal(tipoLibroDeUrl('borrar'), null)
})
