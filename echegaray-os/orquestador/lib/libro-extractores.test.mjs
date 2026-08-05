// LOS EXTRACTORES, EN FRÍO — filas armadas a mano, con los casos que ya costaron plata.
import test from 'node:test'
import assert from 'node:assert/strict'
import { deCompras, deCobranzas, deChequesEmitidos, deBancoCargos } from './libro-extractores.mjs'
import { ENTRA, SALE } from './libro-movimientos.mjs'

// ── Compras: título, agrupador, encabezado, datos ─────────────────────────────────────────────────
const ENC_COMPRAS = ['Proveedor', 'CUIT (OS)', 'Comprobante', 'Importe total', 'Estado pago',
  'Tipo pago', 'Rubro de caja', 'Fecha de caja (OS)', 'Obra']
const compras = (extra = []) => [[], [], ENC_COMPRAS,
  ['Mariana SA', '30-71037035-0', '0002-00000683', 100000, 'Pagado', 'Transferencia', 'Materiales Civil', 46000, 'ARCOR'],
  ['Nota SA', '30-71037035-0', '0002-00000683', -21359, 'Pagado', 'Transferencia', 'Materiales Civil', 46001, ''],
  ['Cheq SA', '20-11111111-1', '0001-00000001', 50000, 'Pagado', 'Cheque', 'Materiales Civil', 46002, ''],
  ['Prov SRL', '', '', 70000, 'Pendiente', 'Transferencia', 'Estructura', 45990, ''],
  ...extra]

test('COMPRAS: pagado=REAL, pendiente vencido=VENCIDO, y el cheque NO se emite desde acá', () => {
  const ms = deCompras(compras(), 46000)
  // El cheque lo emite Cheques Emitidos como COMPROMETIDO: emitirlo acá lo contaría dos veces.
  assert.ok(!ms.some((m) => m.concepto === 'Cheq SA'), 'el pago con cheque entra por la otra puerta')
  const pagado = ms.find((m) => m.concepto === 'Mariana SA')
  assert.equal(pagado.estado, 'REAL')
  assert.equal(pagado.signo, SALE)
  const pendiente = ms.find((m) => m.concepto === 'Prov SRL')
  assert.equal(pendiente.estado, 'VENCIDO', 'proyectado con fecha pasada = vencido, no proyectado')
})

test('COMPRAS: una nota de crédito ENTRA — plata que vuelve, no un egreso negativo', () => {
  const nota = deCompras(compras(), 46000).find((m) => m.concepto === 'Nota SA')
  assert.equal(nota.signo, ENTRA)
  assert.equal(nota.importe, 21359, 'la magnitud queda positiva; el signo manda')
})

test('COMPRAS: sin la columna "Rubro de caja" en el encabezado, ROMPE nombrándola', () => {
  // Leer por posición produciría movimientos plausibles y equivocados.
  const sinRubro = [[], [], ENC_COMPRAS.filter((c) => c !== 'Rubro de caja')]
  assert.throws(() => deCompras(sinRubro, 46000), /Rubro de caja/)
})

// ── Cobranzas: los datos arrancan en la fila 5 ────────────────────────────────────────────────────
const ENC_COB = ['x', 'Cliente', 'Estado', 'Importe', 'Fecha estimada de cobro', 'Fecha de cobro', 'Forma']
const cob = [[], [], [], ENC_COB,
  ['', 'MESSINA', 'Cobrado', 500000, 46010, 46005, 'Transferencia'],
  ['', 'ARCOR', 'Pendiente', 300000, 45990, '', 'eCheq'],
  ['', 'ANULADA', 'CANCELAR', 999999, 46000, '', ''],
]

test('COBRANZAS: cobrado usa la fecha REAL, pendiente la esperada, CANCELAR no existe', () => {
  const ms = deCobranzas(cob, 46000)
  assert.ok(!ms.some((m) => m.concepto === 'ANULADA'), 'una fila anulada no es un movimiento')
  const cobrado = ms.find((m) => m.concepto === 'MESSINA')
  assert.equal(cobrado.fecha, 46005, 'manda la fecha en que la plata ENTRÓ, no la estimada')
  assert.equal(cobrado.estado, 'REAL')
  const pendiente = ms.find((m) => m.concepto === 'ARCOR')
  assert.equal(pendiente.estado, 'VENCIDO', 'esperado para una fecha que pasó y nadie marcó')
  assert.equal(pendiente.instrumento, 'echeq')
})

// ── Cheques Emitidos: registro con encabezado en la fila 18, datos desde la 20 ───────────────────
const ENC_CH = ['Tipo', 'Número', 'Proveedor', 'Importe', 'Fecha de pago', 'DEBITADO']
const cheques = () => {
  const filas = Array.from({ length: 23 }, () => [])
  // El registro real: encabezado en la fila 19 (índice 18), datos desde la 20 — igual que $K$20:$K.
  filas[18] = ENC_CH
  filas[19] = ['FISICO', '313', 'Corralón', 750000, 46010, '']
  filas[20] = ['ECHEQ', '313', 'Otro SA', 200000, 46012, '']
  filas[21] = ['FISICO', '200', 'Debitado SA', 99999, 45980, 'SI']
  filas[22] = ['FISICO', '', 'Sin número SA', 10000, 46011, '']
  return filas
}

test('CHEQUES: el no debitado es COMPROMETIDO; el debitado NO se emite — ya está en el saldo', () => {
  const ms = deChequesEmitidos(cheques(), { fila0: 20 })
  assert.equal(ms.length, 3)
  assert.ok(ms.every((m) => m.estado === 'COMPROMETIDO'))
  assert.ok(!ms.some((m) => m.concepto === 'Debitado SA'), 'restarlo otra vez fue el error de los $12,19M')
  // Y las claves distinguen FISICO 313 de ECHEQ 313.
  assert.notEqual(ms[0].clave, ms[1].clave)
  // El cheque SIN número no desaparece: su identidad es el origen (pestaña, fila).
  const sinNum = ms.find((m) => m.concepto === 'Sin número SA')
  assert.ok(sinNum.clave.startsWith('origen:'), 'sin número, la fila es la identidad')
})

// ── Banco: sólo los cargos sin factura ────────────────────────────────────────────────────────────
test('BANCO: sólo emite los cargos del banco — el resto ya está en el saldo', () => {
  const filas = [[], [], [],
    [46000, 'IMPUESTO LEY 25413', -6000, '', -1, 'Impuesto al cheque'],
    [46000, 'ACREDITACION MESSINA', 500000, '', 1, 'cobranza'],
    [46001, 'INTERESES DESCUBIERTO', -1507, '', -1, 'Costo financiero del descubierto'],
  ]
  const ms = deBancoCargos(filas, { fila0: 4 })
  assert.equal(ms.length, 2, 'la acreditación NO se emite: duplicarla inventó $9,9M una vez')
  assert.ok(ms.every((m) => m.estado === 'REAL' && m.signo === SALE))
  assert.ok(ms.every((m) => m.rubro === 'Financiero'))
})
