// LA SEÑAL DE ALERTA TIENE QUE DIBUJARSE. Este archivo fija el corte que se midió en el PDF real.
//
// El defecto que persigue: que alguien vuelva a poner un glifo emoji como marca de alerta. No falla
// nada, no hay celda en rojo, el valor está en la celda — y la marca no se ve. Es el peor modo de
// falla posible para una señal, porque el silencio se lee como "no hay nada que mirar".

import test from 'node:test'
import assert from 'node:assert/strict'
import { ALERTA, esInvisible, glifosInvisibles } from './glifos.mjs'

test('los glifos que se VERIFICARON invisibles en el PDF del archivo están marcados', () => {
  // Evidencia directa (13/08): `Calendario de Cobros!D4` dibujó "Vencido" sin su ⚠, y `Cobranzas!V45`
  // dibujó "Vigente" sin su 🟢. Los dos son emoji.
  assert.equal(esInvisible('⚠'), true, 'U+26A0 es el que empezó todo esto')
  assert.equal(esInvisible('🟢'), true, 'el semáforo de Cobranzas tampoco se dibuja')
  assert.equal(esInvisible('✅'), true)
  assert.equal(esInvisible('🔒'), true)
})

test('los glifos que se VERIFICARON dibujándose NO se marcan: un detector ruidoso se deja de mirar', () => {
  // Los cuatro salen dibujados en el mismo archivo y la misma fuente (Arial): "⇒ TOTAL", "✓ oficina y
  // dirección cierran", "⊘ No incluye sábados" en Jornales y "↳ endosado" en el Calendario.
  for (const ch of ['⇒', '✓', '⊘', '↳', '—', '·', '≈', '‖', '→', '✗', '▲']) {
    assert.equal(esInvisible(ch), false, `${ch} se dibuja en el archivo: marcarlo sería ruido`)
  }
})

test('LA CONSTANTE DE ALERTA SE DIBUJA — si dejara de dibujarse, la marca no avisaría nada', () => {
  assert.equal(esInvisible(ALERTA), false, `${ALERTA} no puede ser emoji: es la señal que tiene que verse`)
  assert.equal(ALERTA.length, 1, 'un solo carácter: dos serían un glifo más un selector de variación')
  assert.notEqual(ALERTA, '⚠')
})

test('glifosInvisibles devuelve los DISTINTOS y en orden: lo que interesa es qué cambiar', () => {
  assert.deepEqual(glifosInvisibles('⚠ Vencido'), ['⚠'])
  assert.deepEqual(glifosInvisibles('⚠ x ⚠ y 🟢'), ['⚠', '🟢'])
  assert.deepEqual(glifosInvisibles(`${ALERTA} fin 21/08`), [])
  assert.deepEqual(glifosInvisibles(''), [])
  assert.deepEqual(glifosInvisibles(null), [])
})
