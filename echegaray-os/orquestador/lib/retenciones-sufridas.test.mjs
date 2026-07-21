import { test } from 'node:test'
import assert from 'node:assert/strict'
import { verificarAlicuota, clasificar, creditoDelMes, mes, COMPUTA } from './retenciones-sufridas.mjs'

// La fila 5 real de Cobranzas: ARCOR, cobrado el 3/2/2026.
const ARCOR = {
  fila: 5, cliente: 'ARCOR', mes: '2026-02', neto: 9520000, iva: 1999200,
  retenciones: { iva: 1599360, ganancias: 190400, iibb: 238000 },
}

test('reconoce las tres retenciones reales de ARCOR', () => {
  assert.equal(verificarAlicuota('iva', 1599360, 9520000, 1999200).ok, true, '80% del IVA')
  assert.equal(verificarAlicuota('ganancias', 190400, 9520000, 1999200).ok, true, '2% del neto')
  assert.equal(verificarAlicuota('iibb', 238000, 9520000, 1999200).ok, true, '2,5% del neto')
})

test('acepta la segunda alícuota de IIBB (3,5%)', () => {
  // Fila 8 real: mismo cliente, mismo régimen, otra alícuota.
  assert.equal(verificarAlicuota('iibb', 83300, 2380000, 499800).ok, true)
})

test('una alícuota que NO encaja no se imputa: se aparta', () => {
  // Meter una retención en el impuesto equivocado inventa un crédito fiscal que no existe.
  const raro = { ...ARCOR, retenciones: { iva: 500000, ganancias: 0, iibb: 0 } }
  const r = clasificar([raro])
  assert.equal(r.sospechosas.length, 1)
  assert.equal(r.porRegimen.iva ?? 0, 0, 'no entró al crédito computable')
  assert.ok(r.sospechosas[0].alicuota > 0, 'informa qué alícuota dio, para poder decidir')
})

test('agrupa por impuesto y por mes', () => {
  const r = clasificar([ARCOR])
  assert.equal(r.porRegimen.iva, 1599360)
  assert.equal(creditoDelMes(r, 'iva', '2026-02'), 1599360)
  assert.equal(creditoDelMes(r, 'iva', '2026-03'), 0, 'no se filtra a otro mes')
})

test('IIBB se clasifica pero NO se computa como crédito', () => {
  // Las retenciones de Ingresos Brutos ya vienen declaradas en la DDJJ de Rentas que la pestaña
  // lee. Sumarlas otra vez sería contar dos veces lo mismo.
  assert.ok(!COMPUTA.includes('iibb'))
  assert.deepEqual(COMPUTA, ['iva', 'ganancias'])
})

test('el total incluye todo lo retenido, computable o no', () => {
  // Es plata que salió de la empresa: tiene que verse aunque no se compute como crédito.
  assert.equal(clasificar([ARCOR]).total, 1599360 + 190400 + 238000)
})

test('sin base no se inventa una alícuota', () => {
  assert.equal(verificarAlicuota('iva', 1000, 0, 0).ok, false)
  assert.equal(verificarAlicuota('iva', 0, 100, 21).ok, false)
  assert.equal(verificarAlicuota('inexistente', 1, 1, 1).ok, false)
})

test('mes lee el formato es-AR del Sheet', () => {
  assert.equal(mes('3/2/2026'), '2026-02', 'el 3/2 es febrero, no marzo')
  assert.equal(mes(new Date('2026-02-03T00:00:00Z')), '2026-02')
  assert.equal(mes(''), '')
})
