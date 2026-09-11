import test from 'node:test'
import assert from 'node:assert/strict'

import {
  deDepositosRetenidos, masDiasHabiles, DIAS_ACREDITACION, PESTANA_BANCO,
} from './libro-extractores-retenidos.mjs'
import { esRetenida, expresionRetenido } from './banco-detalle-declarado.mjs'
import { RUBRO_CARTERA } from './cash-flow-conectividad.mjs'
import { serialDe, isoDeSerial } from './libro-extractores-fechas.mjs'
import { movimiento, ENTRA } from './libro-movimientos.mjs'

const S = (iso) => serialDe(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)), Number(iso.slice(8, 10)))

// ═══ LAS DOS FILAS REALES DEL 11/09/2026: $38.572.526,23 QUE DESAPARECIERON DEL CIERRE ═══
//
// `_BANCO_RAW` f577 y f578, depositadas el 10/09 (jueves) y retenidas 48 hs: su celda de «Saldo
// después» va VACÍA, que es la marca. Acreditan el lunes 14/09.
const RETENIDA_A = [S('2026-09-10'), 'Deposito e-cheq int ots plazas', 32004685.22, '', 'entra', 'Traslados de fondos propios (no es ingreso)']
const RETENIDA_B = [S('2026-09-10'), 'Deposito e-cheq 48hs presencia bsr', 6567841.01, '', 'entra', 'Traslados de fondos propios (no es ingreso)']
/** La misma fila DESPUÉS de que el banco acreditó: ya trae saldo corrido. */
const ACREDITADA = [S('2026-09-10'), 'Deposito e-cheq 48hs presencia bsr', 6567841.01, 48129050.17, 'entra', 'Traslados de fondos propios (no es ingreso)']
const banco = (...filas) => [['titulo'], ['nota'], ['Fecha', 'Concepto', 'Importe', 'Saldo después', 'Entra o sale', 'Naturaleza'], ...filas]

test('EL DEFECTO DEL 11/09: el depósito retenido entra como ingreso PROYECTADO a su acreditación', () => {
  const r = deDepositosRetenidos(banco(RETENIDA_A, RETENIDA_B))
  assert.equal(r.movimientos.length, 2)
  assert.equal(r.movimientos.reduce((a, m) => a + m.importe, 0), 38572526.23,
    'son los $38,6 M que el cierre proyectado del Mensual perdió a las 12:50')
  for (const m of r.movimientos) {
    assert.equal(m.signo, ENTRA)
    assert.equal(m.estado, 'PROYECTADO', 'un REAL diría que la plata ya está acreditada, y no está')
    assert.equal(m.rubro, RUBRO_CARTERA)
    assert.equal(m.origen.pestana, PESTANA_BANCO)
    assert.equal(m.fecha, S('2026-09-14'), 'jueves + 2 hábiles = lunes, no sábado')
  }
})

test('LA FILA ACREDITADA NO SE EMITE: la caja ya la tiene, y emitirla la contaría dos veces', () => {
  const r = deDepositosRetenidos(banco(ACREDITADA))
  assert.deepEqual(r.movimientos, [],
    'cuando el extracto trae el saldo corrido, el movimiento tiene que apagarse SOLO')
})

test('EL SALDO CERO NO ES UN SALDO VACÍO: una cuenta en cero está acreditada', () => {
  const enCero = [S('2026-09-10'), 'Deposito', 1000, 0, 'entra', 'x']
  assert.equal(deDepositosRetenidos(banco(enCero)).movimientos.length, 0)
  assert.equal(esRetenida({ importe: 1000, saldo: 0 }), false)
  assert.equal(esRetenida({ importe: 1000, saldo: '' }), true)
  assert.equal(esRetenida({ importe: 0, saldo: '' }), false, 'un importe cero no es plata')
})

test('SI COBRANZAS YA LO MARCÓ COBRADO, no se emite el proyectado — se avisa', () => {
  // El eCheq de LA ESTRELLA ya sumó dos veces en este mismo rubro (cash-flow-conectividad): una por
  // Cobranzas y otra por la cartera. Ésta es la guarda que impide que vuelva a pasar.
  const cobrado = movimiento({
    fecha: S('2026-09-08'), signo: ENTRA, importe: 32004685.22, estado: 'REAL', concepto: 'LA ESTRELLA',
    rubro: 'Cobranzas', origen: { pestana: 'Cobranzas', fila: 120 },
  })
  const r = deDepositosRetenidos(banco(RETENIDA_A, RETENIDA_B), { ingresosDelLibro: [cobrado] })
  assert.equal(r.movimientos.length, 1, 'sólo el depósito que ninguna cobranza reclama')
  assert.equal(r.movimientos[0].importe, 6567841.01)
  assert.match(r.avisos.join(' '), /ya está en el libro como REAL por Cobranzas f120/)
})

test('SI EL VALOR SIGUE EN LA CARTERA tampoco se emite: ya viaja COMPROMETIDO', () => {
  const enCartera = movimiento({
    fecha: S('2026-09-12'), signo: ENTRA, importe: 6567841.01, estado: 'COMPROMETIDO', concepto: 'echeq',
    rubro: RUBRO_CARTERA, origen: { pestana: '_CHEQUES_RAW', fila: 44 },
  })
  const r = deDepositosRetenidos(banco(RETENIDA_B), { ingresosDelLibro: [enCartera] })
  assert.deepEqual(r.movimientos, [])
  assert.match(r.avisos.join(' '), /_CHEQUES_RAW f44/)
})

test('un cobro del mismo importe pero lejos en el tiempo NO tapa el depósito', () => {
  const viejo = movimiento({
    fecha: S('2026-06-01'), signo: ENTRA, importe: 6567841.01, estado: 'REAL', concepto: 'otro cobro',
    rubro: 'Cobranzas', origen: { pestana: 'Cobranzas', fila: 90 },
  })
  const r = deDepositosRetenidos(banco(RETENIDA_B), { ingresosDelLibro: [viejo] })
  assert.equal(r.movimientos.length, 1)
})

test('una SALIDA sin saldo corrido no se emite como ingreso: sería invertir el signo', () => {
  const salida = [S('2026-09-10'), 'Transferencia enviada', -5000000, '', 'sale', 'x']
  const r = deDepositosRetenidos(banco(salida))
  assert.deepEqual(r.movimientos, [])
  assert.match(r.avisos.join(' '), /es una SALIDA, no un depósito/)
})

test('cada depósito es un movimiento distinto: la referencia del banco es su identidad', () => {
  const r = deDepositosRetenidos(banco(RETENIDA_A, RETENIDA_B))
  assert.equal(new Set(r.movimientos.map((m) => m.clave)).size, 2)
  assert.ok(r.movimientos.every((m) => m.clave.startsWith('banco:')))
})

test('masDiasHabiles saltea el fin de semana y nunca cae en sábado o domingo', () => {
  assert.equal(isoDeSerial(masDiasHabiles(S('2026-09-10'))), '2026-09-14') // jue → lun
  assert.equal(isoDeSerial(masDiasHabiles(S('2026-09-11'))), '2026-09-15') // vie → mar
  assert.equal(isoDeSerial(masDiasHabiles(S('2026-09-07'))), '2026-09-09') // lun → mié
  assert.equal(DIAS_ACREDITACION, 2)
  for (let d = 0; d < 14; d++) {
    const s = masDiasHabiles(S('2026-09-01') + d)
    assert.ok(((s - 2) % 7) < 5, 'el banco no acredita un domingo')
  }
})

test('LA REGLA DE «RETENIDO» ES UNA SOLA: la fórmula de CAJA y el predicado miran la misma celda', () => {
  // No se puede ejecutar una fórmula de Sheets acá, pero sí afirmar que las dos hablan de la columna
  // del saldo y del criterio «vacío». Si alguien cambia la marca en un lado, este test lo muestra.
  assert.match(expresionRetenido(), /SUMIFS\(_BANCO_RAW!\$C\$4:\$C;_BANCO_RAW!\$D\$4:\$D;""\)/)
  assert.equal(esRetenida({ importe: 1, saldo: '' }), true)
})
