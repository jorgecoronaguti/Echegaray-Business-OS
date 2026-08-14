// EL AUDITOR DE FORMATO, AUDITADO.
//
// Este módulo es el que dice "la pestaña quedó bien". Si se equivoca hacia el verde, tres pestañas
// quedan sin vigilancia y nadie se entera: un control no se valida contra la misma información que
// produce. Por eso acá se reconstruye el defecto REAL de `OBRAS!F` —el contrato de columnas pinta
// moneda, el olfateador de contenido pinta TEXTO encima— y se exige que lo señale.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  alcanceDeFields, pintar, devuelveNumero, numerosDibujadosComoTexto, a1,
} from './formato-en-capas.mjs'

const MONEDA = { type: 'CURRENCY', pattern: '#,##0;(#,##0);"—"' }
const celda = (sheetId, r0, r1, c0, c1, numberFormat, fields = 'userEnteredFormat.numberFormat') => ({
  repeatCell: {
    range: { sheetId, startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1 },
    cell: { userEnteredFormat: numberFormat ? { numberFormat } : { horizontalAlignment: 'LEFT' } },
    fields,
  },
})

test('EL DEFECTO DE OBRAS, RECONSTRUIDO: la capa que pinta última gana, y este auditor la ve', () => {
  // La columna F pedía moneda para las 45 filas; doscientas líneas más abajo el olfateador pidió TEXTO
  // para F10 porque el string que leyó ("▲ 17.449.303") no le pareció un número. El importe salió
  // crudo. Mirado request por request, los dos pedidos son correctos: sólo el ORDEN dice la verdad.
  const requests = [
    celda(1, 0, 45, 5, 6, MONEDA),
    celda(1, 9, 10, 5, 6, { type: 'TEXT' }),
  ]
  const lienzo = pintar(requests, { alto: 45, ancho: 9 })
  assert.equal(lienzo[9][5], 'TEXT', 'la última capa es la que queda')
  assert.equal(lienzo[8][5], 'CURRENCY')
  const filas = Array.from({ length: 45 }, () => Array(9).fill(''))
  filas[9][5] = '=SUM(A1:A2)'
  filas[8][5] = '=SUM(A1:A2)'
  const malas = numerosDibujadosComoTexto(filas, lienzo)
  assert.deepEqual(malas.map((m) => a1(m.fila, m.col)), ['F10'])
})

test('UN CERO NO SALVA A NADIE: la celda se juzga por lo que devuelve, no por lo que se ve', () => {
  // El tercer tramo del patrón dibuja el cero como "—", así que una columna rota se ve impecable hasta
  // el primer importe. Si este auditor mirara el valor renderizado, daría verde sobre la pestaña rota.
  const lienzo = pintar([celda(1, 0, 3, 1, 2, { type: 'TEXT' })], { alto: 3, ancho: 3 })
  const filas = [[null, 0, null], [null, '=SUMPRODUCT(A1:A2)', null], [null, '', null]]
  assert.deepEqual(numerosDibujadosComoTexto(filas, lienzo).map((m) => a1(m.fila, m.col)), ['B1', 'B2'])
})

test('una celda que NADIE pinta queda en null — que no es "sin formato", es HEREDADO', () => {
  // `estilo-pestana.reset()` repone fondo, fuente, alineación y ajuste, y a propósito NO repone el
  // formato de número: lo que ninguna capa nombra se queda con lo que dejó la corrida anterior. Es la
  // mitad del defecto de OBRAS y por eso `pintar` acepta el lienzo de la corrida previa.
  const lienzo = pintar([], { alto: 2, ancho: 2 })
  assert.deepEqual(lienzo, [[null, null], [null, null]])
  const heredado = pintar([], { alto: 2, ancho: 2, inicial: [['TEXT', null], [null, null]] })
  assert.equal(heredado[0][0], 'TEXT', 'la corrida que no repone hereda el TEXTO de la anterior')
  // Y la corrida que SÍ repone lo tapa: es la cura, y tiene que verse acá.
  assert.equal(pintar([celda(1, 0, 2, 0, 2, MONEDA)], { alto: 2, ancho: 2, inicial: [['TEXT', null], [null, null]] })[0][0], 'CURRENCY')
})

test('un `fields` que nombra userEnteredFormat ENTERO borra el formato de número que no trae', () => {
  // No es teoría: así pinta sus títulos de bloque más de un generador del repo (`fmt(rango,
  // 'userEnteredFormat', {textFormat})`). Google reemplaza el objeto completo, y la celda se queda sin
  // formato de número aunque el request no hable de números. Un simulador que ignore esto da verde.
  assert.deepEqual(alcanceDeFields('userEnteredFormat'), { todo: true, numberFormat: true })
  assert.equal(alcanceDeFields('userEnteredFormat.numberFormat').numberFormat, true)
  assert.equal(alcanceDeFields('userEnteredFormat(numberFormat,horizontalAlignment)').numberFormat, true)
  assert.equal(alcanceDeFields('userEnteredFormat.textFormat').numberFormat, false)
  assert.equal(alcanceDeFields('userEnteredFormat(backgroundColor,textFormat,wrapStrategy)').numberFormat, false)
  const lienzo = pintar([
    celda(1, 0, 5, 0, 3, MONEDA),
    celda(1, 2, 3, 0, 3, null, 'userEnteredFormat'),
    celda(1, 3, 4, 0, 3, null, 'userEnteredFormat.textFormat'),
  ], { alto: 5, ancho: 3 })
  assert.equal(lienzo[2][0], null, 'el request que reemplaza el formato entero borra el numberFormat')
  assert.equal(lienzo[3][0], 'CURRENCY', 'el que sólo toca la tipografía no lo toca')
})

test('qué cuenta como número: el operador manda, y ante la duda NO se acusa', () => {
  // El auditor tiene que atrapar la fórmula que devuelve plata sin acusar a la que devuelve una frase.
  // Un auditor con falsos positivos se apaga solo: el primero que moleste hace que alguien lo saque.
  for (const v of [
    12345, 0, -1,
    '=SUM($C$58:$C$61)',
    '=SUMPRODUCT((Cobranzas!$O$5:$O$400="Pendiente")*1)',
    '=COUNTIF($A$112:$A$153;"<>")',
    '=TODAY()+59',
    '=CAJA_TOTAL_DISPONIBLE+SUMPRODUCT(ISNUMBER(_MOVIMIENTOS!$A$2:$A)*1)', // ninguna lista de nombres lo atrapa
    '=IFERROR(E52-E53-E54;"")',
    '=ROUND(B12*1,21;2)',
  ]) assert.equal(devuelveNumero(v), true, `tendría que contar como número: ${v}`)

  for (const v of [
    '', '—', 'Cuántos', 'Total vencido sin conciliar', '$1.234.567', '12%',
    '=TEXTJOIN(" · ";1;A1:A3)',
    '=A1&" — "&B1',
    '=IF(N(CAJA_ARQUEO_ARS)+N(CAJA_ARQUEO_USD)=0;"▲ Sin arqueo cargado";"✓ arqueo al día")', // la condición es aritmética, el resultado NO
    '=IFERROR(INDEX(QUERY(_MOVIMIENTOS!$A$2:$P;"select J, sum(C) group by J");1;1);"")', // el "Top 5" del anexo: devuelve un NOMBRE
    '=TEXT($C$62;"$#,##0")&" para conciliar"',
  ]) assert.equal(devuelveNumero(v), false, `NO tendría que contar como número: ${v}`)
})

test('los formatos que dibujan un número no se acusan; los que lo dibujan crudo, sí', () => {
  const filas = [['=SUM(A:A)', '=SUM(A:A)', '=SUM(A:A)', '=SUM(A:A)', '=SUM(A:A)']]
  const lienzo = [['CURRENCY', 'NUMBER', 'PERCENT', 'DATE', 'TEXT']]
  assert.deepEqual(numerosDibujadosComoTexto(filas, lienzo).map((m) => a1(m.fila, m.col)), ['E1'])
})

test('a1 traduce fila/columna a la referencia que se puede ir a mirar', () => {
  // Un hallazgo sin referencia obliga a contar columnas con el dedo en la pantalla.
  assert.equal(a1(10, 5), 'F10')
  assert.equal(a1(1, 0), 'A1')
  assert.equal(a1(400, 26), 'AA400')
})
