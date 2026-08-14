// LA SEÑAL DE ALERTA TIENE QUE DIBUJARSE. Este archivo fija el corte que se midió en el PDF real.
//
// El defecto que persigue: que alguien vuelva a poner un glifo emoji como marca de alerta. No falla
// nada, no hay celda en rojo, el valor está en la celda — y la marca no se ve. Es el peor modo de
// falla posible para una señal, porque el silencio se lee como "no hay nada que mirar".

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ALERTA, ALERTA_HEREDADA, MARCA_ALERTA, comparaMarca, esInvisible, glifosInvisibles, mismaMarca,
  normalizarAlerta, variantesDeMarca,
} from './glifos.mjs'

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

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// LA TRANSICIÓN — lo que hace que cambiar el glifo no rompa lo que ya está publicado
// ══════════════════════════════════════════════════════════════════════════════════════════════════

test('mismaMarca reconoce el glifo publicado: si no, el cash flow deja de ver 60 cheques', () => {
  const nueva = `${ALERTA} FALTA cargar la factura en Compras`
  const vieja = '⚠ FALTA cargar la factura en Compras'
  assert.equal(mismaMarca(nueva, vieja), true, 'son la MISMA marca con distinto glifo')
  assert.equal(mismaMarca(nueva, nueva), true)
  assert.equal(mismaMarca(nueva, '✓ su factura está en Compras'), false, 'no achata marcas distintas')
  assert.equal(mismaMarca(null, ''), true)
})

test('normalizarAlerta saca el selector de variación: dos textos que se ven iguales comparan iguales', () => {
  // "⚠️" es U+26A0 + U+FE0F. Sin sacar el selector, la igualdad exacta da falso contra "⚠" pelado y
  // nadie ve por qué: el carácter que sobra no se dibuja.
  assert.equal(normalizarAlerta('⚠️ x'), `${ALERTA} x`)
  assert.equal(normalizarAlerta('⚠ x'), `${ALERTA} x`)
  assert.equal(normalizarAlerta(`${ALERTA} x`), `${ALERTA} x`)
})

test('comparaMarca abre los DOS brazos, y sólo cuando la marca lleva alerta', () => {
  const dos = comparaMarca('M2:M400', `${ALERTA} sin N°`)
  assert.ok(dos.includes(`(M2:M400="${ALERTA} sin N°")`), 'compara contra la marca vigente')
  assert.ok(dos.includes('(M2:M400="⚠ sin N°")'), 'y contra la publicada')
  assert.ok(dos.startsWith('((') && dos.includes(')+('), 'el OR de un SUMPRODUCT es una suma')
  // Una marca SIN alerta no gana un segundo brazo: sería un OR contra sí misma, o sea doble conteo.
  assert.equal(comparaMarca('M2:M400', '✓ ok'), '(M2:M400="✓ ok")')
  assert.equal(comparaMarca('M2:M400', ''), '(M2:M400="")')
})

test('variantesDeMarca enumera lo que un COUNTIF no puede preguntar de a dos', () => {
  assert.deepEqual(variantesDeMarca(`${ALERTA} x`), [`${ALERTA} x`, '⚠ x'])
  assert.deepEqual(variantesDeMarca('sin alerta'), ['sin alerta'])
})

test('LA MARCA HEREDADA SIGUE SIENDO LA INVISIBLE — el día que se dibuje, este archivo sobra', () => {
  assert.equal(esInvisible(ALERTA_HEREDADA), true)
  assert.notEqual(ALERTA_HEREDADA, ALERTA, 'si fueran iguales, comparaMarca haría doble conteo')
  assert.equal(MARCA_ALERTA.test(ALERTA), true)
  assert.equal(MARCA_ALERTA.test(ALERTA_HEREDADA), true)
  assert.equal(MARCA_ALERTA.test('⇒'), false)
})
