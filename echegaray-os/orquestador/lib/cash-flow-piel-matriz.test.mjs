// LA PIEL Y LOS GRÁFICOS DE LAS DOS MATRICES.
//
// Las trampas que estos tests mantienen muertas, todas ya pagadas en este repo:
//   · addConditionalFormatRule APILA: sin borrar antes, cada corrida deja un juego más de reglas.
//   · una regla condicional con la fila relativa se corre de fila y pinta la celda equivocada.
//   · un rango de formato de alto o ancho cero devuelve 400 y tumba el LOTE ENTERO.
//   · un gráfico anclado en una columna que la hoja no tiene devuelve 400 y se cae con el formato.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  pielMatriz, reglasCondicionales, borrarCondicionales, achicarHoja, DEFICIT, AVISO, ANCHOS,
} from './cash-flow-piel-matriz.mjs'
import { planDeGraficosMatriz, requestsDeGraficosMatriz, graficoLiquidezSemanal, MARCA } from './cash-flow-graficos.mjs'
import { grillaSemanal } from './cash-flow-semanas.mjs'
import { grillaMeses } from './cash-flow-meses.mjs'
import { FOOTPRINT } from './cash-flow-matriz.mjs'

const HOY = new Date(Date.UTC(2026, 7, 5))
const REFS = { saldo: 'CAJA_TOTAL_DISPONIBLE', fecha: 'CAJA_FECHA_SALDO', minima: 'CAJA_MINIMA' }
const semanal = () => grillaSemanal({ hoy: HOY, refs: REFS }).meta
const mensual = () => grillaMeses({ anio: 2026, refs: REFS }).meta

test('la reja congelada: siete filas y la columna del concepto', () => {
  const req = pielMatriz({ sheetId: 7, meta: semanal() })
  const props = req.find((r) => r.updateSheetProperties)?.updateSheetProperties.properties.gridProperties
  // Sin la columna A congelada, tres columnas a la derecha ya no se sabe qué fila se está leyendo.
  assert.equal(props.frozenRowCount, 7)
  assert.equal(props.frozenColumnCount, 1)
  assert.equal(props.hideGridlines, true)
})

test('los anchos: el concepto ancho, las columnas de tiempo angostas, el total un poco más', () => {
  const meta = semanal()
  const req = pielMatriz({ sheetId: 7, meta })
  const cols = req.filter((r) => r.updateDimensionProperties?.range.dimension === 'COLUMNS')
  assert.equal(cols[0].updateDimensionProperties.properties.pixelSize, ANCHOS.concepto)
  assert.equal(cols[1].updateDimensionProperties.range.startIndex, meta.cab.col0)
  assert.equal(cols[1].updateDimensionProperties.properties.pixelSize, ANCHOS.tiempo)
  assert.equal(cols[2].updateDimensionProperties.range.startIndex, meta.cab.colTotal)
})

test('el encabezado de tiempo se formatea como FECHA: la celda es un serial y tiene que leerse como día', () => {
  for (const [meta, patron] of [[semanal(), 'dd/mm'], [mensual(), 'mmm yy']]) {
    const req = pielMatriz({ sheetId: 7, meta })
    const r = req.find((x) => x.repeatCell?.range?.startRowIndex === meta.cab.fila - 1
      && x.repeatCell.range.startColumnIndex === meta.cab.col0
      && x.repeatCell.cell.userEnteredFormat?.numberFormat?.type === 'DATE')
    assert.ok(r, 'la fila de encabezados tiene que tener formato de fecha')
    assert.equal(r.repeatCell.cell.userEnteredFormat.numberFormat.pattern, patron)
    assert.equal(r.repeatCell.range.endColumnIndex, meta.cab.colTotal, 'el TOTAL no es una fecha')
  }
})

test('ningún rango de formato es de alto o ancho cero: uno solo tumba el lote entero', () => {
  for (const meta of [semanal(), mensual()]) {
    for (const r of pielMatriz({ sheetId: 7, meta, filasHoja: 220, colsHoja: 65 })) {
      const rango = r.repeatCell?.range ?? r.updateBorders?.range
      if (!rango) continue
      assert.ok(rango.endRowIndex > rango.startRowIndex, JSON.stringify(rango))
      assert.ok(rango.endColumnIndex > rango.startColumnIndex, JSON.stringify(rango))
    }
  }
})

test('la regla del déficit ancla la FILA y deja correr la columna: una regla por fila, no una por celda', () => {
  const meta = semanal()
  const req = reglasCondicionales({ sheetId: 7, meta, refMinima: 'CAJA_MINIMA' })
  const delSaldo = req.filter((r) => r.addConditionalFormatRule.rule.ranges[0].startRowIndex === meta.fila.saldoFinal - 1)
  assert.equal(delSaldo.length, 2, 'el saldo final lleva déficit y aviso')
  for (const s of delSaldo) {
    const f = s.addConditionalFormatRule.rule.booleanRule.condition.values[0].userEnteredValue
    // `B$14`: columna RELATIVA (corre con el rango) y fila FIJA. Con la fila relativa, la regla de la
    // columna N evaluaría la celda de otra fila y pintaría un período tranquilo dejando el crítico limpio.
    assert.ok(f.includes(`B$${meta.fila.saldoFinal}`), f)
    assert.ok(!f.includes(`$B$${meta.fila.saldoFinal}`), `la columna no puede ir fija: ${f}`)
    const r = s.addConditionalFormatRule.rule.ranges[0]
    assert.equal(r.startColumnIndex, meta.cab.col0)
    assert.equal(r.endColumnIndex, meta.cab.colTotal + 1)
  }
})

test('el rojo es sólo del déficit, y el aviso del piso no pinta celdas vacías', () => {
  const req = reglasCondicionales({ sheetId: 7, meta: mensual(), refMinima: 'CAJA_MINIMA' })
  const rojas = req.filter((r) => r.addConditionalFormatRule.rule.booleanRule.format.textFormat.foregroundColor === DEFICIT)
  assert.equal(rojas.length, 1)
  assert.ok(rojas[0].addConditionalFormatRule.rule.booleanRule.condition.values[0].userEnteredValue.includes('<0'))
  const ambar = req.find((r) => r.addConditionalFormatRule.rule.booleanRule.format.textFormat.foregroundColor === AVISO)
  const f = ambar.addConditionalFormatRule.rule.booleanRule.condition.values[0].userEnteredValue
  // Un mes anterior al corte va VACÍO y N("") vale 0: sin la guarda, el aviso pintaría todo lo vacío.
  assert.ok(f.includes('<>""'), f)
  // El rango con nombre va envuelto en INDIRECT: una CUSTOM_FORMULA no acepta nombres y la API
  // devuelve 400 INVALID_ARGUMENT.
  assert.ok(f.includes('INDIRECT("CAJA_MINIMA")'), f)
})

test('sin caja mínima definida se marca el déficit igual: el piso es opcional, el cero no', () => {
  const req = reglasCondicionales({ sheetId: 7, meta: semanal(), refMinima: null })
  assert.equal(req.length, 2, 'saldo final bajo cero y resultado negativo')
  const mes = reglasCondicionales({ sheetId: 7, meta: mensual(), refMinima: null })
  assert.equal(mes.length, 4, 'y en el mensual, las dos variaciones')
})

test('borrar las reglas viejas va de atrás para adelante: al revés se corren los índices', () => {
  assert.deepEqual(borrarCondicionales(7, 3).map((r) => r.deleteConditionalFormatRule.index), [2, 1, 0])
  assert.deepEqual(borrarCondicionales(7, 0), [])
})

test('la hoja se ACHICA al footprint: 220×65 para mostrar 15 columnas es lo que se vino a sacar', () => {
  const req = achicarHoja(7, { filas: 220, cols: 65 }, FOOTPRINT.semana)
  assert.equal(req.length, 2)
  assert.deepEqual(req[0].deleteDimension.range, { sheetId: 7, dimension: 'ROWS', startIndex: 34, endIndex: 220 })
  assert.deepEqual(req[1].deleteDimension.range, { sheetId: 7, dimension: 'COLUMNS', startIndex: 15, endIndex: 65 })
  // Y no borra nada si ya está en medida: un deleteDimension de rango vacío devuelve 400.
  assert.deepEqual(achicarHoja(7, { filas: 34, cols: 15 }, FOOTPRINT.semana), [])
})

test('los gráficos leen las FILAS de la matriz, no una segunda fuente', () => {
  const meta = semanal()
  const g = graficoLiquidezSemanal(7, meta)
  const serie = g.addChart.chart.spec.basicChart.series[0].series.sourceRange.sources[0]
  assert.equal(serie.startRowIndex, meta.fila.saldoFinal - 1)
  assert.equal(serie.endRowIndex, meta.fila.saldoFinal)
  assert.equal(serie.startColumnIndex, meta.cab.col0)
  assert.equal(serie.endColumnIndex, meta.cab.col0 + meta.cab.n)
  const dominio = g.addChart.chart.spec.basicChart.domains[0].domain.sourceRange.sources[0]
  assert.equal(dominio.startRowIndex, meta.cab.fila - 1, 'el eje son los encabezados de tiempo')
  // Anclado DEBAJO del cuadro y dentro de la hoja: `anchorCell` es una celda real.
  const p = g.addChart.chart.position.overlayPosition.anchorCell
  assert.equal(p.columnIndex, 0)
  assert.equal(p.rowIndex, meta.grafico.fila - 1)
  assert.ok(p.rowIndex < FOOTPRINT.semana.filas)
})

test('el plan dice qué gráfico lleva cada vista, y por qué no los otros', () => {
  assert.deepEqual(planDeGraficosMatriz(semanal()).dibujables.map((d) => d.clave), ['liquidezSemanal'])
  assert.deepEqual(planDeGraficosMatriz(mensual()).dibujables.map((d) => d.clave), ['entradasSalidas', 'tendencia'])
  assert.deepEqual(planDeGraficosMatriz(semanal()).omitidos.map((o) => o.clave), ['entradasSalidas', 'tendencia'])
})

test('se borran los gráficos viejos ANTES de dibujar, y en su propia lista', async () => {
  // Separadas porque el generador borra antes de ACHICAR la hoja: un gráfico anclado en la columna 59
  // del diseño anterior vive en un territorio que este rediseño elimina.
  const google = {
    getCharts: async () => [{ sheetId: 7, charts: [{ chartId: 11, title: 'viejo' }, { chartId: 12, title: `${MARCA}otro` }] }],
  }
  const r = await requestsDeGraficosMatriz(google, 'F', 7, semanal(), 'Cash Flow Semanal')
  assert.deepEqual(r.borrar.map((x) => x.deleteEmbeddedObject.objectId), [11, 12])
  assert.equal(r.dibujar.length, 1)
  assert.ok(r.dibujar[0].addChart)
})

test('si no se pueden leer los gráficos existentes, NO se dibuja: dibujar sin borrar los apila', async () => {
  const google = { getCharts: async () => { throw new Error('429') } }
  const r = await requestsDeGraficosMatriz(google, 'F', 7, semanal(), 'X')
  assert.deepEqual(r, { borrar: [], dibujar: [] })
})
