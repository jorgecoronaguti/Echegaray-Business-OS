import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { anchoArrastrado, anchoRecordado, ANCHO_PERSONA_MAX, ANCHO_PERSONA_MIN } from './anchoDePersona.ts'

const GRILLA = readFileSync(new URL('../GrillaEspejoQuincena.tsx', import.meta.url), 'utf8')

test('EL ARRASTRE SUMA Y SE ACOTA ENTRE EL TELÉFONO Y MEDIA PANTALLA', () => {
  assert.equal(anchoArrastrado(250, 80), 330)
  assert.equal(anchoArrastrado(250, -500), ANCHO_PERSONA_MIN)
  assert.equal(anchoArrastrado(250, 5000), ANCHO_PERSONA_MAX)
  assert.equal(anchoArrastrado(250, 0.4), 250)
})

test('EL RECUERDO DEL NAVEGADOR SÓLO VALE SI ES UN ANCHO POSIBLE; SIN STORAGE NO HAY RECUERDO', () => {
  assert.equal(anchoRecordado(() => '320'), 320)
  assert.equal(anchoRecordado(() => 'abc'), null)
  assert.equal(anchoRecordado(() => '20'), null)
  assert.equal(anchoRecordado(() => { throw new Error('sin storage') }), null)
})

test('LA GRILLA APLICA EL ANCHO ELEGIDO A LA VARIABLE QUE GOBIERNA LA COLUMNA, EN LA CABECERA Y EN LA TABLA', () => {
  assert.match(GRILLA, /caja\.style\.setProperty\('--liq-persona', `\$\{w\}px`\)/, 'la medida entra por la misma variable CSS')
  assert.match(GRILLA, /for \(const caja of \[cajaCabecera\.current, cajaTabla\.current\]\)/, 'cabecera y tabla reciben la variable')
  assert.match(GRILLA, /ref=\{cajaCabecera\}/); assert.match(GRILLA, /ref=\{cajaTabla\}/)
  assert.match(GRILLA, /data-testid="ancho-persona"/, 'hay un tirador')
  assert.match(GRILLA, /onDoubleClick: restablecer/, 'doble clic vuelve al ancho por defecto')
  assert.match(GRILLA, /localStorage\.setItem\(CLAVE_ANCHO_PERSONA/, 'se recuerda en el navegador')
  assert.doesNotMatch(GRILLA, /useState<number \| null>\(null\)[\s\S]{0,200}anchoRecordado/, 'no es estado de React: hidrataría distinto')
})
