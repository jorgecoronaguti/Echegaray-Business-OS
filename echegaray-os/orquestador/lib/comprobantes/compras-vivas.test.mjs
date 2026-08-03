// EL DUPLICADO SE BUSCA EN EL DESTINO, NO EN EL REGISTRO PROPIO.
//
// Las filas de acá son las 802 y 803 reales de "Compras": dos facturas de Corralón Progreso del
// mismo día. Una es la que el bot se ofreció a cargar de nuevo; la otra existe para probar lo
// contrario — que dos compras distintas del mismo proveedor el mismo día NO se marquen duplicadas.

import test from 'node:test'
import assert from 'node:assert/strict'
import { indexarCompras, buscarEnCompras, importeDeCompras, tipoDeCompras, detallesPorObra, HALLAZGO } from './compras-vivas.mjs'
import { normalizarLectura } from './lectura.mjs'

const fila = (fecha, prov, tipo, numero, obra, detalle, total) =>
  [fecha, '', prov, '', tipo, numero, '', obra, detalle, 'concepto', '', '', total]

/** Las filas 802 y 803 de Compras, en el rango C4:O (la primera con datos es la 802). */
const FILAS = [
  ...Array.from({ length: 798 }, () => []),
  fila('30/7/2026', 'Corralon Progreso', 'F A', '0004-00003642', 'MESSINA', 'Planta de BSA', '$ 62.000,00'),
  fila('30/7/2026', 'Corralon Progreso', 'F A', '0006-00003366', 'LA ESTRELLA', 'Sanitarios', '$ 31.533,90'),
  fila('10/7/2026', 'Corralon Progreso', 'N C', '0004-00000093', 'LA ESTRELLA', 'NC Devolucion', '($ 149.756,00)'),
]

const INDICE = { ok: true, ...indexarCompras(FILAS) }

const leido = (over = {}) => normalizarLectura({
  emisor: 'Corralon Progreso', letra: 'A', numero: '0004-00003642', fecha: '30/07/2026',
  total: '62.000,00', iva_21: '10.760,33', ...over,
}).comprobante

// ── Lo que hace que la fila se ubique bien o no se ubique nunca ──────────────

test('la fila del Sheet sale del índice del rango: la primera con datos es la 802', () => {
  const r = buscarEnCompras(leido(), INDICE)
  assert.equal(r.fila, 802)
})

test('un negativo del Sheet viene ENTRE PARÉNTESIS y sigue siendo negativo', () => {
  assert.equal(importeDeCompras('($ 149.756,00)'), -149756)
  assert.equal(importeDeCompras('$ 62.000,00'), 62000)
  assert.equal(importeDeCompras(''), null)
})

test('el tipo de la columna G ("F A", "N C") se traduce al de la lectura', () => {
  assert.equal(tipoDeCompras('F A'), 'A')
  assert.equal(tipoDeCompras('N C'), 'NC')
  assert.equal(tipoDeCompras(''), null)
})

// ── El caso real ─────────────────────────────────────────────────────────────

test('el comprobante que YA estaba cargado se encuentra, aunque no lo haya cargado el chat', () => {
  const r = buscarEnCompras(leido(), INDICE)
  assert.equal(r.que, HALLAZGO.CARGADO)
  assert.equal(r.obra, 'MESSINA')
  assert.equal(r.detalle, 'Planta de BSA')
})

test('mismo proveedor, mismo día e importe con OTRO número: PROBABLE, no certeza', () => {
  const r = buscarEnCompras(leido({ numero: '0004-00099999' }), INDICE)
  assert.equal(r.que, HALLAZGO.PROBABLE)
  assert.equal(r.fila, 802)
})

// ── La contención: el negativo, que es el que evita las alarmas falsas ───────

test('otra compra del MISMO proveedor el MISMO día NO se marca duplicada', () => {
  // La 803 existe de verdad: $31.533,90 el 30/07. Cargarla no puede disparar ninguna alarma.
  const otra = leido({ numero: '0006-00003366', total: '31.533,90', iva_21: '5.355,02' })
  const r = buscarEnCompras(otra, INDICE)
  assert.equal(r.que, HALLAZGO.CARGADO, 'ésa sí está: es ella misma, no un duplicado de la otra')
  // Y una tercera, distinta de las dos, no aparece por ningún lado.
  const nueva = leido({ numero: '0004-00003700', total: '9.900,00', iva_21: '1.717,36' })
  assert.equal(buscarEnCompras(nueva, INDICE), null)
})

test('el mismo número con OTRO importe no es el mismo comprobante', () => {
  assert.equal(buscarEnCompras(leido({ total: '80.000,00' }), INDICE), null)
})

test('sin poder leer Compras no se afirma que algo esté cargado', () => {
  assert.equal(buscarEnCompras(leido(), { porNumero: new Map(), porImporte: new Map() }), null)
})

// ── El vocabulario de la columna K ───────────────────────────────────────────

test('la columna K no tiene desplegable: su lista es lo que el dueño ya usó en esa obra', () => {
  const v = detallesPorObra(FILAS)
  assert.deepEqual(v.MESSINA, ['Planta de BSA'])
  assert.deepEqual(v['LA ESTRELLA'].sort(), ['NC Devolucion', 'Sanitarios'])
})
