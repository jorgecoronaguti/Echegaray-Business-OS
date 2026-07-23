import { test } from 'node:test'
import assert from 'node:assert/strict'
import { partirTexto, notasDeColumna, altoDeParrafo, entranEn, origenANota } from './nota-celda.mjs'

test('un texto que entra en la celda no genera nota', () => {
  // Una nota que repite lo que ya se ve es ruido.
  assert.deepEqual(partirTexto('Arqueo de caja', 44), { corto: 'Arqueo de caja', nota: null })
})

test('un texto largo deja la etiqueta en la celda y el detalle en la nota', () => {
  const t = 'Acuerdo N° 00007, Activo · vence el 2026-12-03 · TNA 55% · costo financiero total 62,78% anual'
  const { corto, nota } = partirTexto(t, 44)
  assert.ok(corto.length <= 46, `la etiqueta tiene que entrar: ${corto.length}`)
  assert.match(corto, /…$/)
  assert.equal(nota, t)          // el texto completo NO se pierde: es la trazabilidad
  assert.ok(t.startsWith(corto.replace('…', '').trim()))
})

test('el corte respeta el separador de campos y no parte una palabra', () => {
  const t = 'Santander Empresas · captura del 21/07/2026 09:19 · réplica del banco'
  const { corto } = partirTexto(t, 44)
  // La etiqueta tiene que terminar donde termina una palabra: el carácter siguiente en el original
  // es un espacio o un separador, nunca el medio de "Empres|as".
  const prefijo = corto.replace('…', '')
  assert.ok(t.startsWith(prefijo))
  assert.match(t.charAt(prefijo.length), /[\s·]|^$/)
})

test('las notas se arman por columna y sólo donde hacen falta', () => {
  const filas = [['Caja', 'Arqueo'], ['Banco', 'x'.repeat(120)]]
  const { requests, celdas, conNota } = notasDeColumna(filas, 1, 7, 44)
  assert.equal(conNota, 1)
  assert.equal(requests.length, 1)
  assert.equal(celdas[0][1], 'Arqueo')            // la corta queda igual
  assert.ok(celdas[1][1].length < 50)             // la larga se acorta
  assert.equal(requests[0].updateCells.rows[0].values[0].note.length, 120)
})

test('un párrafo declara cuánto alto necesita', () => {
  // 300 caracteres en una fila de 20px es lo que hoy hace ilegible la introducción de CAJA.
  assert.ok(altoDeParrafo('x'.repeat(300), 1500) > 20)
  assert.equal(altoDeParrafo('', 400), 20)
  assert.ok(entranEn(300) > 40 && entranEn(300) < 60)
})

test('una FÓRMULA nunca se acorta: cortarla la deja sin parsear y la celda vacía', () => {
  // Regresión real (21/07): las tres alertas de CAJA perdieron su explicación porque la fórmula
  // =CONCATENATE(...) se cortó a 44 caracteres y Sheets no pudo leerla.
  const f = '=CONCATENATE("fila 33: lo que Cobranzas dice que hay en echeq (";TEXT(C32;"$#.##0");")")'
  const { corto, nota } = partirTexto(f, 44)
  assert.equal(corto, f)
  assert.equal(nota, null)
})

test('origenANota saca la procedencia del cuerpo y la cuelga del concepto', () => {
  const filas = [['Concepto', 'ene', 'Origen'], ['F931', 100, 'Compras · por fecha de caja']]
  const { requests, conNota } = origenANota(filas, 2, 7)
  assert.equal(conNota, 1)
  assert.equal(filas[1][2], '', 'la columna de origen queda vacía: deja de robar ancho')
  assert.equal(filas[1][1], 100, 'el dato no se toca')
  const r = requests[0].updateCells
  assert.equal(r.range.startColumnIndex, 0, 'la nota cuelga del concepto, no del importe')
  assert.equal(r.range.startRowIndex, 1)
  assert.equal(r.rows[0].values[0].note, 'Compras · por fecha de caja')
})

test('origenANota no toca una fórmula ni una celda vacía', () => {
  const filas = [['x', 1, ''], ['y', 2, '=A1&"algo"']]
  const { conNota } = origenANota(filas, 2, 7)
  assert.equal(conNota, 0)
  assert.equal(filas[1][2], '=A1&"algo"')
})
