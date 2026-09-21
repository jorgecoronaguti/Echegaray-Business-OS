import { test } from 'node:test'
import assert from 'node:assert/strict'
import jsQR from 'jsqr'
import { matrizQR, trazoQR } from './qr.ts'

// El lector es `jsqr`, de otro autor: si el codificador se equivoca en un bit de formato, en el
// intercalado o en la corrección, jsQR devuelve null y esto da rojo.
function leer(matriz: boolean[][], escala = 4, margen = 4): string | null {
  const lado = (matriz.length + margen * 2) * escala
  const px = new Uint8ClampedArray(lado * lado * 4).fill(255)
  matriz.forEach((fila, y) => fila.forEach((oscuro, x) => {
    if (!oscuro) return
    for (let dy = 0; dy < escala; dy++) {
      for (let dx = 0; dx < escala; dx++) {
        const i = (((y + margen) * escala + dy) * lado + (x + margen) * escala + dx) * 4
        px[i] = px[i + 1] = px[i + 2] = 0
      }
    }
  }))
  return jsQR(px, lado, lado)?.data ?? null
}

test('la URL de una etiqueta real se lee de vuelta, igual', () => {
  for (const t of [
    'https://app.ecsas.com.ar/h/HER-0001',
    'https://app.ecsas.com.ar/h/HER-0178',
    'https://app.ecsas.com.ar/h/ROD-0006',
    'https://app.ecsas.com.ar/h/ECS-7741-QX',
  ]) assert.equal(leer(matrizQR(t)), t)
})

test('textos de distinto largo cruzan varias versiones (1 a 7, con bloque de versión) y se leen', () => {
  for (const largo of [1, 10, 17, 30, 60, 90, 120, 150]) {
    const t = 'X'.repeat(largo - 1) + String(largo % 10)
    const m = matrizQR(t)
    assert.equal(leer(m), t, `falló con ${largo} bytes (versión ${(m.length - 17) / 4})`)
  }
})

test('versión mínima: una URL de etiqueta entra en un QR chico (la etiqueta mide 25 mm)', () => {
  const m = matrizQR('https://app.ecsas.com.ar/h/HER-0042')
  assert.ok(m.length <= 33, `${m.length} módulos: demasiado denso para 25 mm`)
})

test('un texto que no entra tira, no devuelve un QR truncado', () => {
  assert.throws(() => matrizQR('x'.repeat(400)))
})

test('el trazo dibuja un cuadrado por módulo oscuro, corrido por el margen', () => {
  const m = [[true, false], [false, true]]
  assert.equal(trazoQR(m, 1), 'M1 1h1v1h-1zM2 2h1v1h-1z')
})
