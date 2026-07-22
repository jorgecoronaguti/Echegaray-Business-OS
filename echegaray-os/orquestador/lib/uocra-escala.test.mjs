import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CATEGORIAS, COL, offsetCategoria, expresionFilaDelMes, formulaValor, formulaVigencia } from './uocra-escala.mjs'

test('el orden de categorías es el del convenio y Sereno va último', () => {
  assert.deepEqual(CATEGORIAS, ['Oficial Especializado', 'Oficial', 'Medio Oficial', 'Ayudante', 'Sereno'])
  assert.equal(offsetCategoria('Oficial Especializado'), 0)
  assert.equal(offsetCategoria('Sereno'), 4)
})

test('una categoría fuera del convenio rompe, no devuelve un offset silencioso', () => {
  assert.throws(() => offsetCategoria('Capataz'), /fuera del convenio/)
})

test('la fila del mes se ubica por nombre con comodín, no por igualdad', () => {
  // El rótulo real es "Julio\n+2%": tiene que reconocerse por "julio*", no por "Julio".
  const e = expresionFilaDelMes('TODAY()')
  assert.match(e, /TEXT\(TODAY\(\);"mmmm"\)&"\*"/)
  assert.match(e, /MATCH\(/)
  assert.match(e, new RegExp(`${COL.mes}\\$1`))
})

test('formulaValor referencia la réplica y baja por el offset de la categoría', () => {
  const oe = formulaValor('Oficial Especializado', COL.basico)
  // Oficial Especializado es offset 0: sin "+n".
  assert.match(oe, /INDEX\(_UOCRA_RAW!\$D\$1:\$D/)
  assert.ok(!/\+0\)/.test(oe), 'el offset 0 no debe escribir "+0"')
  const ay = formulaValor('Ayudante', COL.basico)
  assert.match(ay, /\+3\)/) // Ayudante es la cuarta categoría
})

test('formulaValor NO devuelve cero si falta el mes: un cero diría "el convenio paga $0"', () => {
  assert.match(formulaValor('Oficial', COL.zonaA), /IFERROR\(.*;""\)/s)
})

test('la vigencia grita si el mes en curso no está en la réplica', () => {
  const v = formulaVigencia('TODAY()')
  assert.match(v, /⚠ el mes en curso NO está/)
  assert.match(v, /_UOCRA_RAW/)
})

test('las fórmulas usan el separador es-AR (";") y no la coma', () => {
  for (const f of [expresionFilaDelMes(), formulaValor('Oficial'), formulaVigencia()]) {
    // No debe haber ";," ni argumentos separados por coma fuera de un literal.
    assert.ok(!/,/.test(f.replace(/"[^"]*"/g, '')), `coma fuera de literal en: ${f}`)
  }
})
