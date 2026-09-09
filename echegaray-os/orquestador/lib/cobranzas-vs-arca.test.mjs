import test from 'node:test'
import assert from 'node:assert/strict'
import { conciliarCobranzasConArca, informarConciliacion, claveDeComprobante } from './cobranzas-vs-arca.mjs'

const serial = (y, m, d) => Math.floor((Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000)
const cob = ({ cat = 'B', comprobante = '', cliente = 'X', neto = 1000, factura = null, cobro = null }) => {
  const f = []; f[1] = cat; f[4] = comprobante; f[6] = cliente; f[9] = neto; f[10] = neto * 0.21; f[15] = factura; f[16] = cobro; return f
}
const arca = (pv, nro, y, m, d, neto, razon = 'R') => ['' + y + '-' + String(m).padStart(2, '0'), 'Ventas', serial(y, m, d), 'Factura A', '1', 1, String(pv), String(nro), '30', razon, neto, neto * 0.21]
const HOY = '2026-09-09'

test('el número se lee con o sin ceros: «01-00000228» y «1-228» son el mismo comprobante', () => {
  assert.equal(claveDeComprobante('01-00000228'), '1-228')
  assert.equal(claveDeComprobante('00001-00000221'), '1-221')
  assert.equal(claveDeComprobante('FA'), null)
})

test('una B con número que ARCA no tiene se denuncia con su fila', () => {
  const c = conciliarCobranzasConArca([cob({ comprobante: '01-00000048', factura: serial(2026, 1, 6), cliente: 'ARCOR' })], [], { hoy: HOY })
  assert.deepEqual(c.noEstaEnArca.map((x) => [x.fila, x.comprobante]), [[5, '1-48']])
})

test('la fecha de Cobranzas en OTRO mes que la de ARCA se denuncia — el IVA va al mes de ARCA', () => {
  // ARCOR 1-203: Cobranzas «07/04», ARCA 21/01.
  const c = conciliarCobranzasConArca([cob({ comprobante: '1-203', factura: serial(2026, 4, 7) })], [arca(1, 203, 2026, 1, 21, 1000)], { hoy: HOY })
  assert.equal(c.fechaEnOtroMes.length, 1)
  assert.equal(c.fechaEnOtroMes[0].periodoArca, '2026-01')
  // Tres días de diferencia dentro del mismo mes no es una diferencia.
  const ok = conciliarCobranzasConArca([cob({ comprobante: '1-227', factura: serial(2026, 8, 18) })], [arca(1, 227, 2026, 8, 21, 1000)], { hoy: HOY })
  assert.equal(ok.fechaEnOtroMes.length, 0)
})

test('una factura de ARCA sin fila se busca por importe entre las B sin número', () => {
  // ARCA 1-214 $8.375.000 = fila 38 de MESSINA, cobrada y sin número.
  const c = conciliarCobranzasConArca([cob({ neto: 8375000, cliente: 'MESSINA', factura: serial(2026, 7, 2), cobro: serial(2026, 7, 29) })], [arca(1, 214, 2026, 7, 2, 8375000)], { hoy: HOY })
  assert.deepEqual(c.arcaSinFila[0].filasCandidatas, [5])
  assert.deepEqual(c.sinNumeroPeroEmitida, [{ fila: 5, comprobante: '1-214' }])
})

test('una B sin comprobante con fecha de factura vencida se lista con su fecha de cobro', () => {
  const c = conciliarCobranzasConArca([cob({ factura: serial(2026, 8, 18), cobro: serial(2026, 12, 30), cliente: 'Quattropani' })], [], { hoy: HOY })
  assert.equal(c.vencidasSinEmitir.length, 1)
  assert.equal(c.vencidasSinEmitir[0].cobro, '30/12')
  // Una con fecha futura no está vencida: es el plan.
  const p = conciliarCobranzasConArca([cob({ factura: serial(2026, 10, 9) })], [], { hoy: HOY })
  assert.equal(p.vencidasSinEmitir.length, 0)
})

test('las N no se concilian, y sin diferencias el informe es vacío', () => {
  const c = conciliarCobranzasConArca([cob({ cat: 'N', factura: serial(2026, 8, 1) })], [], { hoy: HOY })
  assert.deepEqual(informarConciliacion(c), [])
})
