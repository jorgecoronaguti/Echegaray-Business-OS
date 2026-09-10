import test from 'node:test'
import assert from 'node:assert/strict'
import {
  LARGO_REGISTRO, CRLF, PRODUCTOS, LAYOUT_PROVEEDORES,
  transliterar, campoAlf, campoNum, cbuValido, cbuA26, cuitValido, codigoOrganismo,
  registroHeader, registroDetalle, registroTrailer, armarArchivo, validarArchivo,
} from './santander-fur.mjs'

// LOS CASOS DE VERDAD NO SON INVENTADOS: son los CBU y CUIL que Santander ACEPTÓ y acreditó en el
// lote de Fondo de Cese de junio/julio 2026 («PAGO AFON 0607», Drive 1kXUg3vzrCmfO0DoJbY1-5SqnK9YB_p8o).
// Un test de dígito verificador contra un número armado a mano sólo prueba que la función se
// entiende a sí misma.
const CBU_AGUERO = '0720179640000013983244'   // cuenta AFON
const CBU_ROSALES = '0720179640000012938276'
const CBU_SUELDO_QUIROGA = '0720179688000010611454' // cuenta sueldo: otro tipo de cuenta, mismo banco
const CUIL_AGUERO = '20294271067'
const CUIT_ECSAS = '30716304643'

const PAGO = {
  beneficiario: '5', nombre: 'AGUERO CRISTIAN DOMINGO', cuil: CUIL_AGUERO,
  cbu: CBU_AGUERO, importe: 50784, periodo: '202608', fechaPago: '20260915',
}

test('campoNum: el importe total de agosto sale con 2 decimales implícitos', () => {
  assert.equal(campoNum(1379455.92, 15, 2), '000000137945592')
})

test('campoNum: el centavo que el punto flotante se comía', () => {
  // 60940.799999999996 × 100 = 6094079.999… — truncar acá roba un centavo por trabajador
  assert.equal(campoNum(60940.799999999996, 15, 2), '000000006094080')
})

test('campoNum: el período abonado es un campo numérico de 15, no una fecha', () => {
  assert.equal(campoNum('202608', 15), '000000000202608')
})

test('campoNum: un importe que no entra tira en vez de recortarse', () => {
  assert.throws(() => campoNum(12345678901234, 15, 2), /no entra en 15/)
})

test('campoNum: el archivo no lleva signo', () => {
  assert.throws(() => campoNum(-100, 15, 2), /signo/)
})

test('transliterar: el acento se va y la Ñ se queda', () => {
  assert.equal(transliterar('MUÑOZ PEÑA'), 'MUÑOZ PEÑA')
  assert.equal(transliterar('BENÍTEZ Ángel'), 'BENITEZ Angel')
  assert.equal(transliterar("O'HIGGINS 1º"), 'OHIGGINS 1o')
})

test('campoAlf: alinea a la izquierda y rellena con espacios', () => {
  assert.equal(campoAlf('ABC', 6), 'ABC   ')
  assert.equal(campoAlf('ABCDEFGH', 3), 'ABC')
})

test('cbuValido: los CBU que el banco acreditó son válidos', () => {
  for (const c of [CBU_AGUERO, CBU_ROSALES, CBU_SUELDO_QUIROGA]) {
    assert.equal(cbuValido(c), true, c)
  }
})

test('cbuValido: un dígito cambiado en el bloque de la cuenta se detecta', () => {
  // Es el caso RETA (14/04/2026): un CBU «muy parecido pero incorrecto» que el banco rechazó
  // con CUENTA NO EXISTE. El control tiene que poder decir que no.
  const roto = CBU_AGUERO.slice(0, 15) + '9' + CBU_AGUERO.slice(16)
  assert.notEqual(roto, CBU_AGUERO)
  assert.equal(cbuValido(roto), false)
})

test('cbuValido: un dígito cambiado en la sucursal también', () => {
  assert.equal(cbuValido('0720178640000013983244'), false)
})

test('cbuA26: intercala el 0 adelante y los 000 del medio, no rellena al final', () => {
  const c26 = cbuA26(CBU_AGUERO)
  assert.equal(c26.length, 26)
  assert.equal(c26, '00720179600040000013983244')
  assert.equal(c26.slice(1, 9), CBU_AGUERO.slice(0, 8))
  assert.equal(c26.slice(9, 12), '000')
  assert.equal(c26.slice(12), CBU_AGUERO.slice(8))
})

test('cbuA26: un CBU con DV inválido no llega al archivo', () => {
  assert.throws(() => cbuA26('0720179640000013983245'), /verificador/)
})

test('cuitValido: el CUIT del empleador y el CUIL del trabajador', () => {
  assert.equal(cuitValido(CUIT_ECSAS), true)
  assert.equal(cuitValido(CUIL_AGUERO), true)
  assert.equal(cuitValido('23445275549'), true)
  assert.equal(cuitValido('20294271068'), false)
})

test('codigoOrganismo: CUIT + 0 + producto + acuerdo = 17 posiciones', () => {
  const c = codigoOrganismo({ cuit: CUIT_ECSAS, producto: PRODUCTOS.HABERES, acuerdo: '01' })
  assert.equal(c, '30716304643001101')
  assert.equal(c.length, 17)
})

test('cada registro mide exactamente 650', () => {
  assert.equal(registroHeader({ cuit: CUIT_ECSAS, producto: PRODUCTOS.HABERES, acuerdo: '01' }).length, LARGO_REGISTRO)
  assert.equal(registroDetalle(PAGO).length, LARGO_REGISTRO)
  assert.equal(registroTrailer({ total: 1379455.92, cantidad: 23 }).length, LARGO_REGISTRO)
  assert.equal(registroDetalle({ ...PAGO, cuit: CUIL_AGUERO }, { layout: LAYOUT_PROVEEDORES }).length, LARGO_REGISTRO)
})

test('detalle de haberes: cada campo cae en la posición que dice la guía', () => {
  const d = registroDetalle(PAGO)
  assert.equal(d.slice(18, 20), 'RC', 'tipo de comprobante en 019-020')
  assert.equal(d.slice(20, 35), '000000000202608', 'período en 021-035')
  assert.equal(d.slice(39, 69), 'AGUERO CRISTIAN DOMINGO'.padEnd(30), 'nombre en 040-069')
  assert.equal(d.slice(223, 234), CUIL_AGUERO, 'CUIL en 224-234')
  assert.equal(d.slice(396, 397), 'N', 'agrupamiento en 397')
  assert.equal(d.slice(397, 401), '0054', 'país en 398-401')
  assert.equal(d.slice(401, 427), cbuA26(CBU_AGUERO), 'CBU en 402-427')
  assert.equal(d.slice(435, 443), '20260915', 'fecha de pago en 436-443')
  assert.equal(d.slice(443, 458), '000000005078400', 'importe en 444-458')
  assert.equal(d.slice(458, 460), '50', 'forma de pago en 459-460')
})

test('armarArchivo: H + D + T, CRLF, y el trailer suma lo que dicen los detalles', () => {
  const txt = armarArchivo({
    cuit: CUIT_ECSAS, producto: PRODUCTOS.HABERES, acuerdo: '01',
    pagos: [PAGO, { ...PAGO, nombre: 'ROSALES DIEGO JOSE', cbu: CBU_ROSALES, cuil: '20358508783', importe: 50784 }],
  })
  const lineas = txt.split(CRLF).slice(0, -1)
  assert.equal(lineas.length, 4, 'H + dos D + T')
  assert.ok(lineas.every((l) => l.length === LARGO_REGISTRO))
  assert.equal(lineas.map((l) => l[0]).join(''), 'HDDT')
  assert.equal(lineas[3].slice(16, 31), '000000010156800')
  assert.equal(lineas[3].slice(31, 38), '0000002')
  assert.ok(txt.endsWith(CRLF))
  assert.equal(validarArchivo(txt).ok, true)
})

test('validarArchivo: un trailer que no suma se pone rojo', () => {
  const txt = armarArchivo({ cuit: CUIT_ECSAS, producto: PRODUCTOS.HABERES, acuerdo: '01', pagos: [PAGO] })
  const lineas = txt.split(CRLF).slice(0, -1)
  lineas[2] = 'T' + '0'.repeat(15) + '000000009999999' + '0000001' + ' '.repeat(612)
  const r = validarArchivo(lineas.join(CRLF) + CRLF)
  assert.equal(r.ok, false)
  assert.match(r.errores.join(' | '), /trailer: declara 000000009999999/)
})

test('validarArchivo: una cantidad de detalles mal declarada se pone roja', () => {
  const txt = armarArchivo({ cuit: CUIT_ECSAS, producto: PRODUCTOS.HABERES, acuerdo: '01', pagos: [PAGO] })
  const lineas = txt.split(CRLF).slice(0, -1)
  lineas[2] = lineas[2].slice(0, 31) + '0000007' + lineas[2].slice(38)
  const r = validarArchivo(lineas.join(CRLF) + CRLF)
  assert.equal(r.ok, false)
  assert.match(r.errores.join(' | '), /declara 7 detalles y hay 1/)
})

test('validarArchivo: una línea de largo distinto se pone roja', () => {
  const txt = armarArchivo({ cuit: CUIT_ECSAS, producto: PRODUCTOS.HABERES, acuerdo: '01', pagos: [PAGO] })
  const lineas = txt.split(CRLF).slice(0, -1)
  lineas[1] = lineas[1].slice(0, 649)
  const r = validarArchivo(lineas.join(CRLF) + CRLF)
  assert.equal(r.ok, false)
  assert.match(r.errores.join(' | '), /línea 2: mide 649/)
})

test('validarArchivo: un acento que se coló se pone rojo', () => {
  const txt = armarArchivo({ cuit: CUIT_ECSAS, producto: PRODUCTOS.HABERES, acuerdo: '01', pagos: [PAGO] })
  const lineas = txt.split(CRLF).slice(0, -1)
  lineas[1] = lineas[1].slice(0, 40) + 'Á' + lineas[1].slice(41)
  const r = validarArchivo(lineas.join(CRLF) + CRLF)
  assert.equal(r.ok, false)
  assert.match(r.errores.join(' | '), /caracteres que el banco no acepta/)
})

test('validarArchivo: el CBU pegado sin los 000 del medio se pone rojo', () => {
  // El error clásico de las 26 posiciones: poner el «0» adelante y rellenar al final, en vez de
  // intercalar «000» entre los dos bloques. Corre la cuenta cuatro lugares.
  //
  // OJO — el DV solo NO alcanza para cazar cualquier corrimiento: probado con estos números,
  // `CBU + '0000'` da dos DV que también cierran. Por eso el validador exige además que las
  // posiciones fijas (el «0» inicial y los «000» del medio) estén donde la guía dice, y por eso
  // el script cruza cada CBU contra el lote que el banco YA acreditó.
  const txt = armarArchivo({ cuit: CUIT_ECSAS, producto: PRODUCTOS.HABERES, acuerdo: '01', pagos: [PAGO] })
  const lineas = txt.split(CRLF).slice(0, -1)
  lineas[1] = lineas[1].slice(0, 401) + ('0' + CBU_AGUERO + '000') + lineas[1].slice(427)
  const r = validarArchivo(lineas.join(CRLF) + CRLF)
  assert.equal(r.ok, false)
  assert.match(r.errores.join(' | '), /CBU/)
})

test('validarArchivo: un CUIL con DV inválido se pone rojo', () => {
  const txt = armarArchivo({ cuit: CUIT_ECSAS, producto: PRODUCTOS.HABERES, acuerdo: '01', pagos: [PAGO] })
  const lineas = txt.split(CRLF).slice(0, -1)
  lineas[1] = lineas[1].slice(0, 223) + '20294271068' + lineas[1].slice(234)
  const r = validarArchivo(lineas.join(CRLF) + CRLF)
  assert.equal(r.ok, false)
  assert.match(r.errores.join(' | '), /dígito verificador inválido/)
})

test('validarArchivo: un archivo con el acuerdo sin resolver NO se puede subir', () => {
  // Se genera igual para poder revisarlo, pero el control lo prueba solo — no depende de que
  // alguien lea la advertencia del resumen.
  const txt = armarArchivo({ cuit: CUIT_ECSAS, producto: PRODUCTOS.HABERES, acuerdo: '??', pagos: [PAGO] })
  const r = validarArchivo(txt)
  assert.equal(r.ok, false)
  assert.match(r.errores.join(' | '), /NO se puede subir/)
})

test('validarArchivo: un importe en cero se pone rojo', () => {
  assert.throws(() => armarArchivo({
    cuit: CUIT_ECSAS, producto: PRODUCTOS.HABERES, acuerdo: '01', pagos: [],
  }), /no hay ningún pago/)
  const txt = armarArchivo({ cuit: CUIT_ECSAS, producto: PRODUCTOS.HABERES, acuerdo: '01', pagos: [PAGO] })
  const lineas = txt.split(CRLF).slice(0, -1)
  lineas[1] = lineas[1].slice(0, 443) + '0'.repeat(15) + lineas[1].slice(458)
  lineas[2] = lineas[2].slice(0, 16) + '0'.repeat(15) + lineas[2].slice(31)
  const r = validarArchivo(lineas.join(CRLF) + CRLF)
  assert.equal(r.ok, false)
  assert.match(r.errores.join(' | '), /importe en cero/)
})

test('layout de proveedores: distribución 001 y liquidación en 506-524', () => {
  const d = registroDetalle({
    ...PAGO, cuit: CUIL_AGUERO, comprobante: 'FCL202608', tipoComprobante: 'OP', liquidacion: 42,
  }, { layout: LAYOUT_PROVEEDORES })
  assert.equal(d.slice(18, 20), 'OP')
  assert.equal(d.slice(387, 390), '001', 'tipo de distribución en 388-390')
  assert.equal(d.slice(390, 393), '001', 'sucursal de distribución en 391-393')
  assert.equal(d.slice(427, 435), '20260915', 'fecha de emisión en 428-435')
  assert.equal(d.slice(505, 524), '0000000000000000042', 'liquidación en 506-524')
})

test('el header de proveedores lleva el código de concepto donde haberes lleva espacios', () => {
  const h = registroHeader({
    cuit: CUIT_ECSAS, producto: PRODUCTOS.PROVEEDORES, acuerdo: '01',
    layout: LAYOUT_PROVEEDORES, concepto: 'FCL',
  })
  assert.equal(h.slice(33, 38), 'FCL  ')
  assert.equal(h.slice(1, 18), '30716304643001001')
})
