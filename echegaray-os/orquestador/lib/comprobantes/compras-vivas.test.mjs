// EL DUPLICADO SE BUSCA EN EL DESTINO, NO EN EL REGISTRO PROPIO.
//
// Las filas de acá son las 802 y 803 reales de "Compras": dos facturas de Corralón Progreso del
// mismo día. Una es la que el bot se ofreció a cargar de nuevo; la otra existe para probar lo
// contrario — que dos compras distintas del mismo proveedor el mismo día NO se marquen duplicadas.

import test from 'node:test'
import assert from 'node:assert/strict'
import { indexarCompras, buscarEnCompras, importeDeCompras, tipoDeCompras, detallesPorObra, HALLAZGO } from './compras-vivas.mjs'
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
  const conCuit = { ok: true, ...indexarCompras(BARCELO, { cuitPorProveedor: { 'combustibles barcelo': '30-70912345-5' } }) }
  const r = buscarEnCompras(tique({ emisor: 'ESTACION DE SERVICIO SA', cuit: '30709123455' }), conCuit)
  assert.equal(r.que, HALLAZGO.CARGADO)
  assert.equal(r.via, 'cuit+numero')
})

// ── La historia con la que aprende la imputación ─────────────────────────────

test('la MISMA lectura entrega la historia de imputación, con el detalle de la columna K separado', () => {
  const h = indexarCompras(BARCELO).historia
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

// ── EL PARSER NO PUEDE DEPENDER DEL RENDER QUE ELIGIÓ EL LLAMADOR (13/08) ────
//
// `Compras!B4:O` se lee FORMATEADO, pero nada impide que alguien lo lea con `UNFORMATTED_VALUE`: el
// auditor de lo ya cargado lo hizo y $6.693,39 salió como $6.693.389.999.999.999, porque el punto
// decimal del número crudo se leía como separador de miles. Cien veces más, en silencio.
test('un número crudo se respeta tal cual: el parser es-AR no lo multiplica por cien', () => {
  assert.equal(importeDeCompras(6000.02), 6000.02)
  assert.equal(importeDeCompras(-1234.5), -1234.5)
  assert.equal(importeDeCompras(0), 0)
  // Y lo formateado sigue igual, con el negativo entre paréntesis del dueño.
  assert.equal(importeDeCompras('6.000,02'), 6000.02)
  assert.equal(importeDeCompras('(1.234,50)'), -1234.5)
  assert.equal(importeDeCompras(''), null)
})

// ── EL PUNTO DE VENTA ES LA PARTE DEL NÚMERO QUE MÁS SE LEE MAL (13/08) ──────
//
// Medido contra el registro real del bot y la pestaña viva el 13/08, cuatro comprobantes que YA
// estaban en Compras tenían el punto de venta leído distinto: `0011-00014305` contra
// `00113-00014305`, `0001-00015177` contra `00015-00015177`, `0005-00000386` contra
// `00005-00000386`, `0036-00025942` contra `0038-00025942`. Los cuatro se encuentran igual —por
// fecha+importe o por "un dígito"— y ninguno queda en null. Estos tests fijan eso, porque de ese
// null depende que `flujo.mjs` NO borre la clave de idempotencia (ver `marcarEnCompras`).

test('el punto de venta leído distinto no deja el comprobante en null: es ÉSE', () => {
  // ═══ CAMBIO DE CONTRATO (14/08): de PROBABLE a CARGADO ═══
  //
  // Antes esto devolvía un PROBABLE y el dueño tenía que contestar una pregunta. Pero acá coinciden
  // el proveedor, la fecha, el importe AL CENTAVO y los ocho dígitos del correlativo, y lo único que
  // difiere es el punto de venta —el grupo que el OCR más equivoca—. Eso no es «puede que sea»: es
  // ése. Preguntarlo es hacerle revisar un comprobante que el sistema ya sabe cuál es, que es
  // exactamente el trabajo que pidió no hacer.
  //
  // Lo que este test protegía sigue protegido, y más fuerte: no devuelve null, así que la clave de
  // idempotencia no se borra (ver `marcarEnCompras`).
  const filas = [
    ...Array.from({ length: 822 }, () => []),
    fila('5/8/2026', 'Combustibles Barcelo', 'F A', '00113-00014305', 'Taller', 'combustible', '$ 100.000,00'),
  ]
  const r = buscarEnCompras(
    { proveedor: 'Combustibles Barcelo', tipo: 'A', numero: '0011-00014305', fecha: '05/08/2026', total: 100000 },
    { ok: true, ...indexarCompras(filas) })
  assert.equal(r?.que, HALLAZGO.CARGADO, 'null acá significa borrar la clave y cargarlo dos veces')
  assert.equal(r.fila, 826)
  assert.match(r.via, /correlativo/)
})

test('el punto de venta mal leído lo caza la pasada del CORRELATIVO', () => {
  // VILLA DEL PINO: el registro guardó `0001-00015177` y la celda dice `00015-00015177`. Encima el
  // total se leyó ×100 ($10.500.067 contra $105.000,67), así que fecha+importe tampoco alcanza.
  //
  // ═══ CAMBIO DE CONTRATO (14/08): la misma fila, por una vía mejor ═══
  //
  // Antes lo cazaba la pasada de "un dígito", y lo hacía por accidente: `00015-…` y `0001-…` tenían
  // largos distintos porque el punto de venta conservaba el cero de relleno. Desde que el punto de
  // venta se normaliza a cuatro dígitos (`puntoDeVenta`, que es lo que impide que el mismo
  // comprobante tenga DOS claves de idempotencia), los dos números miden lo mismo y difieren en DOS
  // caracteres — la pasada de "un dígito" ya no puede verlo.
  //
  // Lo ve la pasada del CORRELATIVO, que es la que corresponde: los ocho dígitos coinciden enteros y
  // lo único que cambia es el punto de venta, que es justo el grupo que el OCR más equivoca. El
  // hallazgo es el mismo (PROBABLE, fila 812) y el motivo es más preciso.
  const filas = [
    ...Array.from({ length: 808 }, () => []),
    fila('1/8/2026', 'VILLA DEL PINO', 'F A', '00015-00015177', 'Administracion', 'Combustible', '$ 105.000,67'),
  ]
  const r = buscarEnCompras(
    { proveedor: 'VILLA DEL PINO', tipo: 'A', numero: '0001-00015177', fecha: '01/08/2026', total: 10500067 },
    { ok: true, ...indexarCompras(filas) })
  assert.equal(r?.que, HALLAZGO.PROBABLE)
  assert.equal(r.fila, 812)
  assert.match(r.via, /correlativo/)
})
