// LA IDENTIDAD QUE FALTABA: LAS CATEGORÍAS TIENEN QUE SUMAR EL TOTAL.
//
// ═══ EL DEFECTO QUE ATRAPA ═══
//
// El bloque de cheques del cash flow publica un total y debajo su descomposición. El total mide
// "la celda de marcas tiene ALGO" (`SUMPRODUCT(--(M<>""))`) y cada categoría mide una marca exacta.
// Cuando el marcado empezó a SALTEAR la fila cuya celda tiene texto ajeno —una nota tipeada, ver
// lib/marcado-columna.mjs— esa fila quedó contada en el total y en ninguna categoría: las cuatro
// dejaban de sumar el total por un cheque de $469.564,70 y la planilla no daba un solo error. El
// renglón `⚠ todavía SIN MARCAR` tampoco lo veía, porque mide la celda VACÍA.
//
// ESTE TEST NO MIRA EL TEXTO DE LAS FÓRMULAS: LAS EVALÚA. Un test de cadena habría pasado igual —
// las fórmulas viejas estaban bien escritas, lo que faltaba era una caja. La única forma de ver un
// agujero en una partición es contar con datos adentro.

import test from 'node:test'
import assert from 'node:assert/strict'
import { INSTRUMENTOS, formulasInstrumento } from './cash-flow-lineas.mjs'
import { MARCAS } from './cheques-cobertura.mjs'
import { FILA_DATO0 } from './cheques-emitidos-geometria.mjs'
import { evaluarFormula } from './evaluar-formula-sheet.mjs'

const CH = INSTRUMENTOS.cheques
const NOTA = 'módulo echeq del banco 06/08 · vence 25/08' // el texto real de M132

/**
 * El registro modelado: una fila por caso real. `marca` es lo que hay en la columna M — incluida la
 * nota ajena que el agente NO pisa y la celda vacía de una fila cargada después de la última corrida.
 */
const REGISTRO = [
  { monto: 16649000, marca: MARCAS.ok, debitado: 'No' },
  { monto: 2000000, marca: MARCAS.ok, debitado: 'Si' },
  { monto: 635020, marca: MARCAS.inferido, debitado: 'No' },
  { monto: 1700000, marca: MARCAS.falta, debitado: 'No' },
  { monto: 900000, marca: MARCAS.sinNumero, debitado: 'No' },
  { monto: 469564.7, marca: NOTA, debitado: 'No' }, // ← el eCheq 372 de DUPEC: el que se caía del cuadro
  // OTRA FILA CON TEXTO AJENO, PERO YA DEBITADA. Está para que un `noReconocida` que copiara el
  // filtro de "no debitados" de `sinMarca` rompa la identidad en vez de pasar inadvertido.
  { monto: 500000, marca: NOTA, debitado: 'Si' },
  { monto: 350000, marca: '', debitado: 'No' }, // ← cargado después de la última corrida
  { monto: 'U$S 300', marca: MARCAS.ok, debitado: 'No' }, // importe no numérico: no suma en ningún lado
]

const hojas = () => {
  const m = {}
  REGISTRO.forEach((r, i) => {
    const f = FILA_DATO0 + i
    m[`${CH.colMonto}${f}`] = r.monto
    m[`${CH.colDebitado}${f}`] = r.debitado
    m[String.fromCharCode(65 + CH.colMarca) + f] = r.marca
  })
  return { [CH.pestaña]: m }
}

const F = formulasInstrumento(CH, MARCAS)
const val = (formula) => evaluarFormula(formula, { hojas: hojas() })
const cajas = ['contemplados', 'inferidos', 'falta', 'sinNumero', 'noReconocida']

test('las CINCO cajas son una partición exacta del total emitido — cantidad y monto', () => {
  for (const campo of ['cantidad', 'monto']) {
    const total = val(F.total[campo])
    const suma = cajas.reduce((s, k) => s + val(F[k][campo]), 0)
    assert.equal(Math.round(suma * 100) / 100, Math.round(total * 100) / 100,
      `las cajas suman ${suma} y el total dice ${total} (${campo})`)
  }
  // Y el total no es trivialmente cero: si el modelo no llegara a la pestaña, todo daría 0 y la
  // identidad se cumpliría sin probar nada.
  assert.equal(val(F.total.cantidad), 8, 'las 8 filas con algo escrito en la columna de marcas')
  assert.ok(val(F.total.monto) > 20000000)
})

test('SIN el renglón de "no reconocidas" las cuatro categorías NO llegan al total: ése era el agujero', () => {
  const cuatro = cajas.slice(0, 4).reduce((s, k) => s + val(F[k].cantidad), 0)
  assert.equal(val(F.total.cantidad) - cuatro, 2, 'faltan exactamente las filas con la nota ajena')
  const $ = val(F.total.monto) - cajas.slice(0, 4).reduce((s, k) => s + val(F[k].monto), 0)
  assert.equal(Math.round($ * 100) / 100, 969564.7, 'y su importe es el que el cuadro no explicaba')
})

test('la fila con texto ajeno cae en "no reconocidas" y NO en "todavía sin marcar"', () => {
  assert.equal(val(F.noReconocida.cantidad), 2, 'la debitada también: el total tampoco la filtra')
  assert.equal(Math.round(val(F.noReconocida.monto) * 100) / 100, 969564.7)
  // El otro renglón mide la celda VACÍA y sólo eso: son dos problemas que se arreglan distinto
  // —vaciar la celda vs. correr el agente— y un solo número no se podría accionar.
  assert.equal(val(F.sinMarca().cantidad), 1, 'sólo la fila cargada después de la última corrida')
  assert.equal(val(F.sinMarca().monto), 350000)
})

test('las cuatro marcas propias siguen contando lo suyo, y el importe no numérico no suma', () => {
  assert.equal(val(F.contemplados.cantidad), 3, 'las 3 filas con ✓, incluida la del importe en dólares')
  assert.equal(val(F.contemplados.monto), 16649000 + 2000000, 'pero su monto no entra: no es un número')
  assert.equal(val(F.inferidos.cantidad), 1)
  assert.equal(val(F.falta.monto), 1700000)
  assert.equal(val(F.sinNumero.monto), 900000)
})

test('el renglón nuevo no hereda los filtros que el total no tiene: el debitado también cuenta', () => {
  // `sinMarca` filtra los debitados a propósito (un cheque pagado sin marca no es un problema). Si
  // `noReconocida` copiara ese filtro, la partición se rompería justo en las filas ya debitadas.
  assert.doesNotMatch(F.noReconocida.cantidad, /UPPER/)
  assert.doesNotMatch(F.noReconocida.monto, /ISNUMBER\(.*\)\s*<>/)
  assert.match(F.sinMarca().cantidad, /UPPER/)
})
