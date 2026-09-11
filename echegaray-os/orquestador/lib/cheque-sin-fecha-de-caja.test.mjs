import test from 'node:test'
import assert from 'node:assert/strict'
import { comprasPagadasConCheque, deCompras, deChequesEmitidos } from './libro-extractores.mjs'
import { cruzar, chequesDelRegistro } from './cruce-cheque-factura.mjs'
import { NOMBRES_COMPRAS } from './libro-extractores-compras.mjs'

// EL DEFECTO QUE ATRAPA (auditoría de consistencia del 10/09/2026: $425.936 del cheque f136).
//
// Una fila de Compras sin «Fecha de caja» NO emite ningún movimiento —`deCompras` la saltea— pero el
// cruce la tomaba igual como cobertura de un cheque vivo, y `deChequesEmitidos` saca de su propia
// puerta a todo cheque cruzado. Resultado: el cheque salía del libro por una puerta que del otro
// lado no existe, y esa plata no llegaba a ninguna celda de ningún Cash Flow.

/** El encabezado REAL de Compras: los rótulos que el extractor exige (ver NOMBRES_COMPRAS). */
const CAB = Object.entries(NOMBRES_COMPRAS).map(([clave, rotulo]) => ({ clave, rotulo }))
const IDX = new Map(CAB.map((x, i) => [x.clave, i]))

/** Compras con su encabezado real en la fila 3 (1 título, 2 agrupador). */
function compras({ fechaCaja }) {
  const enc = CAB.map((x) => x.rotulo)
  const f = new Array(CAB.length).fill('')
  f[IDX.get('proveedor')] = 'ALUMETAL'
  f[IDX.get('cuit')] = '30712345678'
  f[IDX.get('comprobante')] = '0001-00000912'
  f[IDX.get('importe')] = 425936
  f[IDX.get('estado')] = 'Pagado'
  f[IDX.get('tipoPago')] = 'Echeq'
  f[IDX.get('rubro')] = 'Materiales Civil'
  if (fechaCaja !== null) f[IDX.get('fechaCaja')] = fechaCaja
  return [[], [], enc, f]
}

/**
 * «Cheques Emitidos» con su encabezado de registro y un echeq vivo por el mismo importe.
 *
 * Las posiciones son las que leen los DOS lados y no se pueden mover: `chequesDelRegistro` toma el
 * proveedor de la 4 y el comprobante de la 7 POR ÍNDICE, y `deChequesEmitidos` resuelve las suyas por
 * rótulo. El encabezado de acá tiene que satisfacer a los dos a la vez, como el archivo real.
 */
function chequesEmitidos() {
  const enc = []
  enc[0] = 'Tipo'; enc[1] = 'Nro'; enc[4] = 'Proveedor'; enc[5] = 'Monto'
  enc[7] = 'Comprobante'; enc[8] = 'fecha de pago'; enc[10] = 'DEBITADO'
  const f = []
  f[0] = 'ECHEQ'; f[1] = '000136'; f[4] = 'ALUMETAL'; f[5] = 425936
  f[7] = '0001-00000912'; f[8] = 46290; f[10] = ''
  return { filas: [enc, f], fila0: 2 }
}

const cruceDe = (filasCompras) => {
  const ch = chequesEmitidos()
  return cruzar(chequesDelRegistro(ch.filas, { fila0: ch.fila0 }), comprasPagadasConCheque(filasCompras))
}

test('sin fecha de caja, la fila de Compras NO emite nada — es la premisa del defecto', () => {
  assert.equal(deCompras(compras({ fechaCaja: null }), null, { aviso: () => {} }).length, 0)
})

test('y por eso NO puede cubrir a un cheque: el cheque sale por su propia puerta', () => {
  const filas = compras({ fechaCaja: null })
  const ch = chequesEmitidos()
  const ms = deChequesEmitidos(ch.filas, { fila0: ch.fila0, cruce: cruceDe(filas) })
  assert.equal(ms.length, 1, 'el cheque vivo llega al libro')
  assert.equal(ms[0].importe, 425936)
  assert.equal(ms[0].rubro, 'Cheques emitidos')
})

test('con fecha de caja SÍ lo cubre, y el cheque no se cuenta dos veces', () => {
  const filas = compras({ fechaCaja: 46290 })
  const ch = chequesEmitidos()
  const cruce = cruceDe(filas)
  const delCheque = deChequesEmitidos(ch.filas, { fila0: ch.fila0, cruce })
  assert.equal(delCheque.length, 0, 'su plata viaja con la factura: emitirlo acá la contaría dos veces')
  const deLaCompra = deCompras(filas, null, { aviso: () => {}, cruce })
  assert.equal(deLaCompra.reduce((a, m) => a + m.importe, 0), 425936, 'y la lleva entera la otra puerta')
})

test('cuando el cheque sale por Compras, se dice POR CUÁL FILA — un hueco y una puerta se ven igual', () => {
  const filas = compras({ fechaCaja: 46290 })
  const dichos = []
  const ch = chequesEmitidos()
  deChequesEmitidos(ch.filas, { fila0: ch.fila0, cruce: cruceDe(filas), aviso: (x) => dichos.push(x) })
  assert.equal(dichos.length, 1)
  assert.equal(dichos[0].importe, 425936)
  assert.deepEqual(dichos[0].comprasQueLoCubren, [4], 'la fila de Compras que se lo llevó')
})
