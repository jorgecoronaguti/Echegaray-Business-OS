import test from 'node:test'
import assert from 'node:assert/strict'
import { deImpuestoAlCheque, debitosDeImpuestoAlCheque, deImpuestosCalendario } from './libro-extractores.mjs'
import { serialDe } from './vencimientos-fiscales.mjs'
import { formulaImpuestoChequeProyectado } from './impuestos-cuadro.mjs'
import { evaluarFormula } from './evaluar-formula-sheet.mjs'
import { ROTULO, MARCA, esImpuestoAlCheque } from './impuesto-cheque.mjs'

// EL DEFECTO QUE ATRAPA (auditoría del 10/09/2026, hallazgo #5: −$7,5M).
//
// «Impuestos y Financieros»!34 proyecta el impuesto de la Ley 25.413 de septiembre a diciembre y ese
// dinero no llegaba a NINGUNA celda de ningún Cash Flow: la línea de líneas que lo tenía murió con el
// cuadro viejo y la matriz por rubro se alimenta del Libro, que no tenía extractor para esa fila.
//
// Los importes son los de la pestaña viva el 10/09 (foto de la auditoría): sep $3.421.649 ·
// oct $2.146.728 · nov $1.044.798 · dic $866.258.

const SEP = 3421649
const OCT = 2146728
const NOV = 1044798
const DIC = 866258
const CORTE = serialDe('2026-09-10')
const ANIO = 2026

/** La pestaña modelada: la fila 34 con sus doce meses. Los meses ya cerrados llevan importes GRANDES
 *  a propósito — son los que el extracto ya cobró y el Libro ya tiene por `_BANCO_RAW`. */
function impuestos({ sep = SEP } = {}) {
  const fila = [ROTULO]
  const cerrados = [1200000, 1100000, 1300000, 1250000, 1400000, 1600000, 1900000, 2100000]
  for (const x of cerrados) fila.push(x)
  fila.push(sep, OCT, NOV, DIC)
  const filas = []
  for (let i = 0; i < 33; i++) filas.push([''])
  filas.push(fila)          // fila 34
  return filas
}

test('el impuesto al cheque proyectado de sep–dic entra al Libro con su celda de origen', () => {
  const ms = deImpuestoAlCheque(impuestos(), { filaCheque: 34 }, ANIO, CORTE)
  assert.equal(ms.length, 4, 'un movimiento por mes abierto')
  assert.equal(ms.reduce((s, m) => s + m.importe, 0), SEP + OCT + NOV + DIC)
  assert.deepEqual(ms.map((m) => m.origen.fila), ['J34', 'K34', 'L34', 'M34'])
  // Rubro «Impuestos», como TODO lo que sale de esta pestaña: es la invariante que fija
  // impuestos-contrato-cashflow.test.mjs y la taxonomía de la propia pestaña («4 · Otros impuestos»).
  assert.ok(ms.every((m) => m.signo === -1 && m.rubro === 'Impuestos' && m.estado === 'PROYECTADO'))
})

test('los meses que el extracto ya cubrió NO entran: si entraran, se contarían dos veces', () => {
  const ms = deImpuestoAlCheque(impuestos(), { filaCheque: 34 }, ANIO, CORTE)
  const meses = ms.map((m) => m.concepto.slice(-7))
  assert.deepEqual(meses, ['09/2026', '10/2026', '11/2026', '12/2026'])
  // enero..agosto suman $11.850.000 en la fila y ninguno llega al Libro por esta puerta
  assert.equal(ms.filter((m) => /0[1-8]\/2026/.test(m.concepto)).length, 0)
})

test('el mes en curso entra NETO de lo que el banco ya debitó', () => {
  const yaDebitado = { 9: 1000000 }
  const ms = deImpuestoAlCheque(impuestos(), { filaCheque: 34 }, ANIO, CORTE, { yaDebitado })
  const sep = ms.find((m) => m.concepto.endsWith('09/2026'))
  assert.equal(sep.importe, SEP - 1000000)
  // Y si el banco ya cobró todo el mes, no queda nada que proyectar.
  const cubierto = deImpuestoAlCheque(impuestos(), { filaCheque: 34 }, ANIO, CORTE, { yaDebitado: { 9: SEP } })
  assert.equal(cubierto.filter((m) => m.concepto.endsWith('09/2026')).length, 0)
})

test('lo ya debitado se mide con la palabra del BANCO, no con el rótulo lindo de la pestaña', () => {
  // El extracto escribe «Impuesto Ley 25.413 Debito 0,6%»; la pestaña, «Impuesto al cheque (Ley 25.413)».
  assert.ok(esImpuestoAlCheque('Impuesto Ley 25.413 Debito 0,6%'), 'la marca es el número de la ley')
  assert.ok(esImpuestoAlCheque(ROTULO))
  assert.ok(!esImpuestoAlCheque('Comision mantenimiento de cuenta'))
  const cargos = [
    { concepto: 'Impuesto Ley 25.413 Debito 0,6%', fecha: serialDe('2026-09-03'), importe: 120000 },
    { concepto: 'Impuesto Ley 25.413 Credito 0,6%', fecha: serialDe('2026-09-04'), importe: 80000 },
    { concepto: 'Comision de clearing', fecha: serialDe('2026-09-05'), importe: 50000 },
    { concepto: 'Impuesto Ley 25.413 Debito 0,6%', fecha: serialDe('2026-08-03'), importe: 999999 },
  ]
  assert.deepEqual(debitosDeImpuestoAlCheque(cargos, ANIO), { 8: 999999, 9: 200000 })
})

test('sin la fila ubicada por rótulo, el extractor ROMPE — no devuelve $0 en silencio', () => {
  assert.throws(() => deImpuestoAlCheque(impuestos(), {}, ANIO, CORTE), new RegExp(ROTULO.replace(/[()."]/g, '.')))
  assert.throws(() => deImpuestosCalendario(impuestos(), { filaIva: 12, filaIibb: 22 }, ANIO, CORTE), /rótulo/)
})

test('la proyección de la pestaña NO se cobra impuesto a sí misma', () => {
  const f = formulaImpuestoChequeProyectado(ANIO, 10)
  assert.ok(f.includes(MARCA), 'la fórmula excluye del base lo que ya es impuesto al cheque')
  // El movimiento del Libro para octubre: un pago de $1.000.000 y el propio impuesto de $2.146.728.
  const _MOVIMIENTOS = {
    A2: serialDe('2026-10-05'), C2: 1000000, E2: 'Pago a proveedor',
    A3: serialDe('2026-10-31'), C3: OCT, E3: `${ROTULO} · 10/2026`,
    A4: serialDe('2026-10-20'), C4: 300000, E4: 'Impuesto Ley 25.413 Debito 0,6%',
  }
  const base = evaluarFormula(f, { hojas: { _MOVIMIENTOS }, hoy: new Date(Date.UTC(2026, 8, 10)) })
  assert.equal(Math.round(base), Math.round(1000000 * 0.006 * 2), 'sólo el movimiento comercial paga')
})
