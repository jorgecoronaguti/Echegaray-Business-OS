// MATERIAL — lo que se puede romper sin que la pantalla se entere.
//
//   1. Un pedido de la app colgado de la obra equivocada (o de ninguna) porque su nombre no está en
//      el diccionario de alias: la app trae el id, y el id manda.
//   2. Un pedido de tres ítems dibujado como tres pedidos en el teléfono, o marcado «Entregado»
//      cuando sólo llegó uno de los tres.
//   3. El filtro por defecto («Sin entregar») que esconde lo cancelado como si estuviera pendiente.
//   4. Una fila del formulario a medias que pasa como si fuera vacía.
import test from 'node:test'
import assert from 'node:assert/strict'
import { indiceDeAlias } from '../../../../orquestador/lib/obra-operacion.mjs'
import {
  agruparPedidos, contarSinEntregar, filtrarPedidos, filtroEstadoDeUrl, hrefMaterialEscritorio, normalizarItems,
  resolverObras, textoCantidad, type FilaPedido,
} from './pedidos.ts'
import { PASOS_PEDIDO, esPasoPedido, lecturaPedido, sinEntregar } from '../../../shared/lib/estadoPedidoMaterial.ts'

const fila = (p: Partial<FilaPedido>): FilaPedido => ({
  id_pedido: 'x', obra_texto: null, obra_canonica_id: null, fecha: '2026-09-23', material: 'Cemento', cantidad: 10,
  unidad: 'bolsa', estado: 'PEDIDO', origen: 'app', urgencia: 'semana', nota: null, pedido_grupo: null,
  created_at: '2026-09-23T10:00:00Z', ...p,
})
const indice = indiceDeAlias([{ alias: 'ESTRELLA', obra_id: 'la-estrella', clasificacion: 'obra' }]) as Map<string, string | symbol>
const rotulos = new Map([['la-estrella', 'OB-0001 · LE - OBRA GENERAL'], ['quattropani', 'OB-0008 · QP - SALÓN COMERCIAL']])

test('la obra la manda el id cuando lo hay; el texto sólo resuelve lo que viene del Sheet', () => {
  const [app, sheet, perdida] = resolverObras([
    fila({ obra_canonica_id: 'quattropani', obra_texto: 'QP - SALÓN COMERCIAL' }),
    fila({ origen: 'appsheet_sheet', obra_texto: 'Estrella' }),
    fila({ origen: 'appsheet_sheet', obra_texto: 'Taller' }),
  ], indice, rotulos)
  assert.equal(app.obra, 'quattropani')
  assert.equal(app.obra_rotulo, 'OB-0008 · QP - SALÓN COMERCIAL')
  assert.equal(sheet.obra, 'la-estrella')
  assert.equal(perdida.obra, null, 'un texto que no resuelve no se cuelga de ninguna obra')
  assert.equal(perdida.obra_rotulo, 'Taller', 'pero el texto se conserva para leerlo')
})

test('tres ítems del mismo pedido son UNA tarjeta, y el pedido está entregado sólo si todos lo están', () => {
  const filas = resolverObras([
    fila({ id_pedido: 'APP-1-1', pedido_grupo: 'g1', estado: 'ENTREGADO' }),
    fila({ id_pedido: 'APP-1-2', pedido_grupo: 'g1', estado: 'VISTO' }),
    fila({ id_pedido: 'APP-1-3', pedido_grupo: 'g1', estado: 'ENTREGADO' }),
    fila({ id_pedido: '79ca0fda', origen: 'appsheet_sheet', estado: 'ENTREGADO' }),
  ], indice, rotulos)
  const grupos = agruparPedidos(filas)
  assert.equal(grupos.length, 2)
  assert.equal(grupos[0].items.length, 3)
  assert.equal(grupos[0].lectura.clave, 'visto', 'el estado del pedido es el del ítem menos avanzado')
  assert.equal(grupos[1].lectura.clave, 'entregado')
})

test('«sin entregar» deja afuera lo entregado y lo cancelado; el resto de filtros es exacto', () => {
  const filas = resolverObras([
    fila({ id_pedido: 'a', estado: 'PEDIDO', obra_canonica_id: 'quattropani' }),
    fila({ id_pedido: 'b', estado: 'ENTREGADO', obra_canonica_id: 'quattropani' }),
    fila({ id_pedido: 'c', estado: 'cancelado', obra_canonica_id: 'quattropani' }),
    fila({ id_pedido: 'd', estado: 'COMPRADO', obra_canonica_id: 'la-estrella' }),
  ], indice, rotulos)
  assert.deepEqual(filtrarPedidos(filas, { obra: null, estado: 'sin_entregar' }).map((f) => f.id_pedido), ['a', 'd'])
  assert.deepEqual(filtrarPedidos(filas, { obra: 'quattropani', estado: 'todos' }).map((f) => f.id_pedido), ['a', 'b', 'c'])
  assert.deepEqual(filtrarPedidos(filas, { obra: null, estado: 'comprado' }).map((f) => f.id_pedido), ['d'])
  assert.equal(contarSinEntregar(filas, ['quattropani']), 1)
  assert.equal(filtroEstadoDeUrl('cualquiera'), 'sin_entregar', 'un valor desconocido en la URL abre lo pendiente')
  assert.equal(hrefMaterialEscritorio({ obra: 'quattropani', estado: 'todos' }), '/herramientas/material?obra=quattropani&estado=todos')
  assert.equal(hrefMaterialEscritorio({ estado: 'sin_entregar' }), '/herramientas/material')
})

test('el vocabulario: los cuatro pasos de la app y lo que trae el Sheet leen igual', () => {
  assert.deepEqual(PASOS_PEDIDO.map((p) => p.valor), ['PEDIDO', 'VISTO', 'COMPRADO', 'ENTREGADO'])
  assert.equal(lecturaPedido('VISTO').tono, 'curso')
  assert.equal(lecturaPedido('COMPRADO').clave, 'comprado')
  assert.equal(lecturaPedido('ENTREGADO').tono, 'pos', 'entregado es lo único positivo')
  assert.equal(lecturaPedido('PEDIDO').clave, 'pedido')
  assert.equal(lecturaPedido('').tono, 'nulo', 'sin estado no es pendiente')
  assert.equal(sinEntregar('cancelado'), false)
  assert.equal(esPasoPedido('visto'), false, 'se guarda en mayúsculas, como el Sheet')
})

test('una fila vacía del formulario se ignora; una a medias se rechaza con el motivo', () => {
  const ok = normalizarItems(['Cemento', '', 'Hierro 8'], ['10', '', '2,5'], ['bolsa', '', 'barra'])
  assert.ok(ok.ok)
  if (ok.ok) assert.deepEqual(ok.items, [
    { material: 'Cemento', cantidad: 10, unidad: 'bolsa' },
    { material: 'Hierro 8', cantidad: 2.5, unidad: 'barra' },
  ])
  const sinMaterial = normalizarItems([''], ['3'], [''])
  assert.equal(sinMaterial.ok, false)
  const sinCantidad = normalizarItems(['Arena'], ['0'], ['m3'])
  assert.equal(sinCantidad.ok, false)
  if (!sinCantidad.ok) assert.match(sinCantidad.error, /Arena/)
  assert.equal(normalizarItems([], [], []).ok, false, 'un pedido sin ítems no es un pedido')
  assert.equal(textoCantidad(2.5, 'm3'), '2,5 m3')
  assert.equal(textoCantidad(null, null), '—')
})
