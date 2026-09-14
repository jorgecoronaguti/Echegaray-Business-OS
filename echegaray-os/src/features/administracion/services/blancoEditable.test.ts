// EL BLANCO SE EDITA EN LA CELDA: HS RECIBO, $/H CAT. Y NETO (dueño, 14/09/2026).
//
// Textual: *«dejame editable las h/recibo tb quiero mover los numeros como desee en liq hs»*. En la quincena
// ABIERTA se escriben las horas del recibo, el $/h de categoría y el neto (banco). Hs negro, importe negro,
// total y efectivo siguen siendo DERIVADOS, y la fila siempre cierra. Precedencia: manual > recibo real >
// estimado. Si se editan horas o $/h pero no el neto, el neto no se recalcula y se avisa.
//
// MUTACIONES QUE LO PONEN ROJO: el manual ignorado; el recibo que gana sobre el manual.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sueldoBlancoNegro, negroDeLaFila, type ReciboDeSueldo } from './sueldoBlancoNegro.ts'
import { aplicarOverrides, sinOverrides, CAMPOS_EDITABLES, COLUMNA_DE } from './liquidacionOverrides.ts'
import { liquidarLinea } from './liquidacionQuincena.ts'
import { cierreDeLaFila } from './cuadroDeJornales.ts'

/** Rosales Q2-08: 50 h × $6.348, bruto $317.400, neto $230.240,12; 94 h cargadas, $/h negro $5.874. */
const RECIBO: ReciboDeSueldo = {
  personaId: 'rosales', cuil: null, periodo: 'Q2-08/2026', categoria: 'OFICIAL', valorHora: 6348,
  horasBlanco: 50, bruto: 317400, neto: 230240.12, driveFileId: null,
}
const base = { horas: 94, valorHoraNegro: 5874, recibo: RECIBO, netoDeNomina: null, pisoCategoria: 6348, proporcion: null }

test('HS RECIBO MANUALES MUEVEN LAS HS NEGRO Y EL IMPORTE NEGRO', () => {
  const s = sueldoBlancoNegro({ ...base, manual: { horasRecibo: 60 } })
  assert.equal(s.horasBlanco, 60, 'MUTACIÓN: el recibo (50 h) gana sobre lo escrito')
  assert.equal(s.horasNegro, 34)
  assert.equal(s.negro, 34 * 5874)
  assert.equal(s.neto, 230240.12, 'el neto del recibo no se recalcula solo')
  assert.equal(s.netoNoRecalculado, true)
  assert.deepEqual(s.editado, { horasRecibo: true, valorHoraRecibo: false, neto: false })
})

test('$/H CAT. MANUAL CON NETO REAL: el neto no cambia y queda el aviso', () => {
  const s = sueldoBlancoNegro({ ...base, manual: { valorHoraRecibo: 7000 } })
  assert.equal(s.valorHoraCategoria, 7000)
  assert.equal(s.bruto, 350000, 'el bruto sigue a lo editado: 50 × 7.000')
  assert.equal(s.neto, 230240.12)
  assert.equal(s.netoNoRecalculado, true, 'MUTACIÓN: sin el aviso el neto viejo pasa por recalculado')
  assert.equal(s.negro, 44 * 5874, 'las horas del negro no dependen del $/h de categoría')
})

test('EL NETO MANUAL GANA SOBRE EL RECIBO Y SOBRE EL ESTIMADO, Y NO HAY AVISO', () => {
  const conRecibo = sueldoBlancoNegro({ ...base, manual: { horasRecibo: 60, neto: 250000 } })
  assert.equal(conRecibo.neto, 250000, 'MUTACIÓN: el recibo real gana sobre el manual')
  assert.equal(conRecibo.origenNeto, 'manual')
  assert.equal(conRecibo.netoNoRecalculado, false)
  assert.equal(conRecibo.total, 250000 + 34 * 5874)
  const estimado = sueldoBlancoNegro({ ...base, recibo: null, horas: 62, proporcion: { cociente: 0.769, origen: 'plantel', recibos: 8 }, manual: { neto: 150000 } })
  assert.equal(estimado.neto, 150000)
  assert.equal(estimado.origenNeto, 'manual')
  assert.equal(estimado.proporcion, null, 'un neto escrito no se estima')
})

test('VACIAR VUELVE AL CALCULADO: null en cada campo es «sin corrección»', () => {
  const s = sueldoBlancoNegro({ ...base, manual: { horasRecibo: null, valorHoraRecibo: null, neto: null } })
  const sinManual = sueldoBlancoNegro(base)
  assert.deepEqual(s, sinManual)
  assert.equal(s.netoNoRecalculado, false)
})

const lineaBase = () => liquidarLinea({
  personaId: 'rosales', nombre: 'ROSALES', horas: 94,
  tarifa: { valorHora: 5874, netoMensual: null, desde: '2026-08-16', origen: 't' },
  adelanto: 0, yaTransferido: 0, reciboNeto: 230240.12, giroEnElLote: true,
}, 'obreros')
const blanco = { recibo: RECIBO, netoDeNomina: 230240.12, pisoCategoria: 6348, proporcion: null }

test('LA FILA CIERRA CON LO EDITADO: total = neto + negro, efectivo = total − banco − adelanto − transferido', () => {
  const l = aplicarOverrides(lineaBase(), { horasRecibo: 60, valorHoraRecibo: 7000, porBanco: 250000, yaTransferido: 100000 }, 'obreros', null, blanco)
  assert.equal(l.horasRecibo, 60)
  assert.equal(l.valorHoraRecibo, 7000)
  assert.equal(l.manual.horasRecibo, true)
  assert.equal(l.origen.valorHoraRecibo, 'manual')
  assert.equal(l.porBanco, 250000)
  assert.equal(l.cobra, 250000 + 34 * 5874, 'el total usa el neto escrito')
  assert.equal(l.enEfectivo, l.cobra! - 250000 - 100000)
  assert.equal(cierreDeLaFila(l)?.cierra, true)
  assert.equal(negroDeLaFila(l), 34 * 5874, 'el negro del pie es el de la fila')
  // Vaciar las tres celdas vuelve al cálculo.
  const vacia = aplicarOverrides(lineaBase(), { horasRecibo: null, valorHoraRecibo: null, porBanco: null }, 'obreros', null, blanco)
  assert.equal(vacia.horasRecibo, 50)
  assert.equal(vacia.porBanco, 230240.12)
  assert.equal(vacia.manual.horasRecibo, false)
})

test('LA QUINCENA CERRADA NO RECIBE EDICIONES, Y LAS COLUMNAS SON LAS DE LA MIGRACIÓN', () => {
  assert.equal(sinOverrides(lineaBase()).horasRecibo, null)
  assert.ok(CAMPOS_EDITABLES.includes('horasRecibo') && CAMPOS_EDITABLES.includes('valorHoraRecibo'))
  assert.equal(COLUMNA_DE.horasRecibo, 'horas_recibo_manual')
  assert.equal(COLUMNA_DE.valorHoraRecibo, 'valor_hora_recibo_manual')
})
