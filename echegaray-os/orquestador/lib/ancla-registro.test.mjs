// EL ANCLA DE UN GENERADOR NO PUEDE SER UN TEXTO QUE UNA PERSONA PUEDE BORRAR.
//
// POR QUÉ EXISTE (23/07). Se rompió en vivo el mismo día que se activó la Regla 0. El dueño había
// borrado la columna de rótulos de la banda de "Cheques Emitidos" —incluido el "TIPO" del
// encabezado del registro—. El generador ubicaba su banda buscando exactamente ese "TIPO" en la
// columna A; no lo encontró, dedujo "la banda mide 0 filas" e **insertó 12 filas**.
//
// El daño no fue cosmético: la pestaña quedó con DOS bandas —una huérfana arriba— y el registro
// entero corrido doce renglones. Y se realimentaba: al quedar A1 vacía por el insert, la detección
// automática de ediciones dio por borrados textos que el dueño nunca tocó.
//
// La regla que sale de acá vale para todo generador: **anclar en la estructura que el generador
// controla (los datos), no en un rótulo que una persona puede editar legítimamente.** Y si no se
// encuentra el ancla, ABORTAR — nunca insertar filas a ciegas.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const SRC = readFileSync(new URL('../scripts/cheques-emitidos-tablero.mjs', import.meta.url).pathname, 'utf8')

test('el ancla del registro no depende sólo del rótulo TIPO', () => {
  assert.match(SRC, /FISICO\|ECHEQ/,
    'tiene que poder ubicar el registro por sus datos (FISICO/ECHEQ), no sólo por el rótulo "TIPO" '
    + 'que el dueño puede borrar')
})

test('si no encuentra dónde arranca el registro, aborta en vez de insertar filas', () => {
  assert.match(SRC, /No encuentro dónde arranca el registro/,
    'sin ancla NO se puede deducir "la banda mide 0": eso inserta filas y duplica la banda')
  const i = SRC.indexOf('No encuentro dónde arranca el registro')
  const j = SRC.indexOf('insertDimension')
  assert.ok(i > 0 && i < j, 'la salida por error tiene que estar ANTES de cualquier insertDimension')
})
