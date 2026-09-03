// ¿LA CELDA QUE YO ESCRIBÍ HOY DICE OTRA COSA? — la regla que decide si el dueño la editó.
//
// ═══ POR QUÉ ESTE ARCHIVO EXISTE (03/09, auditoría de cierre) ═══
//
// `editadaPorElDueno`, `numeroDe` y `contenidoComparable` nacieron sin un solo test propio: la
// mutación `return false` al principio de la función sobrevivía con 62/62 en verde. Una regla que
// decide si se pisa el trabajo del dueño no puede apoyarse en que otro test la ejercite de costado.
//
// LOS DOS ERRORES SON CAROS Y OPUESTOS:
//   · decir «no la editó» cuando sí  → se le pisa una corrección
//   · decir «la editó» cuando no     → la celda calculada se congela para siempre, y ése es el
//                                      «candado de mierda» que el dueño mandó a apagar el 05/08
// Por eso la mitad de los casos de acá son falsos positivos que NO tienen que dispararse.

import test from 'node:test'
import assert from 'node:assert/strict'
import { editadaPorElDueno, numeroDe, contenidoComparable } from './huella-forma.mjs'

test('sin valor sellado no se afirma nada: las huellas viejas se comportan como antes', () => {
  assert.equal(editadaPorElDueno('lo que sea', null), false)
  assert.equal(editadaPorElDueno('lo que sea', undefined), false)
})

test('TEXTO: el rótulo que él reescribió sí es una edición', () => {
  assert.equal(editadaPorElDueno('LLAMAR A JUAN', 'pagar el viernes'), true)
  assert.equal(editadaPorElDueno('Proveedor', 'Proveedor'), false)
  // Mayúsculas y espacios de más no son una edición: los mete cualquier viaje de ida y vuelta.
  assert.equal(editadaPorElDueno('  Proveedor ', 'proveedor'), false)
})

test('NÚMERO: el importe que él corrigió es una edición; el mismo importe con otro formato NO', () => {
  assert.equal(editadaPorElDueno(750000, 500000), true, 'cambió el importe de una celda mía')
  // USER_ENTERED reinterpreta: el OS manda el texto «$ 500.000» y la lectura devuelve el número.
  assert.equal(editadaPorElDueno(500000, '$ 500.000'), false)
  assert.equal(editadaPorElDueno('500.000', 500000), false)
  assert.equal(editadaPorElDueno('1.234,56', 1234.56), false, 'es-AR: el punto agrupa, la coma decide')
  assert.equal(editadaPorElDueno('1,234.56', 1234.56), false, 'en-US: al revés')
  assert.equal(editadaPorElDueno(-1506.85, '-$1.506,85'), false)
})

test('FECHA: el serial que devuelve Google no es una edición de la fecha que escribí', () => {
  // El OS escribe «10/09/2026»; con USER_ENTERED Google la guarda como fecha y la lectura FORMULA
  // devuelve el serial 46275. Ninguno de los dos parsea como el mismo número, y ahí NO se afirma nada:
  // «un número contra un texto» no es evidencia. Congelar la fila de vencimientos costaría el
  // calendario entero.
  assert.equal(editadaPorElDueno(46275, '10/09/2026'), false)
  assert.equal(editadaPorElDueno('2026-09-10', '2026-09-10'), false)
  // Pero una fecha cambiada por otra fecha, las dos como texto, sí es una edición.
  assert.equal(editadaPorElDueno('12/09/2026', '10/09/2026'), true)
})

test('FÓRMULA: el locale es-AR no es una edición', () => {
  // El OS sella la fórmula como la escribe (coma) y localizeValues la manda a es-AR (punto y coma).
  // Sin esto, CADA fórmula del archivo se declararía editada en la primera corrida.
  assert.equal(editadaPorElDueno('=SUM(A1;A2)', '=SUM(A1,A2)'), false)
  assert.equal(editadaPorElDueno('=ROUND(A1*1,05;2)', '=ROUND(A1*1.05,2)'), false)
})

test('FÓRMULA: lo que reescribe Google no es una edición; lo que reescribe él, sí', () => {
  // Google corre las referencias al insertar filas, agrega y saca `$`, y expande rangos abiertos.
  assert.equal(editadaPorElDueno('=SUM(F46:F57)', '=SUM(F45:F56)'), false, 'se insertó una fila')
  assert.equal(editadaPorElDueno('=SUM($F$46:$F$57)', '=SUM(F46:F57)'), false, 'sólo cambió el anclaje')
  assert.equal(editadaPorElDueno("='Cheques Emitidos'!A1", '=Cheques Emitidos!A1'), false, 'comillas de Google')
  // Y lo que sí es una edición: otra función, otro término, otra columna.
  assert.equal(editadaPorElDueno('=SUM(F46:F57)', '=AVERAGE(F46:F57)'), true)
  assert.equal(editadaPorElDueno('=SUM(F46:F57)+100', '=SUM(F46:F57)'), true)
  assert.equal(editadaPorElDueno('=SUM(G46:G57)', '=SUM(F46:F57)'), true, 'la apuntó a otra columna')
})

test('FÓRMULA contra VALOR: pegar un número encima de mi fórmula es una edición', () => {
  assert.equal(editadaPorElDueno('123456', '=SUM(F46:F57)'), true)
  assert.equal(editadaPorElDueno('=SUM(F46:F57)', '123456'), true)
})

test('numeroDe: sólo afirma cuando puede', () => {
  assert.equal(numeroDe('$ 1.234,56'), 1234.56)
  assert.equal(numeroDe('1,234.56'), 1234.56)
  assert.equal(numeroDe('1.234'), 1234, 'tres dígitos exactos: agrupación es-AR')
  assert.equal(numeroDe('1.2'), 1.2, 'un decimal suelto no es agrupación')
  assert.equal(numeroDe(0), 0)
  assert.equal(numeroDe('hola'), null)
  assert.equal(numeroDe('10/09/2026'), null, 'una fecha NO es un número: si lo fuera, se compararía mal')
  assert.equal(numeroDe(''), null)
  assert.equal(numeroDe(null), null)
})

test('contenidoComparable: la fórmula pasa por normalizarFormula, no por una copia', () => {
  assert.equal(contenidoComparable("='Hoja 2'!A1"), '=hoja 2!a1')
  assert.equal(contenidoComparable('=SUM(A1;A2)'), '=sum(a1,a2)')
  assert.equal(contenidoComparable('  Texto  Con   Espacios '), 'texto con espacios')
  assert.equal(contenidoComparable(null), '')
})
