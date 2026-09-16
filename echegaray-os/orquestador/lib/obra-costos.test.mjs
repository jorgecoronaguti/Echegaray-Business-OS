#!/usr/bin/env node
// Test de la agregación del costo por obra. Hermético: filas inyectadas, 0 DB.
//
// ═══ EL DEFECTO QUE ATRAPA (15/09/2026) ═══
//
// La agregación resolvía `obra_texto` contra `obra_alias`. Ese texto es la columna J del Sheet, que
// dice el CLIENTE: las compras de las cinco obras de La Estrella caían todas en la obra madre, que
// mostraba $156 M mientras sus sub-obras mostraban $0. El fixture reproduce exactamente eso: cuatro
// filas que dicen «LA ESTRELLA» y van a CUATRO obras distintas. Si alguien vuelve a agrupar por
// texto, las cuatro caen en una sola y estos tests se ponen rojos.
import test from 'node:test'
import assert from 'node:assert/strict'
import { agregarCostosPorObra } from './obra-costos.mjs'

// Cuatro filas con el MISMO obra_texto y obras distintas, más lo que no llega a ninguna obra.
const FILAS = [
  { obra_id: 'le-comedor', destino: 'obra', obra_texto: 'LA ESTRELLA', categoria: 'Materiales', proveedor: 'Hormiserv', total: 100 },
  { obra_id: 'le-comedor', destino: 'obra', obra_texto: 'La Estrella', categoria: 'Materiales', proveedor: 'Hormiserv', total: 50 },
  { obra_id: 'le-comedor', destino: 'obra', obra_texto: 'ESTRELLA', categoria: 'Mano de obra', proveedor: 'Subcontrato X', total: 30 },
  { obra_id: 'le-galpon-9', destino: 'obra', obra_texto: 'LA ESTRELLA', categoria: 'Materiales', proveedor: 'Acme', total: 200 },
  { obra_id: 'arcor', destino: 'obra', obra_texto: 'ARCOR', categoria: 'Servicio', proveedor: 'Y', total: 40 },
  // Sin obra elegida: estructura por un lado, plata del cliente sin sub-obra por el otro.
  { obra_id: null, destino: 'estructura_admin', obra_texto: 'Administracion', categoria: 'Sueldos', proveedor: null, total: 999 },
  { obra_id: null, destino: 'estructura_taller', obra_texto: 'Taller', categoria: 'x', proveedor: null, total: 111 },
  { obra_id: null, destino: 'obra', obra_texto: 'LA ESTRELLA', categoria: 'x', proveedor: null, total: 777 },
  { obra_id: null, destino: null, obra_texto: 'Obra Nueva', categoria: 'x', proveedor: null, total: 5 },
]

test('cada fila va a la obra que dice su obra_id, aunque cuatro digan el mismo cliente', () => {
  const { porObra } = agregarCostosPorObra(FILAS)
  assert.equal(porObra.get('le-comedor').total, 180, 'las tres filas de la sub-obra dejaron de sumar en ella')
  assert.equal(porObra.get('le-comedor').n, 3)
  assert.equal(porObra.get('le-galpon-9').total, 200, 'la fila de Galpón 9 se fue a otra obra: se está imputando por el texto del cliente')
  assert.equal(porObra.get('arcor').total, 40)
  // Y NINGUNA obra madre aparece por el texto: «LA ESTRELLA» no es una obra de este fixture.
  assert.equal(porObra.has('la-estrella'), false, 'apareció la obra madre: la imputación volvió al texto de la columna J')
})

test('el desglose por categoría y proveedor es el de la obra, no el del cliente', () => {
  const { porObra } = agregarCostosPorObra(FILAS)
  assert.equal(porObra.get('le-comedor').categorias.get('Materiales'), 150)
  assert.equal(porObra.get('le-comedor').proveedores.get('Hormiserv'), 150)
  assert.equal(porObra.get('le-galpon-9').proveedores.get('Acme'), 200)
})

test('lo que no tiene obra elegida NO se le cuelga a ninguna obra', () => {
  // ═══ POR QUÉ ESTE ES EL TEST QUE IMPORTA ═══
  //
  // Repartir o colgar de la obra madre lo que nadie imputó es inventar un costo. La plata sin obra
  // se informa aparte para que se vea que falta imputarla, que es trabajo pendiente y no un dato.
  const { porObra, buckets } = agregarCostosPorObra(FILAS)
  assert.equal(porObra.size, 3, 'entró una obra de más: algo sin obra_id terminó atribuido')
  assert.equal(porObra.has(null), false)
  assert.equal(buckets.estructura, 1110, 'administración y taller dejaron de ser estructura')
  assert.equal(buckets.sin_obra, 782, 'la plata del cliente sin sub-obra dejó de contarse aparte')
  // Y la suma sigue cerrando: nada se perdió por el camino.
  const enObras = [...porObra.values()].reduce((s, o) => s + o.total, 0)
  assert.equal(enObras + buckets.estructura + buckets.sin_obra, FILAS.reduce((s, f) => s + f.total, 0))
})

test('un total que no es número no envenena la suma', () => {
  const { porObra } = agregarCostosPorObra([
    { obra_id: 'x', destino: 'obra', total: null }, { obra_id: 'x', destino: 'obra', total: '10' },
  ])
  assert.equal(porObra.get('x').total, 10)
  assert.equal(porObra.get('x').n, 2, 'la fila sin importe dejó de contarse como comprobante')
})
