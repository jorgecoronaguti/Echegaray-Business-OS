// NINGUNA CELDA EDITABLE DE LIQUIDACIÓN TIENE FLECHAS (dueño, 15/09/2026: «me aparecen unas flechas para arriba y
// abajo q no son utiles»).
//
// Las flechas son el spinner de `<input type="number">`. Las celdas pasan a `type="text"` + `inputMode="decimal"`
// (teclado numérico en el teléfono) con el parser `leerNumeroEsAR`, y el campo compartido lo hace una vez.
//
// MUTACIÓN QUE LO PONE ROJO: volver a `type="number"` en `InlineEdit`.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const fuente = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8')
const sinComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/^\s*\/\/.*$/gm, '')
const NUMERO = /type="number"|type=\{'number'\}|'number' :|\? 'number'/

const ARCHIVOS = [
  '../../../../shared/components/ds/InlineEdit.tsx',
  './CeldasDeLiquidacion.tsx',
  './cuadro/CeldasDelEspejo.tsx',
  './cuadro/CeldasBlancoNegro.tsx',
  './cuadro/CeldaTarifa.tsx',
  './cuadro/PanelDeLaPersona.tsx',
  './GrillaEspejoQuincena.tsx',
]

test('NINGÚN INPUT EDITABLE DE LIQUIDACIÓN ES type="number"', () => {
  for (const rel of ARCHIVOS) {
    assert.ok(!NUMERO.test(sinComentarios(fuente(rel))), `${rel} todavía tiene un input numérico con spinner`)
  }
})

test('EL CAMPO COMPARTIDO: texto con teclado decimal, parser es-AR, error inline, Tab a la siguiente, 32 px', () => {
  const c = sinComentarios(fuente('../../../../shared/components/ds/InlineEdit.tsx'))
  assert.match(c, /inputMode=\{tipo === 'numero' \? 'decimal' : undefined\}/)
  assert.match(c, /leerNumeroEsAR\(/)
  assert.match(c, /número inválido/)
  assert.match(c, /e\.key === 'Tab'/)
  assert.match(c, /indiceDeLaSiguiente\(/)
  assert.match(c, /guardando…/)
  assert.match(c, /min-h-8/, 'área de toque de al menos 32 px')
  assert.match(c, /cursor-text/)
  // El redondeo y la tarifa usan el mismo parser.
  assert.match(sinComentarios(fuente('./CeldasDeLiquidacion.tsx')), /leerNumeroEsAR|importeDelTexto/)
  assert.match(sinComentarios(fuente('../../services/efectivoRedondeado.ts')), /leerNumeroEsAR\(/)
  assert.match(sinComentarios(fuente('./cuadro/CeldaTarifa.tsx')), /leerNumeroEsAR\(/)
})
