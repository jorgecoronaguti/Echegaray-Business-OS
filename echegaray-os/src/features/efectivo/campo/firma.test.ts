import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MAX_CARACTERES, esTrazoGuardable, firmaValida, pathDeTrazos, svgDeFirma, type Trazo } from './firma.ts'

// EL DEFECTO QUE ESTO ATRAPA: confirmar la conformidad con el recuadro vacío o con un toque sin
// querer. La base lo rechazaría con «falta la firma» sólo si el texto viene vacío; un toque de un
// punto pasaría como firma. El botón «Confirmar» se enciende con esta misma función.

/** Un garabato: una onda de `n` puntos a lo ancho de `ancho` px. */
function garabato(n = 40, ancho = 200): Trazo {
  return Array.from({ length: n }, (_, i) => ({ x: 20 + (i * ancho) / n, y: 60 + Math.sin(i / 3) * 20 }))
}

test('el recuadro vacío no es firma', () => {
  assert.equal(firmaValida([]), false)
  assert.equal(firmaValida([[]]), false)
  assert.equal(svgDeFirma([], 320, 200), null)
})

test('un toque no es firma', () => {
  assert.equal(firmaValida([[{ x: 10, y: 10 }]]), false)
  // Muchos puntos en el mismo lugar (el dedo apoyado y quieto) tampoco.
  assert.equal(firmaValida([Array.from({ length: 50 }, () => ({ x: 100, y: 100 }))]), false)
})

test('un garabato real sí es firma, y se guarda como SVG autocontenido', () => {
  const t = [garabato(), garabato(10, 60)]
  assert.equal(firmaValida(t), true)
  const svg = svgDeFirma(t, 320.4, 200.6)
  assert.ok(svg)
  assert.match(svg!, /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" viewBox="0 0 320 201">/)
  assert.equal(esTrazoGuardable(svg!), true)
})

test('el path usa enteros y un trazo por M', () => {
  assert.equal(pathDeTrazos([[{ x: 1.4, y: 2.6 }, { x: 3, y: 4 }], [{ x: 9, y: 9 }]]), 'M1 3L3 4M9 9l0 0')
})

test('lo que no es un SVG de firma no se guarda', () => {
  assert.equal(esTrazoGuardable(''), false)
  assert.equal(esTrazoGuardable('hola'), false)
  assert.equal(esTrazoGuardable('<svg viewBox="0 0 1 1"><script>alert(1)</script></svg>'), false)
  assert.equal(esTrazoGuardable('<svg x="1" viewBox="0 0 10 10"><path d="M1 1L2 2"/></svg>'), true)
  assert.equal(esTrazoGuardable(`<svg x="1" viewBox="0 0 10 10"><path d="M1 1${'L2 2'.repeat(MAX_CARACTERES)}"/></svg>`), false)
})
