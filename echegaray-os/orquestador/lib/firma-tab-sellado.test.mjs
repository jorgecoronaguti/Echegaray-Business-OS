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

// ═══ Y EL MISMO DÍA, LA TRAMPA OPUESTA (03/08, tarde) ═══
//
// Los tests de arriba fijaron que la ref PELADA se entrecomilla. Lo que ninguno miraba es que el
// camino principal NO manda la ref pelada: `refDeTab()` en `guarda-escritura.mjs` ya la entrecomilla
// antes de pasarla. Con el arreglo de la mañana puesto, eso producía `'''Cash Flow Mensual'''!A1:BZ`
// y la API respondía "Unable to parse range" — verificado contra el archivo real.
//
// El síntoma era idéntico al de la mañana: `firma-no-verificable` en toda pestaña de nombre
// compuesto, o sea la guarda protegiendo TODO contra TODOS, incluidas las órdenes del dueño. Y el
// sellado, otra vez, sin ocurrir nunca. Un test que sólo prueba una de las dos formas de llamada no
// habría cazado ninguna de las dos versiones del defecto.

test('la ref que YA viene entrecomillada no se entrecomilla de nuevo', async () => {
  const g = clienteQueAnota()
  // Exactamente lo que devuelve refDeTab() para un nombre con espacios.
  await sellarFirma(g, 'ID', 'Cash Flow Mensual', "'Cash Flow Mensual'").catch(() => {})
  assert.equal(g.rangos[0], "'Cash Flow Mensual'!A1:BZ")
})

test('desenvolver no rompe el escape: la comilla del nombre sobrevive al ida y vuelta', async () => {
  const g = clienteQueAnota()
  // refDeTab("Caja d'obra") duplica la comilla interna y envuelve: "'Caja d''obra'".
  await sellarFirma(g, 'ID', "Caja d'obra", "'Caja d''obra'").catch(() => {})
  assert.equal(g.rangos[0], "'Caja d''obra'!A1:BZ")
})

test('firmaGuardia con la ref entrecomillada llega a leer: no cae en noVerificable', async () => {
  const { firmaGuardia } = await import('./firma-tab.mjs')
  const g = clienteQueAnota([['x']])
  const r = await firmaGuardia(g, 'ID', 'Cash Flow Mensual', "'Cash Flow Mensual'", { candar: false })
  assert.equal(g.rangos[0], "'Cash Flow Mensual'!A1:BZ")
  assert.notEqual(r.noVerificable, true, 'la guarda no pudo releer la pestaña: vuelve a estar ciega')
})

test('rangoDePestana es idempotente — es el contrato que faltaba explicitar', async () => {
  const { rangoDePestana } = await import('./firma-tab.mjs')
  const esperado = "'Cash Flow Mensual'!A1:BZ"
  assert.equal(rangoDePestana('Cash Flow Mensual'), esperado)
  assert.equal(rangoDePestana("'Cash Flow Mensual'"), esperado)
  assert.equal(rangoDePestana(rangoDePestana('Cash Flow Mensual').split('!')[0]), esperado)
  // Un nombre sin espacios no necesita comillas pero tampoco se rompe con ellas.
  assert.equal(rangoDePestana('CAJA'), "'CAJA'!A1:BZ")
})
