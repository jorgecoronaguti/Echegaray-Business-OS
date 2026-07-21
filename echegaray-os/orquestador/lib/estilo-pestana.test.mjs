import { test } from 'node:test'
import assert from 'node:assert/strict'
import { titulo, bloque, encabezado, celda, total, nota, proyectado, alerta, reset, auditar, FUENTE, FUENTE_NUM, TAM, NUM, COLOR } from './estilo-pestana.mjs'

test('los números van en monoespaciada y el texto no', () => {
  // Es la decisión que hace legible una columna de importes: cada dígito mide igual, así que los
  // millares se alinean solos entre filas.
  assert.equal(celda('moneda').textFormat.fontFamily, FUENTE_NUM)
  assert.equal(celda('cantidad').textFormat.fontFamily, FUENTE_NUM)
  assert.equal(celda('porcentaje').textFormat.fontFamily, FUENTE_NUM)
  assert.equal(celda('texto').textFormat.fontFamily, FUENTE)
  assert.equal(titulo().textFormat.fontFamily, FUENTE)
})

test('los números se alinean a la derecha y el texto a la izquierda', () => {
  assert.equal(celda('moneda').horizontalAlignment, 'RIGHT')
  assert.equal(celda('fecha').horizontalAlignment, 'RIGHT', 'una fecha es un ordinal')
  assert.equal(celda('texto').horizontalAlignment, 'LEFT')
})

test('un cero se muestra como "—", no como "$0"', () => {
  // "$0" invita a leerse como un dato medido; casi siempre significa "acá no hay nada".
  for (const u of ['moneda', 'cantidad', 'porcentaje', 'dias']) {
    assert.match(NUM[u].pattern, /"—"$/, `${u} tiene que terminar en el guion`)
  }
})

test('la unidad se declara: no hay forma de inferirla del rótulo', () => {
  // El defecto que originó esto: el formato se decidía con una regex sobre el texto de la etiqueta,
  // y al mejorar dos redacciones los conteos se mostraron como "$4".
  assert.equal(celda('cantidad').numberFormat.type, 'NUMBER')
  assert.equal(celda('moneda').numberFormat.type, 'CURRENCY')
  assert.equal(celda('loQueSea').numberFormat.type, 'TEXT', 'una unidad desconocida cae a texto, no a moneda')
})

test('la jerarquía se lee sin leer: título > encabezado > bloque', () => {
  assert.equal(titulo().backgroundColor, COLOR.titulo)
  assert.equal(encabezado().backgroundColor, COLOR.encabezado)
  assert.equal(bloque().backgroundColor, COLOR.bloque)
  assert.ok(titulo().textFormat.fontSize > bloque().textFormat.fontSize)
  assert.ok(bloque().textFormat.fontSize > nota().textFormat.fontSize)
})

test('sólo hay cuatro tamaños', () => {
  assert.equal(new Set(Object.values(TAM)).size, 4)
})

test('un proyectado nunca se confunde con un real', () => {
  assert.equal(proyectado().backgroundColor, COLOR.proyectado)
  assert.notDeepEqual(proyectado().backgroundColor, celda('moneda').backgroundColor)
})

test('el rojo es sólo para alertas', () => {
  // Si el rojo se usa para todo, deja de alertar.
  assert.equal(alerta().backgroundColor, COLOR.alerta)
  assert.equal(celda('moneda').backgroundColor, undefined)
  assert.equal(total().backgroundColor, COLOR.total)
})

test('el título no se envuelve', () => {
  // Un título envuelto empuja la pestaña entera hacia abajo, y una columna congelada no se puede
  // mergear con una que no lo está.
  assert.equal(titulo().wrapStrategy, 'OVERFLOW_CELL')
})

test('el reset borra formato pero NO contenido', () => {
  const r = reset(123, 50, 10)
  assert.equal(r.repeatCell.range.sheetId, 123)
  assert.ok(!/userEnteredValue/.test(r.repeatCell.fields), 'el contenido no se toca')
  assert.match(r.repeatCell.fields, /backgroundColor/)
  assert.match(r.repeatCell.fields, /textFormat/)
})

test('el auditor detecta las cuatro familias que había', () => {
  const arial16 = { congeladas: { filas: 3 }, filas: [[{ formato: { textFormat: { fontFamily: 'Arial', fontSize: 16, bold: true }, backgroundColor: { red: 0.05, green: 0.11, blue: 0.11 } } }]] }
  const d = auditar(arial16).desvios
  assert.ok(d.some((x) => /Arial/.test(x)))
  assert.ok(d.some((x) => /16pt/.test(x)))
  assert.ok(d.some((x) => /barra de color/.test(x)))
})

test('el auditor aprueba una pestaña que cumple', () => {
  const buena = {
    congeladas: { filas: 3 },
    filas: [[{ formato: { textFormat: { fontFamily: FUENTE, fontSize: TAM.titulo, bold: true }, backgroundColor: COLOR.titulo } }]],
  }
  assert.deepEqual(auditar(buena), { ok: true, desvios: [] })
})

test('el auditor marca las filas congeladas fuera de estándar', () => {
  const buena = {
    congeladas: { filas: 0 },
    filas: [[{ formato: { textFormat: { fontFamily: FUENTE, fontSize: TAM.titulo, bold: true }, backgroundColor: COLOR.titulo } }]],
  }
  assert.match(auditar(buena).desvios.join(' '), /0 fila\(s\) congelada/)
})
