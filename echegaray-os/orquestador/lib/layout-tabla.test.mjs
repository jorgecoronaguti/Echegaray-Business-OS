import test from 'node:test'
import assert from 'node:assert/strict'
import { auditarTabla, tipoDe, esTotal, esLeyenda } from './layout-tabla.mjs'

// ═══ EL CUADRO 4 DE "Proveedores", TAL COMO ESTABA EN EL ARCHIVO EL 14/08/2026 ═══
//
// No es un ejemplo inventado: son las filas 114–140 leídas con UNFORMATTED_VALUE del archivo real
// (1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8), recortadas a las columnas A..G. El dueño dijo
// "el cuadro 4 está todo roto y arrastra el error para abajo" y esto es lo que había.
//
// Si mañana alguien revierte la limpieza del footprint y el sedimento vuelve, este test se pone rojo
// con las MISMAS filas que el dueño vio.
const CUADRO_4_ROTO = [
  /* 114 */['Proveedor según AFIP', 'CUIT', 'Comprobante', 'Fecha', 'Importe', '▲ revisar (parcial o descuento)', ''],
  /* 115 */['BOTAS MERCADO DAVID ESTEBAN', '20-35318687-7', '0004-00006554', 46193, '=SUMPRODUCT(1)', '▲ revisar (parcial o descuento)', ''],
  /* 116 */['MB EMPRENDIMIENTOS S.R.L', '30-71037035-0', '0002-00000683', 46132, '', 'Devolución — el costo baja', '0004-00006554'],
  /* 117 */['PEREZ GARCIA MARISOL BIBIANA', '23-36911157-4', '0006-00003023', 46119, '', '▲ revisar (parcial o descuento)', ''],
  /* 118 */['MB EMPRENDIMIENTOS S.R.L', '30-71037035-0', '0002-00000665', 46079, '', 'REFACTURACIÓN — el costo sigue', '0004-00003576 → 0004-00003578'],
  /* 119 */['PEREZ GARCIA MARISOL BIBIANA', '0010-00000001', '0002-00000674', 46109, '', 'Devolución — el costo baja', '0010-00000001'],
  /* 120 */['Hormiserv', '0005-00000386', '0002-00000656', 46048, '', '▲ revisar (parcial o descuento)', ''],
  /* 121 */['Ductos San Juan SRL', '0002-00001763', '0002-00000682', 46132, '', '▲ revisar (parcial o descuento)', ''],
  /* 122 */['Alumetal', '0031-00002661', '0002-00000664', 46079, '', '▲ revisar (parcial o descuento)', ''],
  /* 123 */['TOTAL ACREDITADO', '', '0002-00000673', 46109, '', '', ''],
  /* 124 */['', '', '0002-00000655', 46045, '', '', ''],
  /* 125 */['STARLINK ARGENTINA S R L', '30-71754087-1', '0002-05565279', 46163, '', '', ''],
  /* 126 */['DUBOS UGARTE PEDRO LUIS RAUL', '20-28773782-4', '0011-00001262', '26/2/2026', '', '', ''],
  /* 127 */['SIDERAGRO SAN JUAN SRL', '30-71170927-0', '0008-00021938', 46028, '', '', ''],
  /* 128 */['TELEFONICA MOVILES ARGENTINA SOCIEDAD ANONIMA', '30-67881435-7', '2470-01608263', 46198, '', '', ''],
  /* 129 */['  · cargados en Compras, por N° de comprobante', 433, '2470-01545411', 46078, '', '', ''],
  /* 130 */['ROBLES PINTURERIAS S.R.L.', '30-71135522-3', '0006-00006997', 46077, '', '', ''],
  /* 131 */['Alumetal', '30-56736337-2', '0038-00025483', 46218, '', '', ''],
  /* 132 */['PEREZ GARCIA MARISOL BIBIANA', '23-36911157-4', '0007-00002477', 46037, '', '', ''],
  /* 133 */['Leites Maldonado Gustavo Eduardo', '20-25462350-5', '0011-00000974', 46193, '', '', ''],
  /* 134 */['Ruviño Matias Esteban', '23-28475258-9', '0002-00004672', '6/7/2026', '', 'Importe', ''],
]

/** El mismo cuadro sin sedimento: lo que tiene que quedar cuando el footprint se limpia de verdad. */
const CUADRO_4_SANO = [
  /* 114 */['Proveedor según ARCA', 'CUIT', 'Comprobante', 'Fecha', '', 'Importe', ''],
  /* 115 */['BOTAS MERCADO DAVID ESTEBAN', '20-35318687-7', '0004-00006554', 46193, '', '=SUMPRODUCT(1)', ''],
  /* 116 */['STARLINK ARGENTINA S R L', '30-71754087-1', '0002-05565279', 46163, '', '=SUMPRODUCT(1)', ''],
  /* 117 */['DUBOS UGARTE PEDRO LUIS RAUL', '20-28773782-4', '0011-00001262', 46079, '', '=SUMPRODUCT(1)', ''],
]

test('el cuadro 4 roto: el auditor ve las dos tablas encimadas', () => {
  const h = auditarTabla({ filas: CUADRO_4_ROTO, desde: 114, encabezado: 114, hasta: 134 })
  assert.ok(h.length > 0, 'con este cuadro el auditor NO puede dar verde')

  // El "TOTAL ACREDITADO" de las notas de crédito, caído en el medio de la lista de comprobantes.
  assert.ok(h.some((x) => x.tipo === 'rotulo-en-el-cuerpo' && x.fila === 123),
    'no vio el TOTAL ACREDITADO en la fila 123')
  // La leyenda del control de cobertura de ARCA, en el medio de los datos.
  assert.ok(h.some((x) => x.tipo === 'rotulo-en-el-cuerpo' && x.fila === 129),
    'no vio la leyenda "· cargados en Compras" en la fila 129')
  // El encabezado "Importe" del layout nuevo, escrito sobre una fila de datos del viejo.
  assert.ok(h.some((x) => x.tipo === 'rotulo-en-el-cuerpo' && x.fila === 134 && x.col === 5),
    'no vio el encabezado "Importe" repetido en la fila 134')
  // La columna "Fecha": seriales y strings conviviendo. No ordena ni compara.
  assert.ok(h.some((x) => x.tipo === 'columna-mezclada' && x.col === 3),
    'no vio la columna Fecha con número y texto mezclados')
})

test('el cuadro 4 sano: el auditor da verde', () => {
  assert.deepEqual(auditarTabla({ filas: CUADRO_4_SANO, desde: 114, encabezado: 114, hasta: 117 }), [])
})

test('una fila con dato fuera de las columnas que el encabezado declara', () => {
  const filas = [
    ['Proveedor', 'CUIT', 'Comprobante'],
    ['Alumetal', '30-56736337-2', '0038-00025483'],
    ['Hormiserv', '30-71037035-0', '0002-00000683', '', '', 'REFACTURACIÓN — el costo sigue'],
  ]
  const h = auditarTabla({ filas, desde: 10, encabezado: 10, hasta: 12 })
  assert.deepEqual(h.map((x) => [x.tipo, x.fila, x.col]), [['fila-con-dos-duenos', 12, 5]])
})

test('una columna de fechas con un solo tipo no es un hallazgo', () => {
  const filas = [['Fecha'], [46193], [46132], [46109]]
  assert.deepEqual(auditarTabla({ filas, desde: 1, encabezado: 1, hasta: 4 }), [])
})

test('tipoDe distingue la fecha-texto del serial: es el defecto, no un tipo legítimo', () => {
  assert.equal(tipoDe(46193), 'numero')
  assert.equal(tipoDe('26/2/2026'), 'fecha-texto')
  assert.equal(tipoDe('0038-00025483'), 'texto')
  assert.equal(tipoDe('=SUM(A1:A2)'), 'formula')
  assert.equal(tipoDe(''), 'vacio')
  // Un 0 es un dato, no un vacío: si se contara vacío, una columna en cero pasaría por limpia.
  assert.equal(tipoDe(0), 'numero')
})

test('los rótulos de cierre y las leyendas se reconocen por su forma', () => {
  assert.ok(esTotal('TOTAL ACREDITADO'))
  assert.ok(esTotal('Total sin cargar'))
  assert.ok(!esTotal('Totalizadora SRL'), 'un proveedor que empieza con "Total" no es un total')
  assert.ok(esLeyenda('  · cargados en Compras, por N° de comprobante'))
  assert.ok(esLeyenda('▲ revisar (parcial o descuento)'))
  assert.ok(!esLeyenda('Alumetal'))
})
