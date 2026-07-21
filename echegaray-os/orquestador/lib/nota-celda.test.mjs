import { test } from 'node:test'
import assert from 'node:assert/strict'
import { partirTexto, notasDeColumna, altoDeParrafo, entranEn } from './nota-celda.mjs'

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
