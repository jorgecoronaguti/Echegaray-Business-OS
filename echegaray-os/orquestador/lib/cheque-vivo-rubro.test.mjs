import test from 'node:test'
import assert from 'node:assert/strict'
import { comprasPagadasConCheque, deCompras, deChequesEmitidos } from './libro-extractores.mjs'
import { cruzar, chequesDelRegistro } from './cruce-cheque-factura.mjs'
import { NOMBRES_COMPRAS } from './libro-extractores-compras.mjs'

// EL DEFECTO QUE ATRAPA (auditoría de consistencia del 10/09/2026, resuelta el 11/09).
//
// «$8.207.866 de cheques emitidos que no llegan a ningún Cash Flow». De ésos, $7.147.930 SÍ estaban
// en el cuadro — en la línea equivocada. La fila de Compras pagada con un cheque vivo y con fecha de
// caja POSTERIOR al corte salía entera con el rubro de la factura, y el cheque desaparecía del rubro
// «Cheques emitidos» porque `deChequesEmitidos` saca de su puerta a todo cheque cruzado. La misma
// plata, el mismo cheque y la misma factura caían en dos líneas distintas del cuadro según si la
// fecha de caja ya había pasado: `Cheques Emitidos!B23` no podía cerrar contra la línea del cuadro.
//
// Casos reales que cubre: Machuca (Cheques f138+f139 → Compras f858), Femenia (f140 → f908) y
// MARIANA SA (f141 → Compras f639).

const CAB = Object.entries(NOMBRES_COMPRAS).map(([clave, rotulo]) => ({ clave, rotulo }))
const IDX = new Map(CAB.map((x, i) => [x.clave, i]))

const CORTE = 46265        // el corte del extracto
const CAJA_FUTURA = 46290  // la fecha de caja de la factura, POSTERIOR al corte
const PAGO_CHEQUE = 46292  // y la fecha de pago del cheque, que es la que manda en el plan de caja

/** Compras con su encabezado real en la fila 3 (1 título, 2 agrupador). Una fila pagada con echeq. */
function compras({ fechaCaja = CAJA_FUTURA, total = 2560965 } = {}) {
  const enc = CAB.map((x) => x.rotulo)
  const f = new Array(CAB.length).fill('')
  f[IDX.get('proveedor')] = 'Machuca Cesar Hector'
  f[IDX.get('cuit')] = '20259382735'
  f[IDX.get('comprobante')] = '0002-00000343'
  f[IDX.get('importe')] = total
  f[IDX.get('estado')] = 'Pagado'
  f[IDX.get('tipoPago')] = 'Echeq'
  f[IDX.get('montoPagado')] = total
  f[IDX.get('rubro')] = 'Materiales Civil'
  f[IDX.get('fechaCaja')] = fechaCaja
  return [[], [], enc, f]
}

/** «Cheques Emitidos» con un echeq vivo por el total de la factura, con fecha de pago propia. */
function chequesEmitidos({ fechaPago = PAGO_CHEQUE, monto = 2560965 } = {}) {
  const enc = []
  enc[0] = 'Tipo'; enc[1] = 'Nro'; enc[4] = 'Proveedor'; enc[5] = 'Monto'
  enc[7] = 'Comprobante'; enc[8] = 'fecha de pago'; enc[10] = 'DEBITADO'
  const f = []
  f[0] = 'ECHEQ'; f[1] = '000379'; f[4] = 'Machuca Cesar Hector'; f[5] = monto
  f[7] = '0002-00000343'; f[8] = fechaPago; f[10] = 'No'
  return { filas: [enc, f], fila0: 2 }
}

const cruceDe = (filasCompras, ch) =>
  cruzar(chequesDelRegistro(ch.filas, { fila0: ch.fila0 }), comprasPagadasConCheque(filasCompras))

test('la factura con fecha de caja FUTURA pagada con cheque vivo viaja con rubro «Cheques emitidos»', () => {
  const filas = compras()
  const ch = chequesEmitidos()
  const cruce = cruceDe(filas, ch)
  const ms = deCompras(filas, CORTE, { aviso: () => {}, cruce })
  assert.equal(ms.length, 1, 'una sola cuota: el cheque cubre la factura entera')
  assert.equal(ms[0].rubro, 'Cheques emitidos', 'la naturaleza en el plan de caja es «cheque a cubrir»')
  assert.equal(ms[0].fecha, PAGO_CHEQUE, 'y la fecha es la del CHEQUE, no la de caja de la factura')
  assert.equal(ms[0].estado, 'COMPROMETIDO')
})

test('y el cheque NO sale además por su propia puerta: la plata se cuenta UNA vez', () => {
  const filas = compras()
  const ch = chequesEmitidos()
  const cruce = cruceDe(filas, ch)
  const delCheque = deChequesEmitidos(ch.filas, { fila0: ch.fila0, cruce })
  const deLaCompra = deCompras(filas, CORTE, { aviso: () => {}, cruce })
  assert.equal(delCheque.length, 0)
  const total = [...delCheque, ...deLaCompra].reduce((a, m) => a + m.importe, 0)
  assert.equal(total, 2560965, 'ni de más ni de menos')
})

test('EL CONTROL PUEDE DAR ROJO: sin el cruce, la misma fila sale con el rubro de la factura', () => {
  const ms = deCompras(compras(), CORTE, { aviso: () => {} })
  assert.equal(ms.length, 1)
  assert.equal(ms[0].rubro, 'Materiales Civil')
  assert.equal(ms[0].fecha, CAJA_FUTURA)
})

test('los dos gemelos caen en la MISMA línea: fecha de caja pasada y futura dan el mismo rubro', () => {
  const rubroCon = (fechaCaja) => {
    const filas = compras({ fechaCaja })
    const ch = chequesEmitidos()
    return deCompras(filas, CORTE, { aviso: () => {}, cruce: cruceDe(filas, ch) }).map((m) => m.rubro)
  }
  assert.deepEqual(rubroCon(CORTE - 20), ['Cheques emitidos'], 'fecha de caja ya pasada')
  assert.deepEqual(rubroCon(CAJA_FUTURA), ['Cheques emitidos'], 'y fecha de caja futura')
})

test('la fila PENDIENTE no la alcanza el cambio: sigue viajando como su propia obligación', () => {
  const filas = compras()
  filas[3][IDX.get('estado')] = 'Pendiente'
  filas[3][IDX.get('montoPagado')] = ''
  const ch = chequesEmitidos()
  const cruce = cruceDe(filas, ch)
  assert.equal(cruce.porCompra.size, 0, 'el lado de Compras del cruce sólo toma filas PAGADAS')
  const ms = deCompras(filas, CORTE, { aviso: () => {}, cruce })
  assert.equal(ms.length, 1)
  assert.equal(ms[0].rubro, 'Materiales Civil')
  assert.equal(ms[0].fecha, CAJA_FUTURA)
})

test('un cheque que cubre PARTE de la factura parte la fila y el resto sale por su rubro', () => {
  const filas = compras({ total: 3000000 })
  filas[3][IDX.get('montoPagado')] = 3000000
  const ch = chequesEmitidos({ monto: 2560965 })
  const cruce = cruceDe(filas, ch)
  const ms = deCompras(filas, CORTE, { aviso: () => {}, cruce })
  const porRubro = {}
  for (const m of ms) porRubro[m.rubro] = (porRubro[m.rubro] ?? 0) + m.importe
  assert.equal(porRubro['Cheques emitidos'], 2560965)
  assert.equal(porRubro['Materiales Civil'], 439035)
  assert.equal(ms.reduce((a, m) => a + m.importe, 0), 3000000)
})
