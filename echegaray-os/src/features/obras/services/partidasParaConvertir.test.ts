import test from 'node:test'
import assert from 'node:assert/strict'
import {
  agruparPartidas, avisoSinAnalisis, coefDe, costoMODeLaPartida, elegibles, partidasParaConvertir, resumenDeConversion, rotuloConvertir,
  type FilaCruda,
} from './partidasParaConvertir.ts'

const CRUDAS: FilaCruda[] = [
  { id: 'a', rubro: 'Obra gruesa', codigo: '01.01', descripcion: 'Demolición de construcción existente', unidad: 'un', cantidad: 4, hs_unitarias: 24, costo_unitario: 215000, orden: 1 },
  { id: 'b', rubro: 'Obra gruesa', codigo: '01.02', descripcion: 'Retiro de escombros', unidad: 'un', cantidad: 14, hs_unitarias: 3, costo_unitario: null, orden: 2 },
  { id: 'c', rubro: 'Estructura metálica', codigo: '02.03', descripcion: 'Correas de techo y muro', unidad: 'ml', cantidad: 420, hs_unitarias: null, costo_unitario: 4428, orden: 4 },
  { id: 'd', rubro: 'Estructura metálica', codigo: '02.01', descripcion: 'Columnas metálicas', unidad: 'un', cantidad: 12, hs_unitarias: 12, costo_unitario: 283000, orden: 3 },
  { id: 'e', rubro: null, codigo: null, descripcion: 'Sin cómputo', unidad: null, cantidad: null, hs_unitarias: null, costo_unitario: null, orden: 5 },
]

test('las partidas traen HH del análisis, costo y lo que no se puede convertir', () => {
  const p = partidasParaConvertir(CRUDAS, new Set(['b']))
  assert.deepEqual(p.map((x) => x.id), ['a', 'b', 'd', 'c', 'e'])
  assert.equal(p[0].hh, 96)
  assert.equal(p[0].costo, 860000)
  assert.equal(p[1].costo, null)
  assert.equal(p[1].convertida, true)
  assert.equal(p[3].sinAnalisis, true)
  assert.equal(p[3].hh, null)
  assert.equal(p[4].rubro, 'Sin rubro')
  assert.equal(p[4].sinCantidad, true)
  assert.deepEqual(elegibles(p), ['a', 'd', 'c'])
})

test('agrupar por rubro conserva el orden y cuenta sin filtrar', () => {
  const p = partidasParaConvertir(CRUDAS, new Set())
  const g = agruparPartidas(p, new Set(['a', 'd']), 'todas', '')
  assert.deepEqual(g.map((x) => [x.rotulo, x.n, x.elegidas]), [['01 · Obra gruesa', 2, 1], ['02 · Estructura metálica', 2, 1], ['03 · Sin rubro', 1, 0]])
  const sinElegir = agruparPartidas(p, new Set(['a', 'd']), 'sin_elegir', '')
  assert.deepEqual(sinElegir[0].partidas.map((x) => x.id), ['b'])
  assert.equal(sinElegir[0].n, 2)
  const sinAnalisis = agruparPartidas(p, new Set(), 'sin_analisis', '')
  assert.deepEqual(sinAnalisis.flatMap((x) => x.partidas.map((y) => y.id)), ['c', 'e'])
  const buscado = agruparPartidas(p, new Set(), 'todas', 'correas')
  assert.deepEqual(buscado.flatMap((x) => x.partidas.map((y) => y.id)), ['c'])
})

test('el resumen y los rótulos de la primaria', () => {
  const p = partidasParaConvertir(CRUDAS, new Set())
  const r = resumenDeConversion(p, new Set(['a', 'c']))
  assert.deepEqual(r, { partidas: 5, elegidas: 2, hh: 96, sinAnalisis: 1 })
  assert.equal(avisoSinAnalisis(r), '1 partida sin análisis entra sin HH plan')
  assert.equal(avisoSinAnalisis({ ...r, sinAnalisis: 0 }), null)
  assert.equal(resumenDeConversion(p, new Set(['c'])).hh, null)
  assert.equal(rotuloConvertir(14, true), 'Convertir 14 partidas en plan')
  assert.equal(rotuloConvertir(14, false), 'Convertir 14 partidas')
  assert.equal(rotuloConvertir(1, true), 'Convertir 1 partida en plan')
  assert.equal(rotuloConvertir(0, true), 'Elegí partidas')
})

// Quattropani, T1126.1 «ALQUILER BOBCAT con MARTILLO - HORA» (LISTADO DE TAREAS A EJECUTAR.xlsm, fila 36):
// composición MO 4,5 + CS 4 por hora, 32 h, COEF. AJUSTE 1450 → J 208.800 + L 185.600 = 394.400.
// Sin el coeficiente la conversión daba $ 272 (el bug del 25/09).
const BOBCAT = [
  { tipo: 'mano_obra', cantidad: 1, costo_unitario: 4.5, desperdicio: 0 },
  { tipo: 'carga_social', cantidad: 1, costo_unitario: 4, desperdicio: null },
  { tipo: 'material', cantidad: 1, costo_unitario: 29.77, desperdicio: 0 },
]

test('el costo de MO de la partida lleva el coeficiente de ajuste de la planilla', () => {
  assert.equal(costoMODeLaPartida(BOBCAT, 32, 1450), 394400)
  assert.equal(costoMODeLaPartida(BOBCAT, 32, null), 272, 'sin coeficiente cargado vale 1: lo existente no cambia')
  assert.equal(costoMODeLaPartida(BOBCAT, 32, 1), 272)
  assert.equal(costoMODeLaPartida(BOBCAT, null, 1450), null, 'sin cantidad no hay costo')
  assert.equal(costoMODeLaPartida([{ tipo: 'material', cantidad: 1, costo_unitario: 10, desperdicio: 0 }], 5, 3), null, 'sin MO en la composición es null, no 0')
  assert.equal(coefDe(0), 1)
  assert.equal(coefDe(-2), 1)
  assert.equal(coefDe(undefined), 1)
})

test('la vista previa de C02 multiplica costo y HH por el coeficiente', () => {
  const [p] = partidasParaConvertir([{ id: 's', rubro: 'Instalaciones', codigo: 'T1059', descripcion: 'Instalación sanitaria', unidad: 'un', cantidad: 1, hs_unitarias: 76.5, costo_unitario: 1030594.31, coef_ajuste: 3, orden: 1 }], new Set())
  assert.equal(p.hh, 230)
  assert.equal(Math.round(p.costo!), 3091783)
})
