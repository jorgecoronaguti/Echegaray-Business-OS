import test from 'node:test'
import assert from 'node:assert/strict'
import { acopiadoParaObra, armarItemsMover, claveRenglon, renglonesDeMover, desgloseDeLugar, disponibleAutomatico, esTaller, fechaCorta, obraDeDestino, obrasAcopiables, repartoAutomatico } from './acopio.ts'
import { leerCantidad, type Existencia } from './stock.ts'

const fila = (over: Partial<Existencia>): Existencia => ({ material_id: 'm1', material: 'Hierro 8', unidad: 'tira', ubicacion_id: 'taller', cantidad: 1, ...over })

const existencias: Existencia[] = [
  fila({ cantidad: 4 }),
  fila({ cantidad: 10, destino_obra_id: 'ob-a', destino_rotulo: 'OB-0001 · A', desde: '2026-09-28' }),
  fila({ cantidad: 3, destino_obra_id: 'ob-b', destino_rotulo: 'OB-0002 · B', desde: '2026-09-29' }),
  fila({ material_id: 'm2', material: 'Cal', unidad: 'bolsa', cantidad: 7 }),
  fila({ ubicacion_id: 'obra-a', cantidad: 12 }),
]

test('desgloseDeLugar parte un material del Taller en libre y acopios, y no mezcla otros lugares', () => {
  const d = desgloseDeLugar(existencias, 'taller')
  assert.equal(d.length, 2)
  const hierro = d.find((x) => x.material_id === 'm1')!
  assert.equal(hierro.total, 17)
  assert.equal(hierro.libre, 4)
  assert.deepEqual(hierro.acopios.map((a) => [a.obra_id, a.cantidad, a.desde]), [['ob-a', 10, '2026-09-28'], ['ob-b', 3, '2026-09-29']])
  assert.equal(d.find((x) => x.material_id === 'm2')!.libre, 7)
})

test('un acopio en cero no aparece', () => {
  assert.equal(desgloseDeLugar([fila({ cantidad: 0, destino_obra_id: 'ob-a' })], 'taller').length, 0)
})

test('acopiadoParaObra devuelve sólo lo de esa obra, con su fecha', () => {
  const r = acopiadoParaObra(existencias, 'ob-a')
  assert.deepEqual(r.map((x) => [x.material, x.cantidad, x.desde]), [['Hierro 8', 10, '2026-09-28']])
  assert.deepEqual(acopiadoParaObra(existencias, 'ob-zzz'), [])
})

test('repartoAutomatico consume primero el acopio de la obra destino y después lo libre', () => {
  const h = desgloseDeLugar(existencias, 'taller').find((x) => x.material_id === 'm1')!
  assert.deepEqual(repartoAutomatico(h, 'ob-a', 12), { deAcopio: 10, deLibre: 2, falta: 0 })
  assert.deepEqual(repartoAutomatico(h, 'ob-a', 4), { deAcopio: 4, deLibre: 0, falta: 0 })
  // Hacia otra obra o al Taller sólo sale lo libre: el acopio de A no se consume por accidente.
  assert.deepEqual(repartoAutomatico(h, 'ob-zzz', 6), { deAcopio: 0, deLibre: 4, falta: 2 })
  assert.deepEqual(repartoAutomatico(h, null, 3), { deAcopio: 0, deLibre: 3, falta: 0 })
})

test('disponibleAutomatico = libre + acopio de la obra destino', () => {
  const h = desgloseDeLugar(existencias, 'taller').find((x) => x.material_id === 'm1')!
  assert.equal(disponibleAutomatico(h, 'ob-a'), 14)
  assert.equal(disponibleAutomatico(h, null), 4)
})

test('obraDeDestino / esTaller / obrasAcopiables leen el tipo del destino, no el rótulo', () => {
  const destinos = [
    { valor: 'u-taller', rotulo: 'Taller', tipo: 'taller' as const, obra_id: null },
    { valor: 'u-a', rotulo: 'OB-0001 · A', tipo: 'obra' as const, obra_id: 'ob-a' },
    { valor: 'obra:ob-c', rotulo: 'OB-0003 · C', tipo: 'obra' as const, obra_id: 'ob-c' },
  ]
  assert.equal(esTaller(destinos, 'u-taller'), true)
  assert.equal(esTaller(destinos, 'u-a'), false)
  assert.equal(esTaller(destinos, ''), false)
  assert.equal(obraDeDestino(destinos, 'obra:ob-c'), 'ob-c')
  assert.equal(obraDeDestino(destinos, 'u-taller'), null)
  assert.deepEqual(obrasAcopiables(destinos).map((o) => o.id), ['ob-a', 'ob-c'])
})

test('fechaCorta usa el día de San Juan y tolera vacíos', () => {
  assert.equal(fechaCorta('2026-09-29T01:30:00Z'), '28/09')
  assert.equal(fechaCorta(null), '')
  assert.equal(fechaCorta('basura'), '')
})

test('renglonesDeMover: automático + un renglón por acopio de OTRA obra; el acopio de la obra destino no tiene renglón propio', () => {
  const d = desgloseDeLugar(existencias, 'taller').filter((x) => x.material_id === 'm1')
  const r = renglonesDeMover(d, 'ob-a')
  assert.deepEqual(r.map((x) => [x.acopio, x.maximo, x.deAcopioDestino]), [[null, 14, 10], ['ob-b', 3, 0]])
  // Sin destino elegido todavía, todo acopio es «ajeno» y lo automático es sólo lo libre.
  assert.deepEqual(renglonesDeMover(d, null).map((x) => [x.acopio, x.maximo]), [[null, 4], ['ob-a', 10], ['ob-b', 3]])
})

test('armarItemsMover: vacío no se manda, pasarse del máximo rechaza y el acopio ajeno viaja con reasignar', () => {
  const d = desgloseDeLugar(existencias, 'taller').filter((x) => x.material_id === 'm1')
  const r = renglonesDeMover(d, 'ob-a')
  assert.equal(armarItemsMover(r, {}, leerCantidad).error, 'Poné la cantidad de al menos un material')
  assert.match(armarItemsMover(r, { m1: '15' }, leerCantidad).error ?? '', /sólo hay 14/)
  const ok = armarItemsMover(r, { m1: '12', 'm1|ob-b': '2' }, leerCantidad)
  assert.equal(ok.error, null)
  assert.equal(ok.reasigna, true)
  assert.deepEqual(ok.items, [{ material: 'm1', cantidad: 12 }, { material: 'm1', cantidad: 2, acopio: 'ob-b', reasignar: true }])
  assert.equal(armarItemsMover(r, { m1: '12' }, leerCantidad).reasigna, false)
})

test('claveRenglon distingue el automático del acopio explícito', () => {
  assert.notEqual(claveRenglon('m1', null), claveRenglon('m1', 'ob-a'))
})
