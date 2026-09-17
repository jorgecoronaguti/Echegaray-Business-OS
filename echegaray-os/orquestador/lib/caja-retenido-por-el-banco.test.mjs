// UN eCHEQ RETENIDO 48 HS NO ES CAJA DISPONIBLE.
//
// ═══ EL DEFECTO MEDIDO EL 11/09/2026 SOBRE EL ARCHIVO VIVO ═══
//
// `CAJA!A3` publicaba **$79.521.755,29** de «CAJA DISPONIBLE» con **$38.572.526,23** adentro que el
// propio `_BANCO_RAW` declaraba «pendientes de acreditación»: dos depósitos de eCheq del 10/09. Y como
// el cierre de los dos Cash Flow se ANCLA en la caja de hoy, ese ancla llevó el cierre del 31/12 de
// $61.330.212 a $91.894.199 entre dos corridas sin que entrara un peso nuevo. El dueño: *«qué mierda
// pasa que va y viene ese número»*.
//
// Regla de oro: el Cash Flow es PERCIBIDO. Un eCheq retenido no paga un cheque mañana.
//
// Estos tests EVALÚAN las fórmulas contra una réplica de `_BANCO_RAW` con los números reales de ese
// día — no leen su texto. El evaluador es el del repo (`evaluar-formula-sheet.mjs`).
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  expresionRetenido, formulaSaldoDisponibleBanco, expresionDetalle, expresionDiferencia,
  filaRetenidoPorElBanco, COL_SALDO,
} from './banco-detalle-declarado.mjs'
import { evaluarFormula } from './evaluar-formula-sheet.mjs'
import { DEP } from './caja-posterior-al-corte.mjs'

// ═══ Y LA CORRECCIÓN DEL 17/09/2026 ═══
//
// La premisa del 11/09 —«el último saldo INCLUYE lo retenido»— era falsa: la cadena de `_BANCO_RAW`
// nunca lo incluye (el importador y `completarCadenaDelDia` lo saltean). CAJA restaba lo retenido DOS
// veces. Medido en el archivo vivo el 17/09: cadena $42.813.734,00, retenido (6526) $2.896.036,13,
// CAJA $39.917.698. El banco declaraba $33.387.734,00 — con el 8767 ($9.426.000, canje 24 hs) todavía
// sin acreditar. Estos números son los de ese día.
const BANCO_DECLARA = 33387734
const RETENIDO = 12322036.13 // 2.896.036,13 + 9.426.000: 6526 (48 hs) + 8767 (canje 24 hs, marcado por el pie)

/**
 * `_BANCO_RAW` como está viva, reducida a lo que estas fórmulas miran: A fecha · C importe · D saldo.
 * `retenido:true` = la celda de saldo VACÍA, que es la marca que escribe `banco-raw-pestana.mjs`.
 */
function replica(movs) {
  const hoja = {}
  movs.forEach((m, i) => {
    const f = DEP.desde + i
    hoja[`A${f}`] = m.fecha
    hoja[`C${f}`] = m.importe
    hoja[`D${f}`] = m.retenido ? '' : m.saldo
  })
  return hoja
}

/** El 17/09 ya con el 8767 marcado: la cadena NO los incluye y termina en lo que declara el banco. */
const VIVO = [
  { fecha: 46280, importe: 85342.81, saldo: 33578306.19 },
  { fecha: 46280, importe: 9426000, retenido: true }, // 8767
  { fecha: 46280, importe: -16966.54, saldo: 33561339.65 },
  { fecha: 46280, importe: -57068.06, saldo: 33504271.59 },
  { fecha: 46281, importe: 2896036.13, retenido: true }, // 6526
  { fecha: 46281, importe: -116537.59, saldo: BANCO_DECLARA },
]

const ev = (formula, movs = VIVO) => evaluarFormula(formula, { hoja: replica(movs), hojas: { _BANCO_RAW: replica(movs) } })

test('lo retenido se mide con la celda de saldo VACÍA: los dos eCheq del 16 y 17/09', () => {
  assert.equal(Math.round(ev(`=${expresionRetenido()}`) * 100) / 100, RETENIDO)
})

test('EL EFECTO: CAJA publica el último saldo de la cadena, que es lo que declara el banco', () => {
  assert.equal(Math.round(ev(formulaSaldoDisponibleBanco()) * 100) / 100, BANCO_DECLARA)
})

test('EL CONTROL PUEDE DAR ROJO: la fórmula del 11/09 volvía a restar lo retenido', () => {
  // La mutación es exactamente la fórmula vieja que estaba viva en CAJA!B9.
  const vieja = `${formulaSaldoDisponibleBanco()}-${expresionRetenido()}`
  const dio = Math.round(ev(vieja) * 100) / 100
  assert.equal(dio, Math.round((BANCO_DECLARA - RETENIDO) * 100) / 100)
  assert.notEqual(dio, BANCO_DECLARA, 'si las dos dieran lo mismo, este test no estaría midiendo nada')
  assert.ok(!formulaSaldoDisponibleBanco().includes('SUMIFS'), 'la fórmula de CAJA no resta nada')
})

test('EL CIERRE VUELVE SOLO cuando el banco acredita: nadie toca una celda', () => {
  // El extracto siguiente trae el depósito con su saldo corrido y la última fila ya lo incluye.
  const acreditado = [
    ...VIVO.map((m) => (m.retenido ? { ...m, retenido: false, saldo: 1 } : m)).slice(0, -1),
    { fecha: 46282, importe: 0, saldo: 45709770.13 },
  ]
  assert.equal(Math.round(ev(`=${expresionRetenido()}`, acreditado) * 100) / 100, 0)
  assert.equal(Math.round(ev(formulaSaldoDisponibleBanco(), acreditado) * 100) / 100, 45709770.13)
})

test('sin nada retenido el saldo no se mueve', () => {
  const limpio = [{ fecha: 46275, importe: 5000, saldo: 5000 }]
  assert.equal(ev(`=${expresionRetenido()}`, limpio), 0)
  assert.equal(ev(formulaSaldoDisponibleBanco(), limpio), 5000)
})

test('el hueco del detalle cierra en cero cuando la cadena es coherente', () => {
  // inicial = 33.578.306,19 − 85.342,81; Σ C incluye lo retenido y el detalle lo resta: da el declarado.
  assert.equal(Math.round(ev(`=${expresionDiferencia()}`) * 100) / 100, 0)
  assert.equal(Math.round(ev(`=${expresionDetalle()}`) * 100) / 100, BANCO_DECLARA)
})

test('la fila del anexo dice el número y la fecha desde cuándo se espera', () => {
  const [rotulo, moneda, importe, , , fecha, origen] = filaRetenidoPorElBanco()
  assert.equal(moneda, 'ARS')
  assert.match(ev(rotulo), /^⏳ Retenido por el banco/)
  assert.equal(Math.round(ev(importe) * 100) / 100, RETENIDO)
  assert.equal(ev(fecha), 46281, 'la fecha del retenido más nuevo')
  assert.match(origen, /YA ESTÁ FUERA/, 'la fila declara que ya está fuera del saldo: restarlo de nuevo fue el defecto del 17/09')
  assert.match(origen, /Saldo después/, 'y dice cuál es la marca')
})

test('y se APAGA sola cuando no hay nada retenido — un aviso que queda puesto no se lee', () => {
  const limpio = [{ fecha: 46275, importe: 5000, saldo: 5000 }]
  const [rotulo, , importe, , , fecha] = filaRetenidoPorElBanco()
  assert.match(ev(rotulo, limpio), /^✓ El banco no tiene depósitos sin acreditar/)
  assert.equal(ev(importe, limpio), '')
  assert.equal(ev(fecha, limpio), '')
})

test('UNA SOLA DEFINICIÓN: el detalle resta la marca y CAJA no la vuelve a restar', () => {
  assert.ok(expresionDetalle().includes(expresionRetenido()),
    'dos copias de la marca darían dos saldos del mismo banco')
  assert.ok(!formulaSaldoDisponibleBanco().includes(expresionRetenido()))
  assert.ok(expresionDiferencia().includes(expresionRetenido()))
  assert.equal(COL_SALDO, 'D')
})
