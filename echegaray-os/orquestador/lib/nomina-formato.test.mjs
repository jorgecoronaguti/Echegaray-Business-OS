import test from 'node:test'
import assert from 'node:assert/strict'
import { pedidosDeFormatoNomina, FORMATOS_NOMINA } from './nomina-formato.mjs'

// La columna A de «Nómina» como está el 25/09/2026 (filas 1-based = índice + 1).
function columnaA() {
  const A = Array(190).fill('')
  A[3] = 'Parámetros'
  A[68] = '4 · DIRECCIÓN · RETIROS MENSUALES'; A[69] = 'Persona'; A[70] = 'Jorge Echegaray'; A[73] = 'TOTAL DIRECCIÓN'
  A[89] = '6 · LO QUE VA AL CASH FLOW · LO QUE FALTA PAGAR DE CADA MES'; A[90] = 'Concepto'
  A[91] = 'Jornales de obra'; A[95] = 'Cargas · gremiales'
  A[99] = '7 · QUINCENAS PAGADAS'; A[100] = 'Desde'; A[101] = '05/01/2026'
  A[132] = '8 · QUINCENAS A PAGAR · lo que dice Nómina'; A[133] = 'Desde'
  A[144] = '9 · OFICINA Y JEFES · DIRECCIÓN · POR MES'; A[145] = 'Mes'
  A[159] = '10 · CONVENIO UOCRA'; A[160] = 'Categoría'; A[161] = 'OF → Oficial'; A[167] = '⇒ Plantel vigente'
  A[169] = '2.2 · ESCALÓN DEL CONVENIO'; A[170] = 'Mes'
  A[177] = '2.3 · CONTROL DE PISO · CCT 76/75 ZONA A'; A[178] = '⇒ Jornal por hora más bajo'; A[180] = 'Margen sobre el piso'
  A[184] = 'Categoría'; A[185] = 'Oficial Especializado'
  return A
}
const cubre = (r, fila, col) => r.startRowIndex <= fila - 1 && fila - 1 < r.endRowIndex && r.startColumnIndex <= col && col < r.endColumnIndex
const formatoEn = (reqs, fila, col) => reqs.filter((q) => q.repeatCell && cubre(q.repeatCell.range, fila, col)).map((q) => q.repeatCell.cell.userEnteredFormat).reduce((a, f) => ({ ...a, ...f }), {})

test('sólo apariencia: ningún pedido escribe un valor, una fórmula ni toca otra cosa que formato', () => {
  const { requests } = pedidosDeFormatoNomina(columnaA(), 7)
  assert.ok(requests.length > 40)
  for (const q of requests) {
    const [k] = Object.keys(q)
    assert.ok(['repeatCell', 'updateBorders', 'updateDimensionProperties'].includes(k), k)
    if (k === 'repeatCell') {
      assert.equal(q.repeatCell.cell.userEnteredValue, undefined)
      for (const c of q.repeatCell.fields.split(',')) assert.match(c, /^userEnteredFormat\./)
      assert.ok(q.repeatCell.range.startRowIndex < q.repeatCell.range.endRowIndex)
    }
    if (k === 'updateDimensionProperties') assert.equal(q.updateDimensionProperties.fields, 'pixelSize')
  }
})

test('cuadro 6: los meses se ven como «mmm yy» y los importes sin decimales, como el cuadro 1', () => {
  const { requests, anclas } = pedidosDeFormatoNomina(columnaA(), 7)
  assert.equal(anclas['6'], 90)
  assert.deepEqual(formatoEn(requests, 91, 3).numberFormat, FORMATOS_NOMINA.MES) // D91: la cabecera de meses
  assert.deepEqual(formatoEn(requests, 92, 11).numberFormat, FORMATOS_NOMINA.NUM) // L92: jornales de septiembre
  assert.equal(formatoEn(requests, 96, 15).textFormat.bold, true) // P96: el total del renglón
})

test('secciones 7–10: fechas dd/mm/yyyy, plata con el patrón de la pestaña, escalón con % y factor', () => {
  const { requests } = pedidosDeFormatoNomina(columnaA(), 7)
  assert.deepEqual(formatoEn(requests, 102, 0).numberFormat, FORMATOS_NOMINA.FECHA)
  assert.deepEqual(formatoEn(requests, 131, 4).numberFormat, FORMATOS_NOMINA.NUM) // el colchón del derrame también
  assert.deepEqual(formatoEn(requests, 147, 1).numberFormat, FORMATOS_NOMINA.NUM)
  assert.deepEqual(formatoEn(requests, 147, 2).numberFormat, FORMATOS_NOMINA.FECHA)
  assert.deepEqual(formatoEn(requests, 172, 3).numberFormat, FORMATOS_NOMINA.PCT1)
  assert.deepEqual(formatoEn(requests, 172, 4).numberFormat, FORMATOS_NOMINA.FACTOR)
  assert.deepEqual(formatoEn(requests, 181, 1).numberFormat, FORMATOS_NOMINA.PCT1) // «Margen sobre el piso»
  assert.deepEqual(formatoEn(requests, 186, 1).numberFormat, FORMATOS_NOMINA.NUM)
})

test('parámetros: N5 se distingue como input; I5 es porcentaje; Q5 es plata; Dirección B es plata', () => {
  const { requests } = pedidosDeFormatoNomina(columnaA(), 7)
  assert.ok(formatoEn(requests, 5, 13).backgroundColor.blue < 0.9) // N5 amarillo de input
  assert.deepEqual(formatoEn(requests, 5, 8).numberFormat, FORMATOS_NOMINA.PCT2)
  assert.deepEqual(formatoEn(requests, 5, 16).numberFormat, FORMATOS_NOMINA.NUM)
  assert.deepEqual(formatoEn(requests, 71, 1).numberFormat, FORMATOS_NOMINA.NUM)
})

test('los cuadros 1–5 del dueño no se tocan (salvo la columna B de Dirección)', () => {
  const { requests } = pedidosDeFormatoNomina(columnaA(), 7)
  for (const q of requests.filter((x) => x.repeatCell)) {
    const r = q.repeatCell.range
    const enParametros = r.startRowIndex >= 3 && r.endRowIndex <= 6
    const enDireccion = r.startRowIndex >= 70 && r.endRowIndex <= 74 && r.startColumnIndex === 1 && r.endColumnIndex === 2
    assert.ok(enParametros || enDireccion || r.startRowIndex >= 89, JSON.stringify(r))
  }
})

test('una sección que falta se saltea y se nombra: el formato nunca tira la corrida', () => {
  const A = columnaA(); A[159] = ''
  const { requests, faltan } = pedidosDeFormatoNomina(A, 7)
  assert.deepEqual(faltan, ['10'])
  assert.ok(!requests.some((q) => q.repeatCell && q.repeatCell.range.startRowIndex >= 159))
  assert.deepEqual(pedidosDeFormatoNomina([], 7).requests, [])
})
