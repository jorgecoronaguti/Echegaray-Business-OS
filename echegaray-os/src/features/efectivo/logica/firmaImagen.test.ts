import test from 'node:test'
import assert from 'node:assert/strict'
import { imagenDeFirma } from './firmaImagen.ts'

test('un SVG de firma se vuelve data URL; cualquier otra cosa, null', () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M1 1L9 9"/></svg>'
  assert.match(imagenDeFirma(svg) ?? '', /^data:image\/svg\+xml;utf8,%3Csvg/)
  assert.equal(imagenDeFirma(null), null)
  assert.equal(imagenDeFirma('hola'), null)
  assert.equal(imagenDeFirma('<svg><script>1</script></svg>'), null)
})
