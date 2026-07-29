// Test de la parte PURA del generador de la pestaña "Tarjeta de Credito": la construcción de la
// grilla. No toca red ni base. Verifica que el diseño cumple la gramática del archivo, que los
// números oficiales del Detalle de Tarjeta están cargados como valores, y que los totales y
// verificaciones son fórmulas que referencian esos datos (no números pegados).

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { grilla, ANCHO, C_CONCEPTO, C_MONTO, reubicarFormula, formatoLedger, LEDGER_HEADER } from './tarjeta-credito-pestana.mjs'
import { auditarPatron } from '../lib/patron-pestana.mjs'
import { limpiarCentinela } from '../lib/preservar-anotaciones.mjs'

/** La grilla con el centinela ` ::VACIO:: ` convertido a '' — como la vería el Sheet ya escrita. */
const limpia = (ledger) => limpiarCentinela(grilla(ledger).filas)
const conceptos = (filas) => filas.map((f) => String(f[C_CONCEPTO] ?? ''))
const montos = (filas) => filas.map((f) => f[C_MONTO])

/** Un ledger de muestra con las mismas particularidades que el real: fechas literales, una fórmula de
 *  misma-fila (=A{fila}), un monto constante-fórmula (=x/3), texto con ceros a la izquierda y celdas
 *  vacías. `oldStart` = 3 imita que en la pestaña vieja los datos arrancaban en la fila 3. */
const LEDGER_MUESTRA = {
  header: [...LEDGER_HEADER, '', ''],
  anchoLedger: 12,
  oldStart: 3,
  filas: [
    [{ v: '16/1/2026', n: 46038 }, { f: '=A3' }, { v: 'Modica SA' }, { v: '', n: null }, { n: 355413.39 }, { v: 'FA' }, { v: '00045-00000009' }, { v: '2/2/2026', n: 46055 }, { f: '=H3' }, { v: 'SI' }, { v: 'Financiero' }, { v: '✓ su factura está en Compras' }],
    [{ v: '6/7/2026', n: 46209 }, { f: '=A4' }, { v: 'Pintureria Cordoba' }, { n: 1 }, { f: '=791441,74/3' }, { v: 'FA' }, { v: '0042-00056761 y 62' }, { v: '2/8/2026', n: 46236 }, { f: '=H4' }, { v: null }, { v: 'Civil' }, { v: '⚠ FALTA cargar la factura en Compras — este pago no lo ve el cash flow' }],
  ],
}

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

// ═══ SIN LEDGER: la estructura del resumen no cambia (retrocompatibilidad) ═══

test('sin ledger no hay sección 6 y el resumen queda igual', () => {
  const cs = conceptos(limpia())
  assert.ok(!cs.some((c) => /^6 · /.test(c)), 'sin ledger no debe existir la sección 6')
  assert.equal(grilla().ledgerInfo, null)
})

// ═══ EL RELOCALIZADOR DE FÓRMULAS (reubicarFormula) ═══

test('reubicarFormula corre las filas relativas por delta y respeta anclas y constantes', () => {
  assert.equal(reubicarFormula('=A3', 40), '=A43')
  assert.equal(reubicarFormula('=H8', 40), '=H48')
  // fila anclada: no se mueve. columna anclada: sí se mueve la fila.
  assert.equal(reubicarFormula('=A$3', 40), '=A$3')
  assert.equal(reubicarFormula('=$A5', 10), '=$A15')
  // una constante con coma decimal (locale es_AR) no es una referencia: no se toca.
  assert.equal(reubicarFormula('=791441,74/3', 40), '=791441,74/3')
  // delta 0 o no-fórmula: devuelve lo mismo.
  assert.equal(reubicarFormula('=A3', 0), '=A3')
  assert.equal(reubicarFormula('SI', 40), 'SI')
})

test('formatoLedger fija un formato explícito para cada columna (nada hereda formato viejo)', () => {
  assert.equal(formatoLedger('Fecha de Compra').type, 'DATE')
  assert.equal(formatoLedger('fecha de pago').type, 'DATE')
  assert.equal(formatoLedger('fecha gral').pattern, 'mmmm yy')
  assert.equal(formatoLedger('Monto').type, 'CURRENCY')
  assert.equal(formatoLedger('Cuota').type, 'NUMBER')   // un entero, no "$6,00"
  assert.equal(formatoLedger('Proveedor').type, 'TEXT')
  assert.equal(formatoLedger('').type, 'TEXT')          // columnas de anotación sin encabezado
})

// ═══ CON LEDGER: la sección 6 preserva la data tal cual y sigue cumpliendo el patrón ═══

test('con ledger la pestaña cumple el patrón (ledger admitido como único bloque más ancho)', () => {
  const defectos = auditarPatron(limpia(LEDGER_MUESTRA), { ancho: ANCHO })
  assert.deepEqual(defectos, [], `defectos: ${JSON.stringify(defectos, null, 2)}`)
})

test('las seis secciones están numeradas y en orden cuando hay ledger', () => {
  const cs = conceptos(limpia(LEDGER_MUESTRA))
  const nums = cs.filter((c) => /^\d+ · /.test(c)).map((c) => Number(c[0]))
  assert.deepEqual(nums, [1, 2, 3, 4, 5, 6])
})

test('la sección 6 re-emite el encabezado del ledger tal cual (10 columnas)', () => {
  const filas = limpia(LEDGER_MUESTRA)
  const header = filas.find((f) => String(f[0]) === 'Fecha de Compra')
  assert.ok(header, 'falta el encabezado del ledger')
  assert.deepEqual(header.slice(0, LEDGER_HEADER.length), LEDGER_HEADER)
})

test('la sección 6 preserva los valores literales del ledger sin tocarlos', () => {
  const filas = limpia(LEDGER_MUESTRA)
  const idx = filas.findIndex((f) => String(f[0]) === 'Fecha de Compra')
  const fila1 = filas[idx + 1]
  assert.equal(fila1[2], 'Modica SA')          // proveedor
  assert.equal(fila1[4], 355413.39)            // monto literal, como número
  assert.equal(fila1[6], '00045-00000009')     // nro comp con ceros a la izquierda, como texto
  assert.equal(fila1[9], 'SI')                 // debitado
})

test('la sección 6 preserva las columnas de anotación del dueño (área y estado de factura)', () => {
  const g = grilla(LEDGER_MUESTRA)
  assert.equal(g.ledgerInfo.cols, 12, 'el ledger tiene 12 columnas (10 + área + estado)')
  const filas = limpiarCentinela(g.filas)
  const fila1 = filas[g.ledgerInfo.dataStart - 1]
  assert.equal(fila1[10], 'Financiero')
  assert.equal(fila1[11], '✓ su factura está en Compras')
  const fila2 = filas[g.ledgerInfo.dataStart]
  assert.equal(fila2[10], 'Civil')
  assert.match(String(fila2[11]), /FALTA cargar la factura/)
})

test('la sección 6 corre las fórmulas relativas del ledger al lugar nuevo', () => {
  const g = grilla(LEDGER_MUESTRA)
  const { dataStart, delta } = g.ledgerInfo
  const filas = limpiarCentinela(g.filas)
  // La primera fila de datos: col B era "=A3" (fila vieja 3) → debe apuntar a la col A de SU fila nueva.
  const fila1 = filas[dataStart - 1]
  assert.equal(delta, dataStart - 3)
  assert.equal(fila1[1], `=A${dataStart}`, 'la fórmula de "fecha gral" debe apuntar a la col A de su propia fila')
  assert.equal(fila1[8], `=H${dataStart}`, 'la fórmula de "fecha pago" debe apuntar a la col H de su propia fila')
  // La segunda fila: monto constante-fórmula, sin referencias → intacto.
  const fila2 = filas[dataStart]
  assert.equal(fila2[4], '=791441,74/3')
  assert.equal(fila2[1], `=A${dataStart + 1}`)
})
