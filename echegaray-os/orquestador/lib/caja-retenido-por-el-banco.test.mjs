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

const DECLARADO = 41561209.16
const RETENIDO = 38572526.23
const DISPONIBLE = 2988682.93 // = DECLARADO − RETENIDO, el saldo que se puede gastar

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

/** El caso vivo del 11/09: la cadena termina en $3.584.941,27 y el declarado pisa la última fila. */
const VIVO = [
  { fecha: 46170, importe: 1000000, saldo: 1000000 },
  { fecha: 46275, importe: 2584941.27, saldo: 3584941.27 },
  { fecha: 46275, importe: 19286263.115, retenido: true },
  { fecha: 46275, importe: 19286263.115, retenido: true },
  // La última fila lleva el DECLARADO: lo pisa `completarCadenaDelDia` cuando la cadena no cierra.
  { fecha: 46275, importe: 0.01, saldo: DECLARADO },
]

const ev = (formula, movs = VIVO) => evaluarFormula(formula, { hoja: replica(movs), hojas: { _BANCO_RAW: replica(movs) } })

test('lo retenido se mide con la celda de saldo VACÍA, y son los $38.572.526,23', () => {
  assert.equal(Math.round(ev(`=${expresionRetenido()}`) * 100) / 100, RETENIDO)
})

test('EL EFECTO: el saldo que CAJA consume es el DECLARADO menos lo retenido', () => {
  assert.equal(Math.round(ev(formulaSaldoDisponibleBanco()) * 100) / 100, DISPONIBLE)
})

test('EL CONTROL PUEDE DAR ROJO: sin la resta, CAJA publica los $41.561.209,16 enteros', () => {
  // La mutación es la fórmula anterior — `formulaUltimoSaldo` pelado, sin restar nada.
  const antes = formulaSaldoDisponibleBanco().split('-' + expresionRetenido())[0]
  assert.equal(Math.round(ev(antes) * 100) / 100, DECLARADO)
  assert.notEqual(Math.round(ev(antes) * 100) / 100, DISPONIBLE,
    'si las dos dieran lo mismo, este test no estaría midiendo nada')
})

test('EL CIERRE VUELVE SOLO cuando el banco acredita: nadie toca una celda', () => {
  // El extracto siguiente trae el depósito con su saldo corrido: `acreditarPendientes` lo copia y la
  // celda deja de estar vacía. No cambia ni una fórmula.
  const acreditado = VIVO.map((m) => (m.retenido ? { ...m, retenido: false, saldo: DECLARADO } : m))
  assert.equal(Math.round(ev(`=${expresionRetenido()}`, acreditado) * 100) / 100, 0)
  assert.equal(Math.round(ev(formulaSaldoDisponibleBanco(), acreditado) * 100) / 100, DECLARADO)
})

test('sin nada retenido el saldo no se mueve: la resta no puede cobrar peaje', () => {
  const limpio = [{ fecha: 46275, importe: 5000, saldo: 5000 }]
  assert.equal(ev(`=${expresionRetenido()}`, limpio), 0)
  assert.equal(ev(formulaSaldoDisponibleBanco(), limpio), 5000)
})

test('el hueco del detalle deja de acusar como faltante lo que era la retención', () => {
  // ANTES el control comparaba el declarado (CON lo retenido) contra el detalle (SIN lo retenido), así
  // que publicaba los $38.572.526,23 enteros como hueco y los rotulaba «el faltante es anterior al
  // 28/5/2026, y no hay extracto para cerrarlo» — una causa falsa para una plata perfectamente
  // identificada dos filas más arriba. Ése es el número que el dueño vio y no pudo explicar.
  const antes = Math.round(ev(`=${expresionRetenido()}+${expresionDiferencia()}`) * 100) / 100
  const ahora = Math.round(ev(`=${expresionDiferencia()}`) * 100) / 100
  // $37.976.267,88 es, al centavo, el número que el archivo vivo publicaba el 11/09 en la nota de
  // `_BANCO_RAW` («la cadena del día difiere $37.976.267,89 y esa diferencia todavía no está
  // explicada»). Esta réplica reproduce el caso real, no un caso de laboratorio.
  assert.equal(antes, 37976267.88, 'el control viejo denunciaba el declarado contra el detalle neto')
  assert.equal(Math.round((antes - ahora) * 100) / 100, RETENIDO,
    'y todo lo que se corrigió es, exactamente, lo retenido')
  // Y AHORA denuncia el hueco de verdad: en esta réplica, la cadena del día reconstruye $3.584.941,28
  // y el declarado neto de la retención es $2.988.682,93. Los $596.258,35 que quedan SIGUEN sin
  // explicar, y tienen que seguir gritando: taparlos con la retención era el defecto.
  assert.equal(ahora, -596258.35)
  assert.ok(Math.abs(ahora) < Math.abs(antes) / 50, 'el hueco declarado tiene que encogerse, no mudarse')
  // El detalle sigue excluyendo lo retenido, que es lo correcto de su lado.
  assert.equal(Math.round(ev(`=${expresionDetalle()}`) * 100) / 100, 3584941.28)
})

test('la fila del anexo dice el número y la fecha desde cuándo se espera', () => {
  const [rotulo, moneda, importe, , , fecha, origen] = filaRetenidoPorElBanco()
  assert.equal(moneda, 'ARS')
  assert.match(ev(rotulo), /^⏳ Retenido por el banco/)
  assert.equal(Math.round(ev(importe) * 100) / 100, RETENIDO)
  assert.equal(ev(fecha), 46275, 'la fecha del retenido más nuevo')
  assert.match(origen, /SE RESTA/, 'la fila declara que se resta: si no, se lee como informativa')
  assert.match(origen, /Saldo después/, 'y dice cuál es la marca')
})

test('y se APAGA sola cuando no hay nada retenido — un aviso que queda puesto no se lee', () => {
  const limpio = [{ fecha: 46275, importe: 5000, saldo: 5000 }]
  const [rotulo, , importe, , , fecha] = filaRetenidoPorElBanco()
  assert.match(ev(rotulo, limpio), /^✓ El banco no tiene depósitos sin acreditar/)
  assert.equal(ev(importe, limpio), '')
  assert.equal(ev(fecha, limpio), '')
})

test('UNA SOLA DEFINICIÓN: el detalle y CAJA restan la MISMA expresión', () => {
  assert.ok(expresionDetalle().includes(expresionRetenido()),
    'dos copias de la marca darían dos saldos del mismo banco')
  assert.ok(formulaSaldoDisponibleBanco().includes(expresionRetenido()))
  assert.ok(expresionDiferencia().includes(expresionRetenido()))
  assert.equal(COL_SALDO, 'D')
})
