// Test de la parte PURA del generador de la pestaña "Tarjeta de Credito": la construcción de la
// grilla. No toca red ni base. Verifica que el diseño cumple la gramática del archivo, que los
// números oficiales del Detalle de Tarjeta están cargados como valores, y que los totales y
// verificaciones son fórmulas que referencian esos datos (no números pegados).

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { grilla, ANCHO, C_CONCEPTO, C_MONTO } from './tarjeta-credito-pestana.mjs'
import { auditarPatron } from '../lib/patron-pestana.mjs'
import { limpiarCentinela } from '../lib/preservar-anotaciones.mjs'

/** La grilla con el centinela ` ::VACIO:: ` convertido a '' — como la vería el Sheet ya escrita. */
const limpia = () => limpiarCentinela(grilla().filas)
const conceptos = (filas) => filas.map((f) => String(f[C_CONCEPTO] ?? ''))
const montos = (filas) => filas.map((f) => f[C_MONTO])

test('cumple el patrón de diseño del archivo (sin defectos)', () => {
  const defectos = auditarPatron(limpia(), { ancho: ANCHO })
  assert.deepEqual(defectos, [], `defectos: ${JSON.stringify(defectos, null, 2)}`)
})

test('título en oración y subtítulo con la fuente y la fecha de corte', () => {
  const filas = limpia()
  assert.equal(filas[0][C_CONCEPTO], 'Tarjeta de crédito')
  assert.match(String(filas[1][C_CONCEPTO]), /3319/)
  assert.match(String(filas[1][C_CONCEPTO]), /29\/07\/2026/)
})

test('las cinco secciones están numeradas y en orden', () => {
  const cs = conceptos(limpia())
  const nums = cs.filter((c) => /^\d+ · /.test(c)).map((c) => Number(c[0]))
  assert.deepEqual(nums, [1, 2, 3, 4, 5])
})

test('un solo ancho de grilla en toda la pestaña', () => {
  for (const f of grilla().filas) assert.equal(f.length, ANCHO)
})

test('los números oficiales del Detalle de Tarjeta están cargados como VALORES', () => {
  const m = montos(limpia())
  for (const oficial of [10000000, 24000, 32500, 8693073.70, 3554133.30, 6445866.70, 2000000]) {
    assert.ok(m.includes(oficial), `falta el valor oficial ${oficial}`)
  }
})

test('los totales y verificaciones son FÓRMULAS que referencian las celdas, no números pegados', () => {
  const filas = limpia()
  const porRotulo = (frag) => filas.find((f) => String(f[C_CONCEPTO]).includes(frag))

  // Control de cuotas: consumido + disponible (debe dar el límite de $10.000.000).
  const cuotas = porRotulo('Límite de la línea de cuotas')
  assert.ok(cuotas, 'falta el control de límite de cuotas')
  assert.match(String(cuotas[C_MONTO]), /^=B\d+\+B\d+$/)

  // Control de adelanto: utilizado + disponible.
  const adelanto = porRotulo('Límite de adelanto')
  assert.match(String(adelanto[C_MONTO]), /^=B\d+\+B\d+$/)

  // Total de consumos: SUM del rango de la sección.
  const consumos = porRotulo('Total últimos consumos')
  assert.match(String(consumos[C_MONTO]), /^=SUM\(B\d+:B\d+\)$/)
})

test('el hero referencia los datos oficiales de abajo (no los repite)', () => {
  const filas = limpia()
  const hero = filas.filter((f) => /^   · /.test(String(f[C_CONCEPTO])) || String(f[C_CONCEPTO]).startsWith('⇒ Disponible para comprar'))
  assert.ok(hero.length >= 3, 'el hero tiene que tener el titular y sus sub-ítems')
  for (const f of hero) assert.match(String(f[C_MONTO]), /^=B\d+$/, `el hero debe referenciar, no pegar: ${f[C_CONCEPTO]}`)
})

test('el titular apunta a "Disponible para comprar hoy" y es una referencia', () => {
  const g = grilla()
  const fila = limpiarCentinela([g.filas[g.titular - 1]])[0]
  assert.match(String(fila[C_CONCEPTO]), /^⇒ Disponible para comprar hoy/)
  assert.match(String(fila[C_MONTO]), /^=B\d+$/)
})

test('los últimos consumos suman $56.500 (los tres valores oficiales)', () => {
  const m = montos(limpia())
  // Los tres consumos: 24.000 + 32.500 + 0 = 56.500. Están cargados como valores.
  assert.ok(m.includes(24000) && m.includes(32500) && m.includes(0))
})

test('la ficha de la tarjeta (sección 5) trae los datos como texto con apóstrofo', () => {
  const g = grilla()
  const textos = g.textos.map((fila) => g.filas[fila - 1])
  const valores = textos.map((f) => String(f[C_MONTO]))
  assert.ok(valores.some((v) => v.includes('Echegaray, Oviedo Ro')))
  assert.ok(valores.some((v) => v.includes('20/08/2026')))
  assert.ok(valores.some((v) => v.includes('01/09/2026')))
  for (const v of valores) assert.ok(v.startsWith("'"), `el dato de la ficha va con apóstrofo para no parsearse: ${v}`)
})
