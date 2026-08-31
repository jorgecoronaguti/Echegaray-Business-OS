// EL FONDO BLANCO DE UN ESCANEO NO PUEDE TAPAR EL RECIBO, Y EL MARGEN NO PUEDE COMERSE LA FIRMA.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { luminancia, fondoATransparente, cajaDeLaTinta, recortar } from './firma-imagen.mjs'

/** Una imagen chica: papel blanco con un trazo negro de 2×2 en el medio y un gris de antialiasing. */
function papelConTrazo() {
  const ancho = 6; const alto = 6
  const px = new Uint8Array(ancho * alto * 4)
  for (let i = 0; i < ancho * alto; i++) { px[i * 4] = 255; px[(i * 4) + 1] = 255; px[(i * 4) + 2] = 255; px[(i * 4) + 3] = 255 }
  const negro = (x, y) => { const i = ((y * ancho) + x) * 4; px[i] = 0; px[i + 1] = 0; px[i + 2] = 0 }
  const gris = (x, y) => { const i = ((y * ancho) + x) * 4; px[i] = 128; px[i + 1] = 128; px[i + 2] = 128 }
  negro(2, 2); negro(3, 2); negro(2, 3); negro(3, 3); gris(4, 3)
  return { px, ancho, alto }
}

test('EL DEFECTO: un escaneo llega 90% blanco OPACO y estamparlo tapa el papel', () => {
  const { px } = papelConTrazo()
  const opacosAntes = [...px].filter((_, i) => i % 4 === 3 && px[i] === 255).length
  assert.equal(opacosAntes, 36, 'el fixture no representa el problema')
  const limpia = fondoATransparente(px)
  const blancoSigueOpaco = [...Array(36)].some((_, i) => {
    const esBlanco = px[i * 4] === 255 && px[(i * 4) + 1] === 255
    return esBlanco && limpia[(i * 4) + 3] > 8
  })
  assert.equal(blancoSigueOpaco, false, 'el fondo blanco quedó opaco: taparía el recibo')
})

test('el trazo queda SÓLIDO y el borde gris conserva su degradado (no se dentan los bordes)', () => {
  const { px, ancho } = papelConTrazo()
  const limpia = fondoATransparente(px)
  const alfa = (x, y) => limpia[(((y * ancho) + x) * 4) + 3]
  assert.equal(alfa(2, 2), 255, 'el trazo negro tiene que ser opaco')
  const grisAlfa = alfa(4, 3)
  assert.ok(grisAlfa > 8 && grisAlfa < 255, `el antialiasing quedó en ${grisAlfa}: o se perdió o se volvió sólido`)
})

test('la caja de la tinta es la del trazo, no la del papel — el margen se recorta', () => {
  const { px, ancho, alto } = papelConTrazo()
  const caja = cajaDeLaTinta(fondoATransparente(px), ancho, alto)
  assert.deepEqual(caja, { x: 2, y: 2, ancho: 3, alto: 2 })
})

test('una imagen SIN tinta devuelve null — no se recorta a una caja inventada', () => {
  const blanco = new Uint8Array(4 * 4 * 4).fill(255)
  assert.equal(cajaDeLaTinta(fondoATransparente(blanco), 4, 4), null)
})

test('recortar conserva los píxeles y su alfa', () => {
  const { px, ancho, alto } = papelConTrazo()
  const limpia = fondoATransparente(px)
  const caja = cajaDeLaTinta(limpia, ancho, alto)
  const r = recortar(limpia, ancho, caja)
  assert.equal(r.length, caja.ancho * caja.alto * 4)
  assert.equal(r[3], 255, 'la esquina de la caja tenía que ser tinta sólida')
})

test('la luminancia pesa el verde: un verde puro es más claro que un azul puro', () => {
  assert.ok(luminancia(0, 255, 0) > luminancia(0, 0, 255))
  assert.equal(Math.round(luminancia(255, 255, 255)), 255)
  assert.equal(Math.round(luminancia(0, 0, 0)), 0)
})
