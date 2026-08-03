// EL SELLADO QUE NUNCA SELLABA.
//
// `sellarFirma` armaba el rango como `${pestana}!A1:BZ`, sin comillas. Casi todas las pestañas de
// este Sheet tienen espacios en el nombre —"Cash Flow Mensual", "Jornales por Quincena",
// "Impuestos y Financieros"—, así que la API rechazaba el rango, un `.catch` lo convertía en `null`
// y la función devolvía sin hacer nada. Sin ruido, sin log, sin error.
//
// El síntoma no parecía tener que ver: pestañas que se auto-candaban una y otra vez. El OS escribía,
// no lograba registrar su propia escritura, y en la corrida siguiente leía esa escritura como una
// edición del dueño y se candaba encima. Se midió el 03/08: de 8 candados vigentes, 7 eran así.
//
// Por eso el test mira DOS cosas, y la segunda es la que importa: que el rango vaya entre comillas,
// y que cuando no se puede releer la función lo DIGA en vez de fingir éxito.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sellarFirma } from './firma-tab.mjs'

/** Cliente falso que anota el rango con el que lo llamaron. */
function clienteQueAnota(devuelve = [['a']]) {
  const rangos = []
  return {
    rangos,
    async readSheetValues(_id, rango) { rangos.push(rango); return devuelve },
  }
}

test('una pestaña con espacios va entre comillas, o la API rechaza el rango', async () => {
  const g = clienteQueAnota()
  await sellarFirma(g, 'ID', 'Cash Flow Mensual').catch(() => {})
  assert.equal(g.rangos[0], "'Cash Flow Mensual'!A1:BZ")
})

test('una comilla en el nombre se escapa duplicándola', async () => {
  const g = clienteQueAnota()
  await sellarFirma(g, 'ID', "Caja d'obra").catch(() => {})
  assert.equal(g.rangos[0], "'Caja d''obra'!A1:BZ")
})

test('si no se puede releer, lo dice — no finge que selló', async () => {
  const g = { async readSheetValues() { throw new Error('403') } }
  const r = await sellarFirma(g, 'ID', 'CAJA')
  assert.equal(r.sellada, false)
  assert.match(r.motivo, /no pude releer/)
})
