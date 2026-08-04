// EL DUPLICADO SE BUSCA EN EL DESTINO, NO EN EL REGISTRO PROPIO.
//
// Las filas de acá son las 802 y 803 reales de "Compras": dos facturas de Corralón Progreso del
// mismo día. Una es la que el bot se ofreció a cargar de nuevo; la otra existe para probar lo
// contrario — que dos compras distintas del mismo proveedor el mismo día NO se marquen duplicadas.

import test from 'node:test'
import assert from 'node:assert/strict'
import { indexarCompras, buscarEnCompras, importeDeCompras, tipoDeCompras, detallesPorObra, historiaDeCompras, HALLAZGO } from './compras-vivas.mjs'
import { normalizarLectura } from './lectura.mjs'

const fila = (fecha, prov, tipo, numero, obra, detalle, total, categoria = '') =>
  [categoria, fecha, '', prov, '', tipo, numero, '', obra, detalle, 'concepto', '', '', total]

/** Las filas 802 y 803 de Compras, en el rango B4:O (la primera con datos es la 802). */
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

// CAMBIO DE CONTRATO (03/08). Antes esto devolvía `null` — "el mismo número con otro importe no es
// el mismo comprobante"—. Es falso: un proveedor NO emite dos comprobantes con el mismo punto de
// venta y número. Si el número y el proveedor coinciden y el importe no, o es éste con un importe
// mal leído, o la fila de Compras está mal cargada. Las dos salidas son caras: se pregunta.
test('el mismo número del MISMO proveedor con otro importe se PREGUNTA, no se ignora', () => {
  const r = buscarEnCompras(leido({ total: '80.000,00' }), INDICE)
  assert.equal(r.que, HALLAZGO.PROBABLE)
  assert.equal(r.fila, 802)
})

test('sin poder leer Compras no se afirma que algo esté cargado', () => {
  assert.equal(buscarEnCompras(leido(), { porNumero: new Map(), porFechaTotal: new Map() }), null)
})

// ── EL TIQUE DE COMBUSTIBLE (03/08) — la búsqueda no puede depender del tipo ni de ARCA ──────
//
// Compras fila 800: Combustibles Barcelo · F A · 00113-00014219 · $64.006,07. El dueño mandó la foto
// de ese mismo tique. El bot dijo "no figura en ARCA" y se ofreció a cargarlo.

const BARCELO = [
  ...Array.from({ length: 796 }, () => []),
  fila('31/7/2026', 'Combustibles Barcelo', 'F A', '00113-00014219', 'MESSINA', 'Camion - BSA', '$ 64.006,07'),
]
const I_BARCELO = { ok: true, ...indexarCompras(BARCELO) }

const tique = (over = {}) => normalizarLectura({
  emisor: 'Combustibles Barcelo', letra: '', numero: '00113-00014219', fecha: '31/07/2026',
  total: '64.006,07', iva_21: '9.558,36', ...over,
}).comprobante

test('un TIQUE sin tipo legible se encuentra igual: la clave (proveedor, número) no necesita la letra', () => {
  const c = tique()
  assert.equal(c.tipo, null, 'de un tique la visión no siempre saca la letra — así llegó el caso real')
  const r = buscarEnCompras(c, I_BARCELO)
  assert.equal(r.que, HALLAZGO.CARGADO)
  assert.equal(r.fila, 800)
  assert.equal(r.via, 'proveedor+numero')
})

test('sin proveedor legible alcanza (número, total): el número y el total no mienten juntos', () => {
  const r = buscarEnCompras(tique({ emisor: '' }), I_BARCELO)
  assert.equal(r.que, HALLAZGO.CARGADO)
  assert.equal(r.via, 'numero+total')
})

test('con el número ilegible queda (proveedor, fecha, total): se pregunta', () => {
  const r = buscarEnCompras(tique({ numero: '' }), I_BARCELO)
  assert.equal(r.que, HALLAZGO.PROBABLE)
  assert.equal(r.fila, 800)
  assert.equal(r.via, 'proveedor+fecha+importe')
})

test('el mismo número de OTRO proveedor no es un duplicado: cada uno numera su talonario', () => {
  assert.equal(buscarEnCompras(tique({ emisor: 'Ferreteria El Tornillo SRL', total: '1.000,00', iva_21: '0' }), I_BARCELO), null)
})

test('el CUIT manda sobre el nombre cuando alguien puede aportarlo', () => {
  // Compras no tiene columna de CUIT: se lo aporta quien lo sepa, y ahí la identidad deja de
  // depender de cómo esté escrito el nombre en el desplegable.
  const conCuit = { ok: true, ...indexarCompras(BARCELO, { cuitPorProveedor: { 'combustibles barcelo': '30-70912345-3' } }) }
  const r = buscarEnCompras(tique({ emisor: 'ESTACION DE SERVICIO SA', cuit: '30709123453' }), conCuit)
  assert.equal(r.que, HALLAZGO.CARGADO)
  assert.equal(r.via, 'cuit+numero')
})

// ── La historia con la que aprende la imputación ─────────────────────────────

test('la MISMA lectura entrega la historia de imputación, con el detalle de la columna K separado', () => {
  const h = historiaDeCompras(BARCELO)
  assert.deepEqual(h[0], {
    proveedor: 'Combustibles Barcelo',
    unidad_negocio: null,
    obra_texto: 'MESSINA',
    detalle: 'Camion - BSA',
    concepto: 'concepto',
    categoria: null,
  })
})

// ── El vocabulario de la columna K ───────────────────────────────────────────

test('la columna K no tiene desplegable: su lista es lo que el dueño ya usó en esa obra', () => {
  const v = detallesPorObra(FILAS)
  assert.deepEqual(v.MESSINA, ['Planta de BSA'])
  assert.deepEqual(v['LA ESTRELLA'].sort(), ['NC Devolucion', 'Sanitarios'])
})
