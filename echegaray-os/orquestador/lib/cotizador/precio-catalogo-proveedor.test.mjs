// LO QUE SE COMPARA Y LO QUE NO — los dos falsos positivos que la primera corrida real dejó pasar.
//
// Los productos de estos tests son los que devolvió DE VERDAD el catálogo de Easy el 31/08/2026
// buscando «placa de yeso 12.5» y «cemento portland». No son ejemplos inventados: son los que
// engañaron al filtro la primera vez.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  comparabilidad, precioEnLaUnidadDelRecurso, observacionesDeCatalogo, normalizarProductoVtex,
  presentacionDelTitulo, numerosDe, urlDeBusquedaVtex, leerCatalogo, DESCARTE, PROVEEDORES,
} from './precio-catalogo-proveedor.mjs'
import { TIPO_FUENTE, IVA } from './precio-observacion.mjs'

const PLACA = { codigo: '154', nombre: 'PLACA DE YESO 12,5 X 2,4 X 1,2', unidad: 'un' }
const CEMENTO = { codigo: '6', nombre: 'CEMENTO PORTLAND LOMA NEGRA', unidad: 'kg' }
const EASY = PROVEEDORES[0]
const prod = (nombre, extra = {}) => ({ nombre, precio: 14900, moneda: 'ARS', unidad: 'un', multiplicador: 1, disponible: true, url: 'https://www.easy.com.ar/x/p', sku: 'S1', marca: null, validoHasta: null, ...extra })

test('el producto correcto pasa: todas las palabras y todas las medidas', () => {
  const c = comparabilidad({ recurso: PLACA, producto: prod('Placa Yeso 12.5 Mm X 1.20 X 2.40 Mts Maxhaus') })
  assert.equal(c.comparable, true, c.porQue)
})

test('FALSO POSITIVO 1 · el tornillo «3,5x41.2» entraba porque 41.2 CONTIENE 1.2', () => {
  const c = comparabilidad({ recurso: PLACA, producto: prod('Tornillo Autoperforante 3.5x41.2 Mm Yeso-Drywall') })
  assert.equal(c.comparable, false)
  assert.deepEqual(numerosDe('3.5x41.2 Mm'), [3.5, 41.2], 'las medidas se comparan como números, no como subcadenas')
})

test('FALSO POSITIVO 2 · la placa de 9,5 mm entraba porque coincidían el ancho y el largo', () => {
  const c = comparabilidad({ recurso: PLACA, producto: prod('Placa Yeso 9.5 Mm X 1.20 X 2.40 Mts Knauf') })
  assert.equal(c.comparable, false)
  assert.match(c.porQue, /no menciona 12\.5/)
})

test('FALSO POSITIVO 3 · «Cemento de Albañilería Loma Negra» no es cemento PORTLAND', () => {
  const c = comparabilidad({ recurso: CEMENTO, producto: prod('Cemento De Albañilería 25 Kg Loma Negra') })
  assert.equal(c.comparable, false, 'comparte cemento, loma y negra: le falta la única palabra que dice qué producto es')
  assert.equal(comparabilidad({ recurso: CEMENTO, producto: prod('Cemento Portland 25 Kg Loma Negra') }).comparable, true)
})

test('un SERVICIO que se vende junto al material no es el material', () => {
  const c = comparabilidad({ recurso: PLACA, producto: prod('Instalacion Placa de Yeso Medicion') })
  assert.equal(c.comparable, false)
  assert.match(c.porQue, /instalacion/)
})

test('la presentación del título convierte de unidad a kilo, y sólo si es UNA sola', () => {
  const uno = precioEnLaUnidadDelRecurso({ recurso: CEMENTO, producto: prod('Cemento Portland 25 Kg Loma Negra', { precio: 7899, unidad: 'un' }) })
  assert.equal(uno.sirve, true)
  assert.ok(Math.abs(uno.valor - 7899 / 25) < 1e-9)
  // Dos masas en el título: no dice cuánto trae, dice dos cosas.
  assert.equal(presentacionDelTitulo('Pack Cemento 25 Kg y Cal 10 Kg', 'MASA'), null)
})

test('LA REGLA: sin presentación declarada NO se divide a ojo', () => {
  const r = precioEnLaUnidadDelRecurso({ recurso: CEMENTO, producto: prod('Cemento Portland Loma Negra Bolsa', { unidad: 'un' }) })
  assert.equal(r.sirve, false)
  assert.equal(r.motivo, DESCARTE.UNIDAD_INCOMPATIBLE)
  assert.match(r.porQue, /no hay conversión defendible/)
})

test('una barra vendida por unidad no se convierte a kg: falta la densidad lineal', () => {
  const hierro = { codigo: '243', nombre: 'HIERRO LISO ø 16', unidad: 'kg' }
  const r = precioEnLaUnidadDelRecurso({ recurso: hierro, producto: prod('Hierro Liso 16 Mm X 12 Mts', { unidad: 'un' }) })
  assert.equal(r.sirve, false, 'el título declara metros, no kilos: convertir exigiría el peso por metro y nadie lo declaró')
})

test('las observaciones del catálogo son WEB, nunca experiencia de ECSAS, y con IVA no declarado', () => {
  const { observaciones } = observacionesDeCatalogo({
    recurso: PLACA, proveedor: EASY, hoy: new Date('2026-08-31T00:00:00Z'),
    productos: [prod('Placa Yeso 12.5 Mm X 1.20 X 2.40 Mts Maxhaus', { validoHasta: '2027-08-31' })],
  })
  assert.equal(observaciones.length, 1)
  const o = observaciones[0]
  assert.equal(o.tipoFuente, TIPO_FUENTE.WEB)
  assert.equal(o.esExperienciaEcsas, false)
  assert.equal(o.iva, IVA.NO_DECLARADO, 'el catálogo no dice cómo trata el IVA y suponerlo mueve 21%')
  assert.equal(o.validoHasta, '2027-08-31', 'PriceValidUntil lo declara el vendedor: ES un hecho de la fuente')
  assert.equal(o.url, 'https://www.easy.com.ar/x/p')
})

test('sin stock y sin precio se descartan con motivos DISTINTOS', () => {
  const { observaciones, descartes } = observacionesDeCatalogo({
    recurso: PLACA, proveedor: EASY,
    productos: [prod('Placa Yeso 12.5 Mm X 1.20 X 2.40 Mts A', { precio: null }), prod('Placa Yeso 12.5 Mm X 1.20 X 2.40 Mts B', { disponible: false })],
  })
  assert.equal(observaciones.length, 0)
  assert.deepEqual(descartes.map((d) => d.motivo), [DESCARTE.SIN_PRECIO, DESCARTE.SIN_STOCK])
})

test('un producto VTEX sin oferta no se convierte en un precio de cero', () => {
  assert.equal(normalizarProductoVtex({ productName: 'X', items: [{}] }, EASY), null)
  const sinPrecio = normalizarProductoVtex({ productName: 'X', items: [{ itemId: '1', sellers: [{ commertialOffer: { Price: 0, IsAvailable: false } }] }] }, EASY)
  assert.equal(sinPrecio.precio, null, 'Price 0 es «no hay precio», no «cuesta cero»')
})

test('un catálogo caído no rompe la corrida: se informa y se sigue', async () => {
  const fetchImpl = async () => { throw new Error('ECONNREFUSED') }
  const r = await leerCatalogo({ proveedor: EASY, termino: 'x', fetchImpl })
  assert.deepEqual(r.productos, [])
  assert.match(r.porQue, /no se pudo leer/)
})

test('la URL de consulta se puede pegar en un informe y repetir a mano', () => {
  assert.equal(urlDeBusquedaVtex(EASY, 'placa de yeso', 3),
    'https://www.easy.com.ar/api/catalog_system/pub/products/search?ft=placa%20de%20yeso&_from=0&_to=2')
})
