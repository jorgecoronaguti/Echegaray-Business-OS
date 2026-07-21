import { test } from 'node:test'
import assert from 'node:assert/strict'
import { importe, total, comparar, formatEspejo } from './espejo-jornales.mjs'

test('lee importes escritos a la argentina', () => {
  // El espejo copia el valor FORMATEADO. Sin esto la comparación mide texto contra texto y un
  // espejo desfasado pasa por bueno.
  assert.equal(importe('$ 1.231.963'), 1231963)
  assert.equal(importe('$1.231.963,50'), 1231963.5)
  assert.equal(importe('623.500'), 623500)
  assert.equal(importe(623500), 623500)
})

test('lo que no es un número vale cero, no NaN', () => {
  // Un NaN suelto envenena la suma entera y el control diría "no coincide" siempre, que es tan
  // inútil como no controlar.
  for (const v of ['', null, undefined, 'Total', '#REF!']) assert.equal(importe(v), 0, `falló con ${JSON.stringify(v)}`)
})

test('comparar detecta el desfasaje real del 21/07', () => {
  // El caso que originó todo esto: la quincena en curso con valores viejos en el espejo.
  const origen = [[...Array(26).fill(''), 623500]]
  const espejo = [[...Array(26).fill(''), 529563]]
  const r = comparar(origen, espejo, 26)
  assert.equal(r.ok, false)
  assert.equal(r.diferencia, 93937)
})

test('comparar acepta el espejo cuando coincide', () => {
  const f = [['x', 100], ['y', 250]]
  const r = comparar(f, f, 1)
  assert.equal(r.ok, true)
  assert.equal(r.diferencia, 0)
})

test('total suma sólo la columna de plata', () => {
  assert.equal(total([['999', 100], ['888', 250]], 1), 350)
})

test('el aviso de desfasaje aparece en el texto', () => {
  const txt = formatEspejo({
    hojas: [{ tab: '_J_OBREROS', filas: 463, verificacion: { ok: false, origen: 118499053, espejo: 117267090, diferencia: 1231963 }, aviso: 'x' }],
    desfasado: true,
  })
  assert.match(txt, /NO coincide/)
})
