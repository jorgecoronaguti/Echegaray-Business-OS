import { test } from 'node:test'
import assert from 'node:assert/strict'
import { conMiles, isoADdmmaaaa, textoAIso } from './entradaTexto.ts'

test('la fecha del diseño se escribe como texto dd/mm/aaaa y viaja en ISO', () => {
  assert.equal(isoADdmmaaaa('2026-09-01'), '01/09/2026')
  assert.equal(isoADdmmaaaa(null), '')
  assert.equal(textoAIso('01/09/2026'), '2026-09-01')
  assert.equal(textoAIso('1/9', 2026), '2026-09-01')
  assert.equal(textoAIso('01/09/26'), '2026-09-01')
  assert.equal(textoAIso('01092026'), '2026-09-01')
  assert.equal(textoAIso('0109', 2027), '2027-09-01')
})

test('una fecha que no existe no se vuelve otra: 31/02 no es 03/03', () => {
  assert.equal(textoAIso('31/02/2026'), null)
  assert.equal(textoAIso('00/09/2026'), null)
  assert.equal(textoAIso('12/13/2026'), null)
  assert.equal(textoAIso('hola'), null)
  assert.equal(textoAIso(''), null)
})

test('B03: el costo de MO se lee como plata mientras se escribe', () => {
  assert.equal(conMiles('1775059'), '1.775.059')
  assert.equal(conMiles('$ 1.775.059'), '1.775.059')
  assert.equal(conMiles('1775059,5'), '1.775.059,5')
  assert.equal(conMiles('0012'), '12')
  assert.equal(conMiles(''), '')
})
