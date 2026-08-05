// LA PIEL Y LOS GRÁFICOS DE LAS VISTAS DE BLOQUES.
//
// Las tres trampas que estos tests mantienen muertas, todas ya pagadas en este repo:
//   · addConditionalFormatRule APILA: sin borrar antes, cada corrida deja un juego más de reglas.
//   · una regla con la fórmula relativa se ajusta contra el PRIMER rango: un día crítico sin pintar y
//     uno tranquilo pintado. Por eso cada fórmula ancla en absoluto a SU celda.
//   · un gráfico sobre una serie en columnas OCULTAS sale vacío y no da error, salvo con SHOW_ALL.

import test from 'node:test'
import assert from 'node:assert/strict'
import { pielBloques, reglasCondicionales, borrarCondicionales, DEFICIT } from './cash-flow-piel-bloques.mjs'
import { planDeGraficosBloques, requestsDeGraficosBloques, graficoRealProyectado } from './cash-flow-graficos.mjs'
import { grillaAgenda } from './cash-flow-agenda.mjs'
import { grillaMeses } from './cash-flow-meses.mjs'

const HOY = new Date(Date.UTC(2026, 7, 5))
const REFS = { saldo: 'CAJA_TOTAL_DISPONIBLE', fecha: 'CAJA_FECHA_SALDO', minima: 'CAJA_MINIMA' }
const agenda = () => grillaAgenda({ hoy: HOY, refs: REFS })
const mensual = () => grillaMeses({ anio: 2026, refs: REFS, hoy: HOY })

test('una regla condicional por saldo, anclada en ABSOLUTO a su propia celda', () => {
  const { meta } = agenda()
  const req = reglasCondicionales({ sheetId: 7, meta, refMinima: 'CAJA_MINIMA' })
  for (const b of meta.dias) {
    const suyas = req.filter((r) => r.addConditionalFormatRule.rule.ranges[0].startRowIndex === b.filaCierre - 1)
    assert.equal(suyas.length, 2, `el día de la fila ${b.filaCierre} tiene que llevar déficit y aviso`)
    for (const s of suyas) {
      const f = s.addConditionalFormatRule.rule.booleanRule.condition.values[0].userEnteredValue
      assert.ok(f.includes(`$B$${b.filaCierre}`), `la fórmula ${f} no ancla en su propia celda`)
    }
  }
})

test('el rojo es sólo del déficit: la regla de bajo cero va PRIMERO y es la única en rojo', () => {
  const { meta } = agenda()
  const req = reglasCondicionales({ sheetId: 7, meta, refMinima: 'CAJA_MINIMA' })
  const rojas = req.filter((r) => r.addConditionalFormatRule.rule.booleanRule.format.textFormat.foregroundColor === DEFICIT)
  for (const r of rojas) {
    const f = r.addConditionalFormatRule.rule.booleanRule.condition.values[0].userEnteredValue
    assert.ok(f.includes("<0"), f)
  }
  assert.ok(rojas.length > 0)
})

test('sin caja mínima definida se marca el déficit igual: el piso es opcional, el cero no', () => {
  const { meta } = agenda()
  const req = reglasCondicionales({ sheetId: 7, meta, refMinima: null })
  assert.equal(req.length, meta.dias.length + 2, 'una por día, más el piso y el colchón del hero')
})

test('borrar las reglas viejas va de atrás para adelante: al revés se corren los índices', () => {
  const req = borrarCondicionales(7, 3)
  assert.deepEqual(req.map((r) => r.deleteConditionalFormatRule.index), [2, 1, 0])
  assert.deepEqual(borrarCondicionales(7, 0), [])
})

test('la piel oculta la zona auxiliar y deja la vista en tres columnas', () => {
  const { meta } = agenda()
  const req = pielBloques({ sheetId: 7, meta, tipo: 'dia' })
  const oculta = req.find((r) => r.updateDimensionProperties?.properties?.hiddenByUser)
  assert.ok(oculta, 'sin ocultar la maquinaria, la vista muestra fórmulas de FILTER al costado')
  assert.equal(oculta.updateDimensionProperties.range.startIndex, 3)
})

test('el formato del título de bloque es una FECHA: la celda se puede sumar y restar', () => {
  const { meta } = agenda()
  const req = pielBloques({ sheetId: 7, meta, tipo: 'dia' })
  const b = meta.dias[0]
  const r = req.find((x) => x.repeatCell?.range?.startRowIndex === b.filaTitulo - 1
    && x.repeatCell.range.startColumnIndex === 0 && x.repeatCell.cell.userEnteredFormat?.numberFormat?.type === 'DATE')
  assert.ok(r, 'el día tiene que ser una fecha formateada, no un texto')
  assert.equal(r.repeatCell.cell.userEnteredFormat.numberFormat.pattern, 'dddd d "de" mmmm')
})

test('ningún rango de formato es de alto o ancho cero: uno solo tumba el lote entero', () => {
  for (const [meta, tipo] of [[agenda().meta, 'dia'], [mensual().meta, 'mes']]) {
    for (const r of pielBloques({ sheetId: 7, meta, tipo })) {
      const rango = r.repeatCell?.range ?? r.updateBorders?.range
      if (!rango) continue
      assert.ok(rango.endRowIndex > rango.startRowIndex, JSON.stringify(rango))
      assert.ok(rango.endColumnIndex > rango.startColumnIndex, JSON.stringify(rango))
    }
  }
})

test('los gráficos leen la zona auxiliar CON SHOW_ALL: si no, salen vacíos y no dan error', () => {
  const m = mensual().meta
  const g = graficoRealProyectado(7, { aux: m.aux })
  assert.equal(g.addChart.chart.spec.hiddenDimensionStrategy, 'SHOW_ALL')
  const dominio = g.addChart.chart.spec.basicChart.domains[0].domain.sourceRange.sources[0]
  assert.equal(dominio.startRowIndex, m.aux.fila0 - 1)
  assert.equal(dominio.endRowIndex, m.aux.fila1)
  assert.equal(dominio.startColumnIndex, m.aux.col.fecha)
})

test('el plan dice qué se puede dibujar en cada vista, y por qué no lo otro', () => {
  const m = mensual().meta
  const plan = planDeGraficosBloques({ aux: m.aux })
  assert.deepEqual(plan.dibujables.map((d) => d.clave), ['realProyectado', 'entradasSalidas', 'tendencia'])
  assert.deepEqual(plan.omitidos.map((o) => o.clave), ['liquidezSemanal'])
  const a = agenda().meta
  const planSem = planDeGraficosBloques({ auxSemanas: { ...a.aux.semanas, col: a.aux.col } })
  assert.deepEqual(planSem.dibujables.map((d) => d.clave), ['liquidezSemanal'])
})

test('se borran los gráficos viejos ANTES de dibujar: addChart apila', async () => {
  const a = agenda().meta
  const google = {
    getCharts: async () => [{ sheetId: 7, title: 'Cash Flow Semanal', charts: [{ chartId: 11, title: 'viejo' }, { chartId: 12, title: 'otro' }] }],
  }
  const req = await requestsDeGraficosBloques(google, 'F', 7, { auxSemanas: { ...a.aux.semanas, col: a.aux.col } }, 'Cash Flow Semanal')
  assert.deepEqual(req.slice(0, 2).map((r) => r.deleteEmbeddedObject.objectId), [11, 12])
  assert.ok(req[2].addChart)
})

test('si no se pueden leer los gráficos existentes, NO se dibuja: dibujar sin borrar los apila', async () => {
  const a = agenda().meta
  const google = { getCharts: async () => { throw new Error('429') } }
  const req = await requestsDeGraficosBloques(google, 'F', 7, { auxSemanas: { ...a.aux.semanas, col: a.aux.col } }, 'X')
  assert.deepEqual(req, [])
})
