import test from 'node:test'
import assert from 'node:assert/strict'
import { elLayoutCambio, invalidarHuellasDeFormato } from './huella-formato-layout.mjs'

// ═══ EL DEFECTO QUE ESTOS TESTS ATRAPAN (04/09/2026) ═══
//
// «Impuestos y Financieros» pasó de 105 filas a 68 al sacar los tres cuadros que el dueño no usa.
// Todas las huellas de formato quedaron describiendo filas que ya no contienen lo que contenían, la
// guarda las leyó como diseño del dueño y bloqueó los 419 rangos de formato de golpe. La pestaña se
// publicó con los importes crudos —1419600 en vez de $1.419.600— y el bloqueo era PERMANENTE: sin
// re-aplicar tampoco se re-sella, así que la corrida siguiente encontraba lo mismo.

test('la pestaña que se ACORTA declara que cambió de layout', () => {
  const antes = Array.from({ length: 105 }, (_, i) => [`fila ${i + 1}`])
  const ahora = Array.from({ length: 68 }, (_, i) => [`fila ${i + 1}`])
  const r = elLayoutCambio(antes, ahora)
  assert.equal(r.cambio, true)
  assert.match(r.motivo, /105 a 68/)
})

test('un bloque que se corre UNA fila ya cambia el layout: es lo que desalinea el formato', () => {
  const antes = [['Título'], ['A'], ['B'], ['C']]
  const ahora = [['Título'], ['nuevo'], ['A'], ['B']]
  assert.equal(elLayoutCambio(antes, ahora).cambio, true)
  assert.match(elLayoutCambio(antes, ahora).motivo, /fila 2/)
})

test('un cambio de IMPORTES no es un cambio de layout — o se invalidaría en cada corrida', () => {
  // Los importes se mueven en cada corrida y no corren una sola fila. Si contaran, la guarda de
  // formato quedaría desarmada para siempre, que es lo contrario de lo que esto viene a arreglar.
  const antes = [['⇒ Total'], ['IVA'], ['IIBB']].map((f, i) => [...f, 100 + i])
  const ahora = [['⇒ Total'], ['IVA'], ['IIBB']].map((f, i) => [...f, 999 - i])
  assert.equal(elLayoutCambio(antes, ahora).cambio, false)
})

test('el espacio del rótulo no cuenta: un doble espacio no es un rediseño', () => {
  assert.equal(elLayoutCambio([['⇒  Total  ']], [['⇒ Total']]).cambio, false)
})

test('la invalidación DICE cuántas borró: una silenciosa no se distingue de una guarda muerta', async () => {
  const vistos = []
  const query = async (sql, args) => { vistos.push({ sql, args }); return { rowCount: 350 } }
  const n = await invalidarHuellasDeFormato(query, 'FILE', 'Impuestos y Financieros')
  assert.equal(n, 350)
  assert.match(vistos[0].sql, /delete from public\.sheet_huella_formato/)
  // Y borra SÓLO esa pestaña de ese archivo: una invalidación de más desprotege el diseño de otras.
  assert.deepEqual(vistos[0].args, ['FILE', 'Impuestos y Financieros'])
  assert.match(vistos[0].sql, /file_id = \$1 and pestana = \$2/)
})
