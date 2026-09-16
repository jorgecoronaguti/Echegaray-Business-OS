// LA MARCA «PAGADA» (dueño, 16/09/2026): un clic, la fila cambia de color y el saldo queda en 0.
//
// Lo puro se prueba ejecutando; lo que es cableado del árbol (que la fila use el color, que la celda fija lo
// repita opaca, que el botón llame a la acción del servidor y que no haya un hex suelto) se prueba leyendo la fuente,
// como hace `cobraTotal.test.ts`. Cada afirmación tiene su mutación: sacar el fondo de la celda fija, o pintar la
// fila sin la marca, pone rojo.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { diaDelSello, filaPagada } from './marcaDePago.ts'

const AQUI = new URL('.', import.meta.url)
const GRILLA = readFileSync(new URL('../GrillaEspejoQuincena.tsx', AQUI), 'utf8')
const MARCA = readFileSync(new URL('./MarcaDePago.tsx', AQUI), 'utf8')

test('LA FILA PAGADA ES LA QUE TIENE SELLO VÁLIDO', () => {
  assert.equal(filaPagada('2026-09-16T12:00:00Z'), true)
  assert.equal(filaPagada(null), false)
  assert.equal(filaPagada(undefined), false)
  assert.equal(filaPagada(''), false)
  assert.equal(filaPagada('ayer'), false)
})

test('EL SELLO DICE EL DÍA, dd/mm, Y NO SE ROMPE CON BASURA', () => {
  const d = new Date('2026-09-16T12:00:00Z')
  assert.equal(diaDelSello('2026-09-16T12:00:00Z'), `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`)
  assert.equal(diaDelSello('no es fecha'), '')
})

test('LA GRILLA PINTA LA FILA Y LA CELDA FIJA CON EL MISMO COLOR, Y DIBUJA EL BOTÓN', () => {
  assert.match(GRILLA, /const fondo = filaPagada\(l\.pagadaEn\) \? V\.posSuave : undefined/, 'el color es el token de estado positivo y lo decide filaPagada')
  assert.match(GRILLA, /\.\.\.filaGrid\(columnas, ALTO_LIQ\.filaAlta\), background: fondo/, 'la fila entera lleva el fondo')
  assert.match(GRILLA, /\.\.\.COLUMNA_FIJA, background: fondoDeColumnaFija\(fondo\)/, 'la celda fija repite el fondo OPACO')
  assert.match(GRILLA, /<MarcaDePago personaId=\{fila\.personaId\} grupo=\{fila\.grupo\} quincena=\{quincena\} pagadaEn=\{l\.pagadaEn\} cerrada=\{fila\.cerrada\}/)
  assert.match(GRILLA, /data-pagada=\{fondo \? '1' : undefined\}/, 'la fila se puede medir desde un E2E')
})

test('EL BOTÓN LLAMA A LA ACCIÓN DEL SERVIDOR CON LA VENTANA, EL GRUPO Y LA PERSONA; SIN HEX SUELTO', () => {
  assert.match(MARCA, /marcarLineaPagada\(\{ \.\.\.quincena, grupo, persona_id: personaId, pagada: !pagada \}\)/)
  assert.doesNotMatch(MARCA, /#[0-9A-Fa-f]{3,6}\b/, 'ningún color fuera de los tokens')
  assert.match(MARCA, /disabled=\{pendiente\}/, 'no admite un segundo clic mientras escribe')
  assert.match(MARCA, /if \(cerrada\)/, 'la quincena cerrada no se toca')
  // HOVER, ALTO DE CONTROL Y FOCO VAN POR CLASES (QA, 16/09/2026): un `style` en línea no puede cambiar con el puntero.
  assert.match(MARCA, /hover:bg-surface-quiet/, 'hover claro en reposo')
  assert.match(MARCA, /h-control max-\[767px\]:h-11/, '34 px en escritorio, 44 en el teléfono')
  assert.match(MARCA, /focus-visible:ring-2/, 'foco visible')
  assert.doesNotMatch(MARCA, /style=\{\{[^}]*background/, 'ningún fondo en línea que pise las clases')
})
