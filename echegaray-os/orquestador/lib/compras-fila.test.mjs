// Los defectos que este módulo existe para impedir. Cada test nombra el suyo: si se revierte el
// arreglo, el test que se pone rojo dice exactamente qué se rompió y cuánto costó la vez anterior.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ANULADA, PRIMERA_FILA, ROTULOS, claveDeCompra, contratoDeColumnas, diaDe, filaACompra, pesos,
} from './compras-fila.mjs'

/** El encabezado real de la fila 3, medido sobre el archivo vivo el 25/08/2026. */
const ENCABEZADO = [
  'ID', 'Categoría', 'Fecha factura', 'Fecha factura (mes)', 'Proveedor', 'Modalidad', 'Tipo',
  'N° Comprobante', 'Unidad de Negocio', 'Cliente / Asignación', 'Detalles / Obra', 'Concepto',
  'Importe', 'IVA', 'Total', 'Tipo pago', 'Fecha prevista de pago (día)',
  'Fecha prevista de pago (mes)', 'Total o Parcial', 'Monto Pagado', 'Monto Parcial 1',
  'Fecha prevista de pago 2', 'Monto Parcial 2', 'Estado', 'Tipo de Costo', 'Estado pago',
  'Estado Carga', 'Rubro de caja', 'Rubro de caja', 'Fecha de caja', 'Familia de material',
  'Sub-rubro de estructura', 'Orden de pago (OS)', 'Orden de pago (OS)', 'Orden sin fecha (OS)',
  '¿Proveedor comercial? (OS)', '¿Comprobante repetido? (OS)', 'Saldo pendiente (OS)', 'CUIT (OS)',
  'Tramo de vencimiento (OS)',
]

/** La primera fila de datos del archivo vivo, tal cual la devuelve la API sin formato. */
const FILA_RSV = [
  0, 'B', 46024, 'ene-26', 'RSV', 'Pago', 'F A', '11-079782', 'Estructura', 'Taller',
  'Servicios seguimiento flota', 'GPS', 44664, 9379.44, 54043.44, 'Transferencia', 46202, 46202,
  'Total', 54043.44, '', '', '', 'Pagado', 'Indirecto', '✓ Pagado', '', 'Servicios recurrentes',
  'Servicios recurrentes', 46202, '', '', '', '', '', 1, '', 0,
]

test('el contrato se resuelve contra el encabezado real de la pestaña', () => {
  const idx = contratoDeColumnas(ENCABEZADO)
  assert.equal(Object.keys(idx).length, Object.keys(ROTULOS).length)
  // Las dos que el fósil confundía: el índice 24 NO es una fecha de pago, es texto.
  assert.equal(idx.tipo_costo, 24)
  assert.equal(idx.fecha_caja, 29)
})

test('un rótulo que falta ABORTA con su nombre adentro, no se completa con un default', () => {
  const sinCuit = ENCABEZADO.map((c) => (c === 'CUIT (OS)' ? 'CUIT' : c))
  assert.throws(() => contratoDeColumnas(sinCuit), /CUIT \(OS\)/)
})

test('un rótulo REPETIDO que sí se replica aborta — elegir el primero es elegir a ciegas', () => {
  const dosVecesProveedor = [...ENCABEZADO]
  dosVecesProveedor[34] = 'Proveedor'
  assert.throws(() => contratoDeColumnas(dosVecesProveedor), /Proveedor/)
})

test('los rótulos repetidos que NO se replican no molestan (los fósiles de AB/AC y AG/AH)', () => {
  // «Rubro de caja» y «Orden de pago (OS)» están dos veces en el encabezado real y la corrida pasa:
  // un chequeo global de duplicados abortaría siempre y dejaría la pestaña sin réplica.
  assert.doesNotThrow(() => contratoDeColumnas(ENCABEZADO))
})

test('el fósil: «Tipo de Costo» va a tipo_costo y la fecha de caja a fecha_caja', () => {
  // El sync viejo leía el índice 24 creyendo que era «Fecha contable del pago». Hoy el 24 dice
  // «Indirecto». Se salvaba porque parseFecha('Indirecto') es null y caía al respaldo: un error que
  // sólo acierta por accidente. Leído por rótulo, cada valor cae en su campo.
  const c = filaACompra(FILA_RSV, contratoDeColumnas(ENCABEZADO), 4)
  assert.equal(c.tipo_costo, 'Indirecto')
  assert.equal(c.fecha_caja, '2026-06-29')
  assert.equal(c.fecha, '2026-01-02')
})

test('los importes se redondean a dos decimales — el flotante crudo no deja cerrar ningún control', () => {
  // «Total» es `=Importe+IVA` y sin formato la API devuelve 406911.29000000004. Al 25/08 eso pasaba
  // en 130 de 882 filas.
  assert.equal(pesos(406911.29000000004), 406911.29)
  assert.equal(pesos(29302.010000000002), 29302.01)
  assert.equal(pesos(51709.28999999999), 51709.29)
  const fila = [...FILA_RSV]; fila[14] = 406911.29000000004
  const c = filaACompra(fila, contratoDeColumnas(ENCABEZADO), 4)
  assert.equal(c.total, 406911.29)
})

test('una fecha es un serial; un texto NO se convierte en fecha', () => {
  assert.equal(diaDe(46024), '2026-01-02')
  assert.equal(diaDe('Indirecto'), null)
  assert.equal(diaDe(''), null)
  assert.equal(diaDe(null), null)
})

test('el ID 0 es una fila — leído con formato se dibuja «—» y así entró a Postgres', () => {
  // Evidencia: `costos_obra` tiene hoy una fila con referencia_externa '—' que es esta compra de
  // $54.043,44, y el resto del libro arranca en el ID 1.
  const c = filaACompra(FILA_RSV, contratoDeColumnas(ENCABEZADO), 4)
  assert.ok(c, 'la fila con ID 0 no puede descartarse por ser falsy')
  assert.equal(c.sheet_id, 0)
  assert.equal(c.fila, 4)
  assert.equal(c.total, 54043.44)
})

test('un ID que no es número no rompe la réplica: la clave de la fila es su renglón', () => {
  const fila = [...FILA_RSV]; fila[0] = '—'
  const c = filaACompra(fila, contratoDeColumnas(ENCABEZADO), 4)
  assert.equal(c.sheet_id, null)
  assert.equal(c.fila, 4)
})

test('una fila sin ID no es una compra', () => {
  const fila = [...FILA_RSV]; fila[0] = ''
  assert.equal(filaACompra(fila, contratoDeColumnas(ENCABEZADO), 4), null)
})

test('una fila ANULADA se replica marcada, no se esconde — quién la cuenta lo decide quien lee', () => {
  const fila = [...FILA_RSV]
  fila[23] = ANULADA; fila[12] = 0; fila[13] = ''; fila[14] = 0
  const c = filaACompra(fila, contratoDeColumnas(ENCABEZADO), 4)
  assert.equal(c.estado, ANULADA)
  assert.equal(c.anulada, true)
  assert.equal(c.total, 0)
})

test('detalle de obra y concepto son DOS campos, no uno pegado con guión', () => {
  // El sync viejo los unía en `concepto` con ' — '. Eso hacía imposible buscar por concepto sin
  // arrastrar el detalle, y perdía el detalle como dato propio.
  const c = filaACompra(FILA_RSV, contratoDeColumnas(ENCABEZADO), 4)
  assert.equal(c.detalle_obra, 'Servicios seguimiento flota')
  assert.equal(c.concepto, 'GPS')
})

test('el estado de pago que la pantalla necesita llega entero', () => {
  const c = filaACompra(FILA_RSV, contratoDeColumnas(ENCABEZADO), 4)
  assert.equal(c.estado, 'Pagado')
  assert.equal(c.estado_pago, '✓ Pagado')
  assert.equal(c.tipo_pago, 'Transferencia')
  assert.equal(c.modalidad, 'Pago')
  assert.equal(c.monto_pagado, 54043.44)
})

test('PRIMERA_FILA es 4: arriba hay título, agrupador y encabezado', () => {
  assert.equal(PRIMERA_FILA, 4)
})

// ── LA CLAVE ────────────────────────────────────────────────────────────────────────────────────

test('la clave es la misma que ya escribió el bot en el registro de idempotencia', () => {
  // Claves reales de `comunicacion.comprobantes_cargados`.
  assert.equal(claveDeCompra({ cuit: '33-70833259-9', tipo: 'F A', comprobante: '0121-00020719' }),
    'c:33708332599|0121-00020719')
  assert.equal(claveDeCompra({ proveedor: 'Corralon Progreso', tipo: 'F A', comprobante: '0004-00003654' }),
    'p:corralon progreso|0004-00003654')
})

test('una NOTA DE CRÉDITO no comparte clave con la factura del mismo número — costó $41,9M', () => {
  const factura = claveDeCompra({ cuit: '30-68164173-0', tipo: 'F A', comprobante: '0005-00000386' })
  const nota = claveDeCompra({ cuit: '30-68164173-0', tipo: 'NC', comprobante: '0005-00000386' })
  assert.notEqual(factura, nota)
  assert.equal(nota, 'c:30681641730|NC|0005-00000386')
})

test('«N C» con espacio es la misma nota de crédito que «NC» — la pestaña escribe las dos formas', () => {
  assert.equal(
    claveDeCompra({ cuit: '30-68164173-0', tipo: 'N C', comprobante: '0005-00000386' }),
    claveDeCompra({ cuit: '30-68164173-0', tipo: 'NC', comprobante: '0005-00000386' }),
  )
})

test('los ceros de relleno del punto de venta no son identidad: un ticket, una clave', () => {
  assert.equal(
    claveDeCompra({ cuit: '30-54958171-0', tipo: 'F A', comprobante: '00016-00029784' }),
    claveDeCompra({ cuit: '30-54958171-0', tipo: 'F A', comprobante: '0016-00029784' }),
  )
})

test('sin número no hay clave: dos facturas del mismo corralón no pueden ser «la misma»', () => {
  assert.equal(claveDeCompra({ proveedor: 'Corralon Progreso', comprobante: '' }), null)
  assert.equal(claveDeCompra({ cuit: '30-68164173-0', comprobante: null }), null)
})

test('dos proveedores con el MISMO número dan claves distintas', () => {
  const a = claveDeCompra({ cuit: '30-68164173-0', comprobante: '0001-00000100' })
  const b = claveDeCompra({ cuit: '33-70833259-9', comprobante: '0001-00000100' })
  assert.notEqual(a, b)
})
