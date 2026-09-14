// «EFECT. RED.» SE LEE COMO EL RESTO DE LA FILA (QA, 15/09/2026).
//
// La celda mostraba el número crudo («266000»), sin «$» ni separador de miles, y rompía la lectura de la fila.
// En reposo: «$266.000» (gris si es sugerido, eso lo dice la clase). Al editar: el número. Al salir: formato.
// MUTACIÓN QUE LO PONE ROJO: volver a mostrar el texto crudo en reposo.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { textoDelRedondeo } from './formato.ts'

test('EN REPOSO SE VE CON FORMATO; AL EDITAR, EL NÚMERO', () => {
  assert.equal(textoDelRedondeo({ enEdicion: false, texto: '266000', valor: 266000 }), '$266.000')
  assert.equal(textoDelRedondeo({ enEdicion: true, texto: '266000', valor: 266000 }), '266000')
  assert.equal(textoDelRedondeo({ enEdicion: true, texto: '270.500', valor: 266000 }), '270.500', 'lo tecleado no se reformatea mientras se escribe')
  assert.equal(textoDelRedondeo({ enEdicion: false, texto: '', valor: null }), '', 'sin valor, vacío: nunca «—» dentro de un campo')
})

test('LA CELDA USA LA FUNCIÓN, Y EL STYLE SIGUE SIENDO ESTABLE', () => {
  const c = readFileSync(new URL('./CeldasDeLiquidacion.tsx', import.meta.url), 'utf8')
  const campo = c.slice(c.indexOf('export function CeldaRedondeo('))
  assert.match(campo, /value=\{textoDelRedondeo\(\{ enEdicion, texto, valor: mostrado\.valor \}\)\}/)
  assert.match(campo, /style=\{estiloDelRedondeo\(ancho\)\}/, 'sin estilos armados según el estado (hidratación)')
})
