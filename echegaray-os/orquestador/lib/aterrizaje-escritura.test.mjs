// EL FALSO POSITIVO DEL 13/08: se verificaba en el ancla, no donde estaba el dato.
//
// `escribirPreservando` manda `{ range: '_J_OBREROS!A201', values: <200 filas> }` y la API expande
// el ancla. La guarda releía `_J_OBREROS!A201` —una sola celda, vacía— y buscaba ahí el testigo,
// que en la corrida real era "UOCRA" y vivía en B202. Gritó "NO ATERRIZÓ" con el bloque escrito.
//
// Hermético: funciones puras, sin red ni base.

import test from 'node:test'
import assert from 'node:assert/strict'
import { elegirTestigo, anclaDelRango, testigoDeLote, sirveDeTestigo, elegirTestigos, testigosDeLote } from './aterrizaje-escritura.mjs'

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

// ═══ UN TESTIGO NO ALCANZA PARA UN BLOQUE (14/08/2026) ═══
//
// EL DEFECTO. La guarda de aterrizaje miraba UNA celda por lote: la primera de texto plano, que en un
// bloque es el título. En "Proveedores" son 106 filas x 16 columnas ⇒ verificaba 1 celda y daba por
// buenas 1.695. Medido: el título aterrizaba, el cuerpo no siempre, y en la pestaña convivían filas de
// la corrida nueva con rótulos que el generador dejó de producir el 04/08. La guarda decía que sí
// porque miraba justo donde nunca fallaba — un control que no puede fallar no controla nada.
test('EL DEFECTO · los testigos se reparten por la matriz, no se toman los primeros', () => {
  // 40 filas de texto: si tomara los primeros N, todos caerían en la cabecera.
  const values = Array.from({ length: 40 }, (_, i) => [`fila ${String.fromCharCode(97 + (i % 26))}${i}`])
  const t = elegirTestigos(values, 5)
  assert.equal(t.length, 5)
  assert.equal(t[0].fila, 0, 'el primero siempre entra')
  assert.equal(t[t.length - 1].fila, 39, 'y el último también: es donde se corta un lote a medio aterrizar')
  const filas = t.map((x) => x.fila)
  assert.deepEqual(filas, [...filas].sort((a, b) => a - b), 'vienen en orden')
  assert.ok(filas[2] > 10 && filas[2] < 30, 'el del medio mira el cuerpo, no la cabecera')
})

test('testigosDeLote resuelve las celdas y el rectángulo que las cubre', () => {
  const { celdas, rango } = testigosDeLote('Proveedores!A121', [['Notas de crédito'], ['Proveedor'], ['Alumetal']])
  assert.equal(celdas.length, 3)
  assert.equal(celdas[0].celda, 'Proveedores!A121')
  assert.equal(celdas[2].celda, 'Proveedores!A123')
  assert.equal(rango, 'Proveedores!A121:A123', 'una sola lectura cubre a todos: no gasta cuota extra')
})

test('sin ancla calculable no se inventa un testigo: no verificar es mejor que mentir', () => {
  assert.deepEqual(testigosDeLote('Proveedores', [['hola']]), { celdas: [], rango: null })
})

test('un lote sin texto plano no se verifica (números y fórmulas vuelven transformados)', () => {
  assert.deepEqual(elegirTestigos([[1234], ['=SUM(A1:A2)'], ['$45.000']]), [])
})

// ═══ EL APÓSTROFO DE ADELANTE NO ES CONTENIDO (19/08/2026) ═══
//
// `_F931_RAW` escribe los períodos como `'2026-01` para que Sheets no los lea como fecha, y Sheets
// devuelve `2026-01`. La comparación de ida y vuelta daba distinto y el aviso decía "LA ESCRITURA NO
// ATERRIZÓ en 7 rangos… NO des por buena esta corrida" sobre una réplica que estaba perfecta.
test('un período forzado a texto con apóstrofo NO se usa de testigo', () => {
  assert.equal(sirveDeTestigo("'2026-01"), false)
  assert.equal(sirveDeTestigo("'2026-07"), false)
  assert.equal(sirveDeTestigo("'1.234,56"), false)
})

test('el apóstrofo no convierte un número en texto verificable, pero tampoco arruina un texto real', () => {
  // Texto de verdad: sigue sirviendo, con o sin la marca de texto adelante.
  assert.equal(sirveDeTestigo("'Aportes de Seguridad Social"), true)
  assert.equal(sirveDeTestigo('Aportes de Seguridad Social'), true)
})

test('lo que ya se descartaba se sigue descartando', () => {
  assert.equal(sirveDeTestigo('67.981,02'), false)
  assert.equal(sirveDeTestigo('=SUM(A1:A2)'), false)
  assert.equal(sirveDeTestigo('   '), false)
  assert.equal(sirveDeTestigo("'"), false)
  assert.equal(sirveDeTestigo(1234), false)
  assert.equal(sirveDeTestigo(null), false)
})
