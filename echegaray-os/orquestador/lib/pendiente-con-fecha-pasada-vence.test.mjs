// UN PENDIENTE CON FECHA YA PASADA ES UN VENCIDO — Y TRES EXTRACTORES NO LO APLICABAN.
//
// ═══ EL DEFECTO MEDIDO EL 11/09/2026 SOBRE EL ARCHIVO VIVO ═══
//
//   Cash Flow Semanal!BB50   $92.158.013,07     ← «Saldo final» de la última semana
//   Cash Flow Mensual!M50    $91.894.199,16     ← «Saldo final» de diciembre
//                            ──────────────
//                            $   263.813,91
//
// Las 42 líneas de la columna TOTAL de los dos cuadros eran IDÉNTICAS al peso: la diferencia no
// estaba en ninguna línea, estaba en el ANCLA. El movimiento era la cuota 2 del consumo de Pintureria
// Cordoba (`Tarjeta de Credito!f50`, vence el 02/09) emitida COMPROMETIDO con fecha ya pasada. El
// Semanal ancla su arrastre en la semana del corte de caja, y una columna anterior no publica saldo:
// el egreso se perdía para siempre. Es la misma clase que los $9.000.000 del 10/09, con otra fuente.
//
// LA REGLA YA EXISTÍA, escrita una sola vez en `libro-movimientos.mjs · estadoContraCorte`. La
// aplicaban `deCompras` y los dos extractores de impuestos; `deChequesEmitidos`, `deTarjetaSinFactura`
// y `deCartera` estampaban 'COMPROMETIDO' a mano. Estos tests fijan que los tres la apliquen.
import test from 'node:test'
import assert from 'node:assert/strict'
import { deTarjetaSinFactura, deChequesEmitidos, deCartera } from './libro-extractores.mjs'
import { INSTRUMENTOS } from './cash-flow-lineas.mjs'
import { MARCAS } from './cheques-cobertura.mjs'
import { EN_CARTERA } from './cartera-cheques.mjs'
import { COL as COL_RAW, FILA0 as FILA0_RAW } from '../scripts/cheques-raw-pestana.mjs'

const CORTE = 46276      // 11/09/2026, el día de la medición
const PASADA = 46267     // 02/09/2026 — la fecha de la cuota que se perdía
const FUTURA = 46297     // 02/10/2026 — la cuota siguiente del mismo consumo

const iCol = (letra) => letra.split('').reduce((n, c) => n * 26 + (c.charCodeAt(0) - 64), 0) - 1

/** «Tarjeta de Credito» reducida a lo que el extractor mira: monto, fecha de pago, debitado, marca. */
function tarjeta(fechas) {
  const T = INSTRUMENTOS.tarjeta
  const filas = Array.from({ length: T.filaCab }, () => [])
  for (const fp of fechas) {
    const f = []
    f[iCol(T.colMonto)] = 263813.91
    f[iCol(T.colFecha)] = fp
    f[iCol(T.colDebitado)] = ''
    f[T.colMarca] = MARCAS.falta
    f[iCol(T.colComprobante)] = '0042-00056761'
    filas.push(f)
  }
  return filas
}

/** «Cheques Emitidos»: encabezado del registro y un cheque vivo por fecha de pago. */
function cheques(fechas) {
  const enc = []
  enc[0] = 'Tipo'; enc[1] = 'Nro'; enc[4] = 'Proveedor'; enc[5] = 'Monto'
  enc[7] = 'Comprobante'; enc[8] = 'fecha de pago'; enc[10] = 'DEBITADO'
  const filas = [enc]
  for (const [k, fp] of fechas.entries()) {
    const f = []
    f[0] = 'ECHEQ'; f[1] = `00${k}`; f[4] = 'Proveedor'; f[5] = 500000
    f[7] = ''; f[8] = fp; f[10] = 'No'
    filas.push(f)
  }
  return { filas, fila0: 2 }
}

/** `_CHEQUES_RAW`: un valor recibido en custodia por su fecha de acreditación. */
function cartera(fechas) {
  const filas = Array.from({ length: FILA0_RAW - 1 }, () => [])
  for (const fp of fechas) {
    const f = []
    f[iCol(COL_RAW.tipo)] = 'Recibido'
    f[iCol(COL_RAW.estado)] = EN_CARTERA
    f[iCol(COL_RAW.importe)] = 750000
    f[iCol(COL_RAW.fechaPago)] = fp
    f[iCol(COL_RAW.librador)] = 'Alimentos Del Sur SA'
    filas.push(f)
  }
  return filas
}

const estados = (ms) => ms.map((m) => m.estado)

test('TARJETA · la cuota con fecha ya pasada nace VENCIDO, la futura sigue COMPROMETIDO', () => {
  const ms = deTarjetaSinFactura(tarjeta([PASADA, FUTURA]), { corte: CORTE })
  assert.deepEqual(estados(ms), ['VENCIDO', 'COMPROMETIDO'])
  assert.equal(ms[0].importe, 263813.91, 'el caso vivo, al centavo')
  assert.equal(ms[0].fecha, PASADA, 'la fecha NO se mueve: lo que cambia es la ventana que la reclama')
})

test('EL CONTROL PUEDE DAR ROJO: sin `corte` las dos siguen COMPROMETIDO, como antes', () => {
  assert.deepEqual(estados(deTarjetaSinFactura(tarjeta([PASADA, FUTURA]))), ['COMPROMETIDO', 'COMPROMETIDO'])
})

test('CHEQUES EMITIDOS · el cheque vivo con fecha de pago pasada también vence', () => {
  const ch = cheques([PASADA, FUTURA])
  assert.deepEqual(estados(deChequesEmitidos(ch.filas, { fila0: ch.fila0, corte: CORTE })),
    ['VENCIDO', 'COMPROMETIDO'])
})

test('CHEQUES EMITIDOS · el que NO tiene fecha de pago NO vence: sin fecha no se puede vencer', () => {
  const ch = cheques([null])
  const ms = deChequesEmitidos(ch.filas, { fila0: ch.fila0, corte: CORTE })
  assert.equal(ms[0].fecha, 0, 'cae al serial 0 y pesa YA')
  assert.equal(ms[0].estado, 'COMPROMETIDO', 'un compromiso sin fecha no es uno vencido')
})

test('CARTERA · del lado del INGRESO, el mismo agujero y la misma regla', () => {
  const ms = deCartera(cartera([PASADA, FUTURA]), { corte: CORTE })
  assert.deepEqual(estados(ms), ['VENCIDO', 'COMPROMETIDO'])
  assert.equal(ms[0].signo, 1, 'es un ingreso: el vencido no es sólo del lado del egreso')
})

test('nada vence contra el propio corte: el que vence HOY todavía no venció', () => {
  assert.deepEqual(estados(deTarjetaSinFactura(tarjeta([CORTE]), { corte: CORTE })), ['COMPROMETIDO'])
})

test('un REAL no lo toca la regla: la cuota que el resumen ya debitó sigue REAL', () => {
  // `pagos` es el testigo del extracto: un resumen debitado el 03/09 cubre la cuota del 02/09.
  const ms = deTarjetaSinFactura(tarjeta([PASADA]), { corte: CORTE, pagos: [{ fecha: PASADA + 1, importe: 263813.91 }] })
  assert.equal(ms[0].estado, 'REAL', 'ya salió de la cuenta: no hay nada que vencer')
})
