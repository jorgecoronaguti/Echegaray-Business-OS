// EL FALSO POSITIVO DEL 13/08: se verificaba en el ancla, no donde estaba el dato.
//
// `escribirPreservando` manda `{ range: '_J_OBREROS!A201', values: <200 filas> }` y la API expande
// el ancla. La guarda releía `_J_OBREROS!A201` —una sola celda, vacía— y buscaba ahí el testigo,
// que en la corrida real era "UOCRA" y vivía en B202. Gritó "NO ATERRIZÓ" con el bloque escrito.
//
// Hermético: funciones puras, sin red ni base.

import test from 'node:test'
import assert from 'node:assert/strict'
import { elegirTestigo, anclaDelRango, testigoDeLote, sirveDeTestigo } from './aterrizaje-escritura.mjs'

test('EL CASO REAL: el testigo del lote A201 se busca en B202, no en A201', () => {
  // Reproduce las filas 201-203 del espejo de JORNALES tal como salieron del origen.
  const values = [
    ['', '', '', '', '', 15, 17, 17],   // fila 201 — sin un solo texto plano
    ['', 'UOCRA', 'enero'],             // fila 202 — acá está el testigo
    ['', 'Oficial Especializado', '$5.470,00'],
  ]
  const t = testigoDeLote('_J_OBREROS!A201', values)
  assert.equal(t.texto, 'UOCRA')
  assert.equal(t.celda, '_J_OBREROS!B202', 'la celda a releer sale del ancla + el desplazamiento del testigo')
  assert.equal(t.exacta, true)
})

test('el ancla de un lote de 200 filas no es el rango escrito', () => {
  // La razón de fondo: A201 es UNA celda y el bloque son 200×34. Releer el ancla no verifica nada.
  assert.deepEqual(anclaDelRango('_J_OBREROS!A201'), { hoja: '_J_OBREROS', fila0: 200, col0: 0 })
})

test('una pestaña con espacios y comillas conserva su cita', () => {
  const t = testigoDeLote("'Cheques Emitidos'!B7", [[313, '05/08/2026', 'debitado x canje interno']])
  assert.equal(t.celda, "'Cheques Emitidos'!D7", 'B + 2 columnas = D, misma fila')
  assert.equal(t.texto, 'debitado x canje interno')
})

test('un rango completo también ancla en su esquina, no en su final', () => {
  const t = testigoDeLote('Proveedores!C10:AZ400', [['', ''], ['', '', 'ARCOR S.A.']])
  assert.equal(t.celda, 'Proveedores!E11')
})

test('columnas más allá de la Z se calculan bien', () => {
  const fila = Array(27).fill('')
  fila[26] = 'JAVIER SANCHEZ'
  assert.equal(testigoDeLote('_J_OBREROS!A1', [fila]).celda, '_J_OBREROS!AA1')
})

test('sin testigo confiable no se verifica — y no se miente diciendo que sí', () => {
  // Números, fechas, montos y fórmulas vuelven transformados del Sheet: ninguno puede decidir.
  assert.equal(testigoDeLote('X!A1', [[67981.02, '04/08/2026', '$ 1.234,56', '-', '=SUMA(A1;A2)']]), null)
  assert.equal(elegirTestigo([]), null)
  for (const v of [67981.02, '04/08/2026', '$ 1.234,56', '-', '=SUMA(A1;A2)', '', '   ', null]) {
    assert.equal(sirveDeTestigo(v), false, `${JSON.stringify(v)} no puede ser testigo`)
  }
})

test('cuando el ancla no se puede calcular, se cae al rango entero (el comportamiento viejo)', () => {
  // Un rango de columnas enteras o con nombre no tiene esquina que calcular: ahí no se adivina, se
  // relee todo el rango — que es correcto justo cuando el rango sí cubre la matriz.
  assert.equal(anclaDelRango('Caja!A:C'), null)
  assert.equal(anclaDelRango('MiRangoConNombre'), null)
  const t = testigoDeLote('Caja!A:C', [['saldo declarado x extracto']])
  assert.deepEqual(t, { celda: 'Caja!A:C', texto: 'saldo declarado x extracto', exacta: false })
})
