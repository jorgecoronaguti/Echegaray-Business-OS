import { test } from 'node:test'
import assert from 'node:assert/strict'
import { titulo, bloque, encabezado, celda, total, nota, proyectado, alerta, reset, auditar, FUENTE, FUENTE_NUM, TAM, NUM, COLOR } from './estilo-pestana.mjs'

test('toda la pestaña usa la misma familia', () => {
  // El dueño pidió Arial en todas. No se pierde la alineación de los importes: los dígitos de Arial
  // son de ancho fijo, así que $1.111.111 y $8.888.888 siguen ocupando lo mismo entre filas.
  assert.equal(FUENTE, 'Arial')
  assert.equal(FUENTE_NUM, FUENTE)
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

test('la escala de tamaños es corta y no se inventa afuera', () => {
  // CINCO, no cuatro: el titular del panel (16) entró como quinto escalón el 21/07. La regla no es
  // el número: es que TODOS estén acá. Un tamaño escrito suelto en un script es un tamaño que nadie
  // decidió, y así se llega a seis tipografías distintas en una misma pestaña.
  assert.equal(new Set(Object.values(TAM)).size, 5)
  assert.ok(TAM.titular > TAM.titulo && TAM.titulo > TAM.bloque && TAM.bloque > TAM.cuerpo && TAM.cuerpo > TAM.nota)
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

test('el auditor detecta la tipografía fuera de estándar', () => {
  const calibri = { congeladas: { filas: 3 }, filas: [[{ formato: { textFormat: { fontFamily: 'Calibri', fontSize: 12, bold: true }, backgroundColor: { red: 1, green: 1, blue: 1 } } }]] }
  const d = auditar(calibri).desvios
  assert.ok(d.some((x) => /Calibri/.test(x)))
  assert.ok(d.some((x) => /12pt/.test(x)))
})

test('la BARRA DE COLOR pasó a ser el desvío, no el estándar', () => {
  // El estándar se dio vuelta el 23/07: el título va en tinta sobre blanco. Mientras el auditor
  // exigiera la barra, el formateador general se la repintaba a toda pestaña que su generador
  // dejaba con la piel de statement — y ninguna lograba quedarse bien más de dos horas.
  const conBarra = { congeladas: { filas: 3 }, filas: [[{ formato: { textFormat: { fontFamily: FUENTE, fontSize: TAM.titulo, bold: true }, backgroundColor: COLOR.titulo } }]] }
  assert.ok(auditar(conBarra).desvios.some((x) => /barra de color/.test(x)))
})

test('el auditor aprueba una pestaña que cumple', () => {
  const buena = {
    congeladas: { filas: 3 },
    filas: [[{ formato: { textFormat: { fontFamily: FUENTE, fontSize: TAM.titulo, bold: true }, backgroundColor: { red: 1, green: 1, blue: 1 } } }]],
  }
  assert.deepEqual(auditar(buena), { ok: true, desvios: [] })
})

test('el auditor marca las filas congeladas fuera de estándar', () => {
  const buena = {
    congeladas: { filas: 0 },
    filas: [[{ formato: { textFormat: { fontFamily: FUENTE, fontSize: TAM.titulo, bold: true }, backgroundColor: { red: 1, green: 1, blue: 1 } } }]],
  }
  assert.match(auditar(buena).desvios.join(' '), /0 fila\(s\) congelada/)
})
