import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { anchoArrastrado, anchoRecordado, ANCHO_PERSONA_MAX, ANCHO_PERSONA_MIN } from './anchoDePersona.ts'

// DESDE EL 17/09/2026 el arrastre vive en `useAnchoDePersona.ts` y lo comparten los dos cuadros (jornaleros y mensuales).
const HOOK = readFileSync(new URL('./useAnchoDePersona.ts', import.meta.url), 'utf8')
const TABLA = readFileSync(new URL('./TablaDeBloques.tsx', import.meta.url), 'utf8')
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

test('LA GRILLA APLICA EL ANCHO ELEGIDO A LA VARIABLE QUE GOBIERNA LA COLUMNA, EN LA CABECERA Y EN LA TABLA DE LOS DOS CUADROS', () => {
  assert.match(HOOK, /caja\.style\.setProperty\('--liq-persona', `\$\{w\}px`\)/, 'la medida entra por la misma variable CSS')
  assert.match(HOOK, /for \(const caja of cajas\.current\)/, 'todas las cajas registradas reciben la variable')
  assert.equal((TABLA.match(/ref=\{registrar\}/g) ?? []).length, 2, 'cabecera y tabla se registran')
  assert.equal((GRILLA.match(/useAnchoDePersona\(\)/g) ?? []).length, 1, 'UN solo ancho para los dos cuadros')
  assert.match(TABLA, /data-testid="ancho-persona"/, 'hay un tirador')
  assert.match(HOOK, /onDoubleClick: \(\) => \{ aplicar\(null\)/, 'doble clic vuelve al ancho por defecto')
  assert.match(HOOK, /localStorage\.setItem\(CLAVE_ANCHO_PERSONA/, 'se recuerda en el navegador')
  assert.doesNotMatch(HOOK, /useState/, 'no es estado de React: hidrataría distinto')
})
