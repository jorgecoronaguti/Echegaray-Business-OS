// Los casos son los REALES del extracto del 14/08/2026 y de la pestaña Compras de ese día.
// Si alguien afloja la tolerancia, saca la ventana de plausibilidad o deja de mirar el corte, alguno
// de estos se pone rojo con el número exacto que se perdió.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  aISO, aNumero, debitosCompatibles, evaluarCompra, auditarDobleConteo, comprasDeLaGrilla,
  nombreCorrobora, COL,
} from './compras-doble-conteo.mjs'

const CORTE = '2026-08-13'

// El débito real: el banco escribe un centavo menos que el Sheet.
const TRIELEC_BANCO = { fecha: '2026-08-12', concepto: 'Compra con tarjeta de debito - Trielec sa - tarj nro. 8866', importe: -2205400.33, referencia: '13026904' }
const PINTURERIAS_BANCO = { fecha: '2026-08-11', concepto: 'Compra con tarjeta de debito - Pinturerias cordoba - tarj nro. 8866', importe: -426219.42, referencia: '9845619' }
const RODAMIENTOS_BANCO = { fecha: '2026-08-11', concepto: 'Compra con tarjeta de debito - Rodamientos cuyo srl', importe: -6693.39, referencia: '13928662' }

const TRIELEC_COMPRA = {
  fila: 844, proveedor: 'Trielec', importe: 2205400.34, medioPago: 'Débito', estado: 'Pagado',
  fechaCaja: '2026-08-15', fechaComprobante: '2026-08-12',
}

test('aISO lee los dos formatos con los que convive la Fecha de caja', () => {
  assert.equal(aISO('15/8/2026'), '2026-08-15')
  assert.equal(aISO('2026-08-15'), '2026-08-15')
  // Serie de Sheets: 46249 es el 15/08/2026 —comprobado aparte, no contra este mismo código:
  // (date(2026,8,15) − date(1899,12,30)).days = 46249—. Si se leyera sólo el texto, la mitad de
  // las filas quedaría fuera del control sin que nadie se entere.
  assert.equal(aISO(46249), '2026-08-15')
  assert.equal(aISO(''), null)
  assert.equal(aISO('no es fecha'), null)
})

test('aISO lee dd/mm y NUNCA mm/dd', () => {
  // 8 de diciembre, no 12 de agosto. Al revés el control acusaría o absolvería el día equivocado.
  assert.equal(aISO('08/12/2026'), '2026-12-08')
})

test('aNumero lee el importe con formato de moneda es-AR', () => {
  assert.equal(aNumero('$ 2.205.400,34'), 2205400.34)
  assert.equal(aNumero(2205400.34), 2205400.34)
  assert.equal(aNumero(''), null)
})

test('EL CASO: Trielec fila 844 — el banco la debitó el 12/08 y la Fecha de caja dice 15/08', () => {
  const h = evaluarCompra(TRIELEC_COMPRA, [TRIELEC_BANCO], { corte: CORTE })
  assert.ok(h, 'el doble conteo de $2.205.400,34 tiene que detectarse')
  assert.equal(h.motivo, 'doble_conteo_banco')
  assert.equal(h.monto, 2205400.34)
  assert.equal(h.candidatos.length, 1)
  assert.equal(h.candidatos[0].referencia, '13026904')
})

test('el centavo de diferencia entre el Sheet y el banco no puede tapar el hallazgo', () => {
  // $2.205.400,34 en Compras vs $2.205.400,33 en el banco. Con tolerancia cero esto da CERO
  // hallazgos y los $2,2M se restan dos veces igual.
  assert.equal(debitosCompatibles({ importe: 2205400.34, proveedor: 'Trielec', fechaComprobante: '2026-08-12' }, [TRIELEC_BANCO], { corte: CORTE }).length, 1)
})

test('la tolerancia no llega a emparejar dos compras distintas', () => {
  const otra = { ...TRIELEC_BANCO, importe: -2205401.34 } // un peso de diferencia: es otra factura
  assert.equal(debitosCompatibles({ importe: 2205400.34, proveedor: 'Trielec', fechaComprobante: '2026-08-12' }, [otra], { corte: CORTE }).length, 0)
})

test('EL RUIDO QUE MATÓ A LA PRIMERA VERSIÓN: importe igual y proveedor distinto NO emparejan', () => {
  // Medido en vivo: 19 hallazgos por $9,4M, casi todos cargas de combustible de $100.000 redondos
  // cruzadas entre sí. Sin la corroboración por nombre este control es ruido y se deja de leer.
  const barcelo = { importe: 100000, proveedor: 'Combustibles Barcelo', fechaComprobante: '2026-08-12' }
  const villaDelPino = { fecha: '2026-08-12', concepto: 'Compra con tarjeta de debito - Villa del pino sa - tarj nro. 8866', importe: -100000, referencia: '15270019' }
  assert.equal(debitosCompatibles(barcelo, [villaDelPino], { corte: CORTE }).length, 0)
})

test('un impuesto del banco por el mismo importe tampoco es una compra', () => {
  const barcelo = { importe: 60000.02, proveedor: 'Combustibles Barcelo', fechaComprobante: '2026-08-04' }
  const impuesto = { fecha: '2026-08-05', concepto: 'Impuesto ley 25.413 credito 0,6%', importe: -60000, referencia: '8767' }
  assert.equal(debitosCompatibles(barcelo, [impuesto], { corte: CORTE }).length, 0)
})

test('nombreCorrobora tolera el plural y la forma societaria, y no inventa parecidos', () => {
  assert.ok(nombreCorrobora('Trielec', 'Compra con tarjeta de debito - Trielec sa - tarj nro. 8866'))
  // "Pintureria" (Sheet) vs "Pinturerias" (banco): una `s` no decide $426.219.
  assert.ok(nombreCorrobora('Pintureria Cordoba', 'Compra con tarjeta de debito - Pinturerias cordoba'))
  assert.ok(nombreCorrobora('Rodamientos Cuyo SRL', 'Compra con tarjeta de debito - Rodamientos cuyo srl'))
  assert.equal(nombreCorrobora('Combustibles Barcelo', 'Compra con tarjeta de debito - Villa del pino sa'), false)
  // La MERCADERÍA no corrobora al VENDEDOR: siete cargas de $100.000 redondos emparejaban con
  // estaciones distintas sólo porque las dos decían "combustibles".
  assert.equal(nombreCorrobora('Combustibles Barcelo', 'Compra con tarjeta de debito - Appypf 2660 combustibles'), false)
  assert.ok(nombreCorrobora('Combustibles Barcelo', 'Compra con tarjeta de debito - Combustibles barcelo srl'))
  // Un proveedor que sólo tiene palabras vacías no corrobora nada: mejor no reportar que reportar mal.
  assert.equal(nombreCorrobora('SA', 'Compra con tarjeta de debito - Cualquiera'), false)
})

test('con la Fecha de caja bien puesta (≤ corte) NO hay hallazgo: la fórmula ya la deja afuera', () => {
  const corregida = { ...TRIELEC_COMPRA, fechaCaja: '2026-08-12' }
  assert.equal(evaluarCompra(corregida, [TRIELEC_BANCO], { corte: CORTE }), null)
})

test('un débito POSTERIOR al corte no es doble conteo: es la resta que la fórmula existe para hacer', () => {
  const tarde = { ...TRIELEC_BANCO, fecha: '2026-08-15' }
  assert.equal(evaluarCompra(TRIELEC_COMPRA, [tarde], { corte: CORTE }), null)
})

test('EL CASO: Pintureria Cordoba fila 845 dice Efectivo y el banco la debitó por tarjeta', () => {
  const compra = {
    fila: 845, proveedor: 'Pintureria Cordoba', importe: 426219.42, medioPago: 'Efectivo',
    estado: 'Pagado', fechaCaja: '2026-08-15', fechaComprobante: '2026-08-11',
  }
  const h = evaluarCompra(compra, [PINTURERIAS_BANCO], { corte: CORTE })
  assert.ok(h, 'baja la caja física por un billete que nunca salió del cajón')
  assert.equal(h.motivo, 'medio_efectivo_pero_salio_del_banco')
  assert.equal(h.monto, 426219.42)
})

test('el efectivo duplica aunque la Fecha de caja esté dentro del corte: son dos canales', () => {
  const compra = {
    fila: 845, proveedor: 'Pintureria Cordoba', importe: 426219.42, medioPago: 'Efectivo',
    estado: 'Pagado', fechaCaja: '2026-08-11', fechaComprobante: '2026-08-11',
  }
  assert.equal(evaluarCompra(compra, [PINTURERIAS_BANCO], { corte: CORTE })?.motivo, 'medio_efectivo_pero_salio_del_banco')
})

test('Rodamientos Cuyo fila 840 está BIEN y no puede aparecer como hallazgo', () => {
  // Fecha de caja 11/08 = el día en que el banco la debitó. Es el control de falso positivo: si este
  // se pone rojo, el auditor grita sobre filas correctas y se deja de leer.
  const compra = {
    fila: 840, proveedor: 'Rodamientos Cuyo', importe: 6693.39, medioPago: 'Débito',
    estado: 'Pagado', fechaCaja: '2026-08-11', fechaComprobante: '2026-08-11',
  }
  assert.equal(evaluarCompra(compra, [RODAMIENTOS_BANCO], { corte: CORTE }), null)
})

test('una compra Pendiente no se audita: todavía no prometió nada', () => {
  assert.equal(evaluarCompra({ ...TRIELEC_COMPRA, estado: 'Pendiente' }, [TRIELEC_BANCO], { corte: CORTE }), null)
})

test('Tarjeta Crédito y Echeq quedan fuera: no los resta la fórmula del banco', () => {
  for (const medio of ['Tarjeta Crédito', 'Echeq', 'Cheque']) {
    assert.equal(evaluarCompra({ ...TRIELEC_COMPRA, medioPago: medio }, [TRIELEC_BANCO], { corte: CORTE }), null, medio)
  }
})

test('la ventana de plausibilidad evita emparejar con un débito de dos meses antes', () => {
  const viejo = { ...TRIELEC_BANCO, fecha: '2026-06-12' }
  assert.equal(debitosCompatibles({ importe: 2205400.34, proveedor: 'Trielec', fechaComprobante: '2026-08-12' }, [viejo], { corte: CORTE }).length, 0)
})

test('auditarDobleConteo suma por motivo y ordena por monto', () => {
  const compras = [
    { fila: 845, proveedor: 'Pintureria Cordoba', importe: 426219.42, medioPago: 'Efectivo', estado: 'Pagado', fechaCaja: '2026-08-15', fechaComprobante: '2026-08-11' },
    TRIELEC_COMPRA,
  ]
  const r = auditarDobleConteo(compras, [TRIELEC_BANCO, PINTURERIAS_BANCO], { corte: CORTE })
  assert.equal(r.hallazgos.length, 2)
  assert.equal(r.hallazgos[0].fila, 844, 'el más caro primero')
  assert.equal(r.montoDobleConteo, 2205400.34)
  assert.equal(r.montoEfectivo, 426219.42)
})

test('comprasDeLaGrilla lee la fila 844 real tal cual la devuelve la API', () => {
  const fila844 = []
  fila844[COL.fechaComprobante] = '12/8/2026'
  fila844[COL.proveedor] = 'Trielec'
  fila844[COL.total] = '$ 2.205.400,34'
  fila844[COL.medioPago] = 'Débito'
  fila844[COL.estado] = 'Pagado'
  fila844[COL.fechaCaja] = '15/8/2026'
  const [c] = comprasDeLaGrilla([fila844], 844)
  assert.deepEqual(c, {
    fila: 844, proveedor: 'Trielec', importe: 2205400.34, medioPago: 'Débito',
    estado: 'Pagado', fechaCaja: '2026-08-15', fechaComprobante: '2026-08-12',
  })
})

test('una fila sin importe no entra al control (las filas vacías del final de Compras)', () => {
  assert.equal(comprasDeLaGrilla([[], ['', '', '', 'dic-99']], 846).length, 0)
})
