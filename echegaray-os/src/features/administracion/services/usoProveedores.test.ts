// Los chips y el orden de la cartera de proveedores, sobre datos sintéticos (no toca base).
//
// HOY = 2026-09-30. Ventanas: 12 m desde 2025-09-30 · 90 d desde 2026-07-02 · mes desde 2026-09-01 ·
// «sin movimiento» = última compra anterior a 2026-03-30.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  agruparUso, aplicarChipsUso, contarChipUso, idsMasUsados, leerChips, leerColumna, leerPagina,
  leerSentido, nombreAProveedor, ordenarProveedores, paginar, restarMeses, TOP_USADOS,
  type CompraLeve, type DatosUso,
} from './usoProveedores.ts'
import { coincideProveedor, type CompradoProveedor } from './proveedoresService.ts'
import type { NombreResuelto, Proveedor } from '../types/index.ts'

const HOY = '2026-09-30'
const prov = (id: string, nombre: string, extra: Partial<Proveedor> = {}): Proveedor => ({
  id, nombre, razon_social: null, cuit: '30-1-1', notas: null, activo: true,
  rubro: null, rubro_deducido: null, rubro_deducido_evidencia: null, ...extra,
})
const P = [prov('a', 'Alfa'), prov('b', 'Beta'), prov('c', 'Corralón Centro'), prov('d', 'Delta'), prov('e', 'Eco')]

const vinculo = (nombre_norm: string, proveedor_id: string, estado: NombreResuelto['estado'] = 'vinculado'): NombreResuelto => ({
  nombre_norm, proveedor_id, estado, comprobantes: 0, total: 0, proveedor_nombre: null,
  via: 'exacto', alias_id: null, ultima_compra: null,
})
const nombres = nombreAProveedor([
  // El normalizador NO saca acentos (ver proveedor-identidad.mjs): cada grafía es un nombre_norm
  // propio, vinculado por una persona al mismo proveedor. Por eso acá hay dos filas para «c».
  vinculo('ALFA', 'a'), vinculo('BETA', 'b'), vinculo('CORRALON CENTRO', 'c'),
  vinculo('CORRALÓN CENTRO', 'c'), vinculo('DELTA', 'd'),
  vinculo('BASURA', 'e', 'no_es_proveedor'),
])
const compra = (proveedor: string, fecha: string | null, total = 100): CompraLeve => ({ proveedor, fecha, total })

const compras: CompraLeve[] = [
  // Alfa: 3 en 12 m, una en el mes, dos en 90 d
  compra('Alfa', '2026-09-10'), compra('ALFA', '2026-08-01'), compra('alfa', '2025-12-01', 50),
  // Beta: 1 en 12 m, sólo hace 11 meses
  compra('Beta', '2025-11-05', 1000),
  // Corralón (con tilde y distinta grafía): 2 hace ~4 meses
  compra('CORRALÓN CENTRO', '2026-05-20'), compra('Corralon Centro', '2026-06-01'),
  // fuera de ventana, sin fecha, y un texto descartado
  compra('Delta', '2025-09-29'), compra('Delta', null), compra('Basura', '2026-09-20'),
]
const uso = agruparUso(compras, nombres, HOY)
const comprado = new Map<string, CompradoProveedor>([
  ['a', { comprobantes: 9, total: 900, ultima: '2026-09-10' }],
  ['b', { comprobantes: 4, total: 4000, ultima: '2025-11-05' }],
  ['c', { comprobantes: 2, total: 200, ultima: '2026-06-01' }],
  ['d', { comprobantes: 2, total: 200, ultima: '2025-09-29' }],
])
const deudas = new Map([['b', { deuda: 500, comprobantes_impagos: 1, impaga_mas_vieja: null }],
  ['c', { deuda: -30, comprobantes_impagos: 0, impaga_mas_vieja: null }]])
const D: DatosUso = { uso, comprado, deudas, hoy: HOY }
const ids = (l: Proveedor[]) => l.map((p) => p.id)

test('las ventanas se agrupan por proveedor, con grafías distintas y sin inventar fechas', () => {
  assert.deepEqual(uso.get('a'), { comprobantes12: 3, total12: 250, comprobantes90: 2, comprobantesMes: 1 })
  assert.equal(uso.get('b')?.comprobantes12, 1)
  assert.equal(uso.get('b')?.comprobantes90, 0)
  // «Corralón» con tilde y «Corralon» sin ella, vinculadas al mismo proveedor, suman juntas.
  assert.equal(uso.get('c')?.comprobantes12, 2)
  // Delta: una compra justo fuera de los 12 m y otra SIN FECHA → ninguna entra.
  assert.equal(uso.has('d'), false)
  // Un texto resuelto como «no es proveedor» no le suma compras a nadie.
  assert.equal(uso.has('e'), false)
})

test('restarMeses no se pasa de mes: 31/03 − 1 mes = 28/02', () => {
  assert.equal(restarMeses('2026-03-31', 1), '2026-02-28')
  assert.equal(restarMeses('2026-09-30', 6), '2026-03-30')
})

test('Más usados: los de más comprobantes en 12 m, tope TOP_USADOS, y sólo quien tuvo alguno', () => {
  assert.deepEqual(ids(aplicarChipsUso(P, ['usados'], D)).sort(), ['a', 'b', 'c'])
  assert.deepEqual([...idsMasUsados(P, uso, 1)], ['a'])
  const muchos = Array.from({ length: 40 }, (_, i) => prov(`x${i}`, `X${i}`))
  const usoMuchos = new Map(muchos.map((p, i) => [p.id, { comprobantes12: i + 1, total12: 1, comprobantes90: 0, comprobantesMes: 0 }]))
  assert.equal(idsMasUsados(muchos, usoMuchos).size, TOP_USADOS)
  assert.equal(idsMasUsados(muchos, usoMuchos).has('x39'), true)
  assert.equal(idsMasUsados(muchos, usoMuchos).has('x0'), false)
})

test('Compré este mes y Últimos 90 días devuelven lo que dicen', () => {
  assert.deepEqual(ids(aplicarChipsUso(P, ['mes'], D)), ['a'])
  assert.deepEqual(ids(aplicarChipsUso(P, ['90d'], D)), ['a'])
  // El día de corte entra: 2026-07-02 es exactamente hoy − 90.
  const borde = agruparUso([compra('Beta', '2026-07-02'), compra('Delta', '2026-07-01')], nombres, HOY)
  assert.deepEqual(ids(aplicarChipsUso(P, ['90d'], { ...D, uso: borde })), ['b'])
})

test('Sin movimiento > 6 meses: incluye al que nunca compró y deja afuera al reciente', () => {
  // a (sept-26) y c (jun-26) son recientes; b (nov-25) y d (sep-25) no; e no tiene ninguna.
  assert.deepEqual(ids(aplicarChipsUso(P, ['inactivo'], D)).sort(), ['b', 'd', 'e'])
})

test('un dato que no se pudo leer NO recorta: el chip no afirma lo que no vio', () => {
  assert.equal(aplicarChipsUso(P, ['usados'], { ...D, uso: null }).length, P.length)
  assert.equal(aplicarChipsUso(P, ['inactivo'], { ...D, comprado: null }).length, P.length)
})

test('el número de cada chip es lo que aparece al activarlo', () => {
  for (const c of ['usados', 'mes', '90d', 'inactivo'] as const) {
    assert.equal(contarChipUso(P, c, D), aplicarChipsUso(P, [c], D).length)
  }
  assert.equal(contarChipUso(P, 'usados', D), 3)
})

test('chips entre sí: intersección (usados ∩ sin movimiento = los usados hace > 6 meses)', () => {
  assert.deepEqual(ids(aplicarChipsUso(P, ['usados', 'inactivo'], D)), ['b'])
})

test('chip + texto es INTERSECCIÓN, y el texto corta sobre el total, no sobre la página', () => {
  const porChip = aplicarChipsUso(P, ['usados'], D)
  const conTexto = porChip.filter((p) => coincideProveedor(p, 'corralon'))
  assert.deepEqual(ids(conTexto), ['c'])
  // «Delta» existe pero no es de los más usados: el texto no lo cuela.
  assert.deepEqual(porChip.filter((p) => coincideProveedor(p, 'delta')), [])
  // Una página de 2 filas no impide encontrar al proveedor 40 de la lista.
  const muchos = Array.from({ length: 120 }, (_, i) => prov(`x${i}`, `Prov ${i}`))
  const hallado = muchos.filter((p) => coincideProveedor(p, 'Prov 119'))
  assert.equal(hallado.length, 1)
})

test('orden por defecto = más usados (comprobantes 12 m desc), no alfabético', () => {
  const col = leerColumna(undefined)
  assert.equal(col, 'comprobantes')
  const o = ordenarProveedores(P, col, leerSentido(col, undefined), D)
  assert.deepEqual(ids(o), ['a', 'c', 'b', 'd', 'e'])
  // Alfabético sería a,b,c,d,e: si alguien vuelve a ordenar por nombre, éste se pone rojo.
  assert.notDeepEqual(ids(o), ['a', 'b', 'c', 'd', 'e'])
})

test('orden por cada columna, en los dos sentidos', () => {
  assert.deepEqual(ids(ordenarProveedores(P, 'nombre', 'desc', D)), ['e', 'd', 'c', 'b', 'a'])
  assert.deepEqual(ids(ordenarProveedores(P, 'total', 'desc', D)).slice(0, 2), ['b', 'a'])
  assert.equal(ordenarProveedores(P, 'saldo', 'desc', D)[0].id, 'b')
  assert.equal(ordenarProveedores(P, 'saldo', 'asc', D)[0].id, 'c', 'la nota de crédito (saldo negativo) va primero en ascendente')
})

test('la última compra ordena por fecha y las filas SIN fecha van al final en ambos sentidos', () => {
  assert.deepEqual(ids(ordenarProveedores(P, 'ultima', 'desc', D)), ['a', 'c', 'b', 'd', 'e'])
  assert.deepEqual(ids(ordenarProveedores(P, 'ultima', 'asc', D)), ['d', 'b', 'c', 'a', 'e'])
})

test('no muta la lista de entrada', () => {
  const copia = ids(P)
  ordenarProveedores(P, 'nombre', 'desc', D)
  assert.deepEqual(ids(P), copia)
})

test('parámetros inválidos de la URL caen al valor por defecto', () => {
  assert.equal(leerColumna('drop table'), 'comprobantes')
  assert.equal(leerSentido('nombre', 'raro'), 'asc')
  assert.equal(leerSentido('total', undefined), 'desc')
  assert.deepEqual(leerChips('usados,basura,90d'), ['usados', '90d'])
  assert.equal(leerPagina('-3'), 1)
  assert.equal(leerPagina('abc'), 1)
  assert.equal(leerPagina('3'), 3)
})

test('«mostrar más» de 50 en 50 y dice cuántos quedan', () => {
  const lista = Array.from({ length: 120 }, (_, i) => i)
  assert.equal(paginar(lista, 1).visibles.length, 50)
  assert.equal(paginar(lista, 1).restan, 70)
  assert.equal(paginar(lista, 3).visibles.length, 120)
  assert.equal(paginar(lista, 3).restan, 0)
})
