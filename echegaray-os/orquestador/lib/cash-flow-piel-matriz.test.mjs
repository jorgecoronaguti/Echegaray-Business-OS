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
  ALTO_FILA, tandasDeGrupos, desocultarFootprint, NIVELES_DE_GRUPO, reglaPeriodoEnCurso, EN_CURSO,
} from './cash-flow-piel-matriz.mjs'
import {
  planDeGraficosMatriz, requestsDeGraficosMatriz, graficoLiquidezSemanal,
  graficoEntradasSalidas, graficoTendencia, MARCA,
} from './cash-flow-graficos.mjs'
import { grillaSemanal } from './cash-flow-semanas.mjs'
import { grillaMeses } from './cash-flow-meses.mjs'
import { footprintDe, GRAFICO } from './cash-flow-matriz.mjs'

const HOY = new Date(Date.UTC(2026, 7, 5))
const REFS = { saldo: 'CAJA_TOTAL_DISPONIBLE', fecha: 'CAJA_FECHA_SALDO', minima: 'CAJA_MINIMA' }
const semanal = () => grillaSemanal({ hoy: HOY, anio: 2026, refs: REFS }).meta
const mensual = () => grillaMeses({ anio: 2026, refs: REFS }).meta
const FP_SEMANA = footprintDe('semana', 2026)

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
  const cols = req.filter((r) => r.updateDimensionProperties?.range.dimension === 'COLUMNS'
    && r.updateDimensionProperties.fields === 'pixelSize')
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
  // `?.`: la regla del período en curso pinta FONDO, no tinta — no tiene textFormat y no compite acá.
  const rojas = req.filter((r) => r.addConditionalFormatRule.rule.booleanRule.format.textFormat?.foregroundColor === DEFICIT)
  assert.equal(rojas.length, 1)
  assert.ok(rojas[0].addConditionalFormatRule.rule.booleanRule.condition.values[0].userEnteredValue.includes('<0'))
  const ambar = req.find((r) => r.addConditionalFormatRule.rule.booleanRule.format.textFormat?.foregroundColor === AVISO)
  const f = ambar.addConditionalFormatRule.rule.booleanRule.condition.values[0].userEnteredValue
  // Un mes anterior al corte va VACÍO y N("") vale 0: sin la guarda, el aviso pintaría todo lo vacío.
  assert.ok(f.includes('<>""'), f)
  // El rango con nombre va envuelto en INDIRECT: una CUSTOM_FORMULA no acepta nombres y la API
  // devuelve 400 INVALID_ARGUMENT.
  assert.ok(f.includes('INDIRECT("CAJA_MINIMA")'), f)
})

test('sin caja mínima definida se marca el déficit igual: el piso es opcional, el cero no', () => {
  // Sólo las reglas de TINTA: la del período en curso pinta fondo y va siempre, con caja mínima o sin ella.
  const deTinta = (req) => req.filter((r) => r.addConditionalFormatRule.rule.booleanRule.format.textFormat)
  assert.equal(deTinta(reglasCondicionales({ sheetId: 7, meta: semanal(), refMinima: null })).length, 2,
    'saldo final bajo cero y resultado negativo')
  assert.equal(deTinta(reglasCondicionales({ sheetId: 7, meta: mensual(), refMinima: null })).length, 4,
    'y en el mensual, las dos variaciones')
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// EL DEFECTO QUE SEÑALÓ EL DUEÑO: "están marcando mal la semana actual"
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
// Medido en el archivo vivo el 13/08/2026: las 53 columnas de semana salían idénticas. No había marca
// del período en curso NI regla que la produjera. Si se saca `reglaPeriodoEnCurso`, estos tres se ponen
// rojos.

test('la columna del período en curso se marca, y la ventana es la MISMA que suma la columna', () => {
  const sem = reglaPeriodoEnCurso({ sheetId: 7, meta: semanal() })
  assert.equal(sem.length, 1, 'una sola regla: la marca es un tono, no un juego de reglas')
  const fSem = sem[0].addConditionalFormatRule.rule.booleanRule.condition.values[0].userEnteredValue
  // Semi-abierta [lunes, lunes+7): con `<=` del lado derecho el lunes siguiente caería en dos semanas.
  assert.ok(fSem.includes('+7>TODAY()'), fSem)
  assert.ok(fSem.includes('<=TODAY()'), fSem)

  const mes = reglaPeriodoEnCurso({ sheetId: 7, meta: mensual() })
  const fMes = mes[0].addConditionalFormatRule.rule.booleanRule.condition.values[0].userEnteredValue
  // El mes NO usa +7: usa su propio fin de mes. Un mes marcado con la ventana de la semana marcaría
  // los primeros siete días de cada mes y nada más.
  assert.ok(fMes.includes('EOMONTH'), fMes)
  assert.ok(!fMes.includes('+7'), fMes)
})

test('la marca es de FONDO y sale de una FÓRMULA: no compite con el rojo y no envejece', () => {
  const [r] = reglaPeriodoEnCurso({ sheetId: 7, meta: semanal() })
  const regla = r.addConditionalFormatRule.rule
  assert.equal(regla.booleanRule.condition.type, 'CUSTOM_FORMULA',
    'pintar por coordenada deja la marca en la semana equivocada el día que el pipeline no corre')
  assert.deepEqual(regla.booleanRule.format.backgroundColor, EN_CURSO)
  assert.equal(regla.booleanRule.format.textFormat, undefined, 'la tinta es del déficit, no de la marca')
})

test('la marca ESTÁ en el juego de reglas que se escribe: una regla que nadie manda no pinta nada', () => {
  // Sin esto, alguien puede sacar la llamada de `reglasCondicionales` y la función seguiría probada
  // sola — el defecto que el dueño vio (53 columnas idénticas) volvería con todos los tests en verde.
  for (const meta of [semanal(), mensual()]) {
    const req = reglasCondicionales({ sheetId: 7, meta, refMinima: 'CAJA_MINIMA' })
    const marca = req.filter((r) => {
      const c = r.addConditionalFormatRule.rule.booleanRule.format.backgroundColor
      return c && c.red === EN_CURSO.red && c.green === EN_CURSO.green && c.blue === EN_CURSO.blue
    })
    assert.equal(marca.length, 1, `${meta.tipo}: la columna del período en curso no se marca`)
  }
})

test('la marca no alcanza la columna TOTAL: un total no es un período y no puede ser "hoy"', () => {
  const meta = semanal()
  const [r] = reglaPeriodoEnCurso({ sheetId: 7, meta })
  const rango = r.addConditionalFormatRule.rule.ranges[0]
  assert.equal(rango.startColumnIndex, meta.cab.col0)
  assert.equal(rango.endColumnIndex, meta.cab.colTotal, 'la columna TOTAL queda fuera de la marca')
  assert.equal(rango.startRowIndex, meta.cab.fila - 1, 'arranca en el encabezado: la fecha también se marca')
  assert.equal(rango.endRowIndex, meta.fila.saldoFinal, 'termina en el saldo final, la fila que decide')
})

test('borrar las reglas viejas va de atrás para adelante: al revés se corren los índices', () => {
  assert.deepEqual(borrarCondicionales(7, 3).map((r) => r.deleteConditionalFormatRule.index), [2, 1, 0])
  assert.deepEqual(borrarCondicionales(7, 0), [])
})

test('la hoja se ACHICA al footprint: 220×65 para mostrar 15 columnas es lo que se vino a sacar', () => {
  const req = achicarHoja(7, { filas: 220, cols: 65 }, FP_SEMANA)
  assert.equal(req.length, 2)
  assert.deepEqual(req[0].deleteDimension.range, { sheetId: 7, dimension: 'ROWS', startIndex: FP_SEMANA.filas, endIndex: 220 })
  assert.deepEqual(req[1].deleteDimension.range, { sheetId: 7, dimension: 'COLUMNS', startIndex: FP_SEMANA.cols, endIndex: 65 })
  // Y no borra nada si ya está en medida: un deleteDimension de rango vacío devuelve 400.
  assert.deepEqual(achicarHoja(7, { filas: FP_SEMANA.filas, cols: FP_SEMANA.cols }, FP_SEMANA), [])
})

test('LOS GRUPOS HEREDADOS SE BORRAN HASTA VACIAR, y en tandas por dimensión', () => {
  // El defecto: un grupo colapsado del layout viejo dejó las filas 8 a 13 del Mensual INVISIBLES —la
  // matriz entera tapada— y el generador la siguió escribiendo y formateando sin decir nada.
  const tandas = tandasDeGrupos(7, FP_SEMANA)
  assert.equal(tandas.length, 2, 'una tanda por dimensión: el error de las filas no puede frenar las columnas')
  assert.deepEqual(tandas.map((t) => t.length), [NIVELES_DE_GRUPO, NIVELES_DE_GRUPO])
  assert.deepEqual(tandas[0][0].deleteDimensionGroup.range,
    { sheetId: 7, dimension: 'ROWS', startIndex: 0, endIndex: FP_SEMANA.filas })
  assert.deepEqual(tandas[1][0].deleteDimensionGroup.range,
    { sheetId: 7, dimension: 'COLUMNS', startIndex: 0, endIndex: FP_SEMANA.cols })
  // Cada request va SOLO en su lote: borrar un grupo que no existe devuelve 400 y tumbaría el formato.
  for (const t of tandas) for (const r of t) assert.deepEqual(Object.keys(r), ['deleteDimensionGroup'])
  assert.deepEqual(tandasDeGrupos(7, { filas: 0, cols: 0 }), [])
})

test('el footprint entero se DESOCULTA antes de formatear, y con alto uniforme', () => {
  const meta = semanal()
  const req = pielMatriz({ sheetId: 7, meta })
  const unhide = req.filter((r) => r.updateDimensionProperties?.fields === 'hiddenByUser')
  assert.equal(unhide.length, 2, 'filas y columnas')
  assert.deepEqual(unhide.map((r) => r.updateDimensionProperties.range.dimension), ['ROWS', 'COLUMNS'])
  for (const r of unhide) assert.equal(r.updateDimensionProperties.properties.hiddenByUser, false)
  // VAN PRIMERAS: formatear lo invisible es exactamente el defecto que se pagó.
  assert.equal(req.indexOf(unhide[0]), 0)
  assert.deepEqual(desocultarFootprint(7, { filas: 0, cols: 0 }), [])
  // Y el alto se resetea en TODO el footprint: una fila de 42px heredada parte la matriz en dos tablas.
  const altos = req.find((r) => r.updateDimensionProperties?.range.dimension === 'ROWS'
    && r.updateDimensionProperties.fields === 'pixelSize')
  assert.equal(altos.updateDimensionProperties.properties.pixelSize, ALTO_FILA)
  assert.equal(altos.updateDimensionProperties.range.endIndex, meta.footprint.filas)
})

test('LA PIEL DE LA MATRIZ: encabezado pintado, subtotales en negrita, sub-líneas con sangría', () => {
  const meta = semanal()
  const req = pielMatriz({ sheetId: 7, meta })
  const deFila = (f, extra = () => true) => req.filter((r) => r.repeatCell?.range?.startRowIndex === f - 1
    && r.repeatCell.range.endRowIndex === f && extra(r))
  // 1. El encabezado tiene FONDO: sin banda, con 53 columnas la fila de fechas se pierde.
  const cab = deFila(meta.cab.fila, (r) => r.repeatCell.cell.userEnteredFormat?.backgroundColor)
  assert.equal(cab.length, 1)
  assert.equal(cab[0].repeatCell.cell.userEnteredFormat.textFormat.bold, true)
  // 2. Resultado y Saldo final en NEGRITA, y el saldo final con borde superior: es la línea de cierre.
  for (const f of [meta.fila.resultado, meta.fila.saldoFinal]) {
    assert.ok(deFila(f, (r) => r.repeatCell.cell.userEnteredFormat?.textFormat?.bold === true).length,
      `la fila ${f} tiene que ir en negrita`)
    assert.ok(req.some((r) => r.updateBorders?.range.startRowIndex === f - 1 && r.updateBorders.top),
      `la fila ${f} tiene que llevar la regla fina arriba`)
  }
  // 3. Los cuatro subtotales en negrita y sus sub-líneas SIN negrita: la jerarquía la hace el peso.
  for (const b of meta.bloques) {
    assert.ok(deFila(b.subtotal, (r) => r.repeatCell.cell.userEnteredFormat?.textFormat?.bold === true).length,
      `${b.clave}: el subtotal tiene que ir en negrita o se pierde adentro de su propia apertura`)
    const subs = req.filter((r) => r.repeatCell?.range?.startRowIndex === b.primeraSub - 1
      && r.repeatCell.range.endRowIndex === b.ultimaSub)
    assert.equal(subs.length, 1, `${b.clave}: las sub-líneas se formatean como un rango contiguo`)
    assert.equal(subs[0].repeatCell.cell.userEnteredFormat.textFormat.bold, false)
  }
})

test('el gráfico del semanal se ancla DEBAJO del cuadro, en la columna B, y entra en la hoja', () => {
  const meta = semanal()
  const g = graficoLiquidezSemanal(7, meta)
  const serie = g.addChart.chart.spec.basicChart.series[0].series.sourceRange.sources[0]
  assert.equal(serie.startRowIndex, meta.fila.saldoFinal - 1, 'lee la FILA de saldo final de la matriz')
  assert.equal(serie.endRowIndex, meta.fila.saldoFinal)
  assert.equal(serie.startColumnIndex, meta.cab.col0)
  assert.equal(serie.endColumnIndex, meta.cab.col0 + meta.cab.n, 'la fila ENTERA: las semanas en blanco son huecos, no un corte')
  const dominio = g.addChart.chart.spec.basicChart.domains[0].domain.sourceRange.sources[0]
  assert.equal(dominio.startRowIndex, meta.cab.fila - 1, 'el eje son los encabezados de tiempo')
  const pos = g.addChart.chart.position.overlayPosition
  assert.equal(pos.anchorCell.columnIndex, GRAFICO.col0, 'en la columna B: contra la A no respira')
  assert.equal(pos.anchorCell.rowIndex, meta.grafico.fila - 1)
  assert.equal(pos.anchorCell.rowIndex, meta.filaFin + 1, 'dos renglones de aire debajo del cuadro')
  assert.equal(pos.widthPixels, GRAFICO.cols.semana * ANCHOS.tiempo)
  assert.equal(pos.heightPixels, GRAFICO.filas * ALTO_FILA)
  // Y TERMINA DENTRO DE LA HOJA: si el achique lo amputara, el gráfico desaparece en cada corrida.
  assert.ok(pos.anchorCell.rowIndex + GRAFICO.filas <= meta.footprint.filas)
})

test('los dos del mensual van LADO A LADO, con una columna de aire, y sin salirse del footprint', () => {
  const meta = mensual()
  const a = graficoEntradasSalidas(7, meta).addChart.chart.position.overlayPosition
  const b = graficoTendencia(7, meta).addChart.chart.position.overlayPosition
  assert.equal(a.anchorCell.rowIndex, b.anchorCell.rowIndex, 'a la misma altura: se comparan de un vistazo')
  assert.equal(a.anchorCell.columnIndex, GRAFICO.col0)
  assert.equal(b.anchorCell.columnIndex, GRAFICO.col0 + GRAFICO.cols.mes + GRAFICO.aire)
  for (const p of [a, b]) {
    assert.equal(p.widthPixels, GRAFICO.cols.mes * ANCHOS.tiempo)
    assert.ok(p.anchorCell.rowIndex + GRAFICO.filas <= meta.footprint.filas)
  }
  // El segundo termina dentro del ancho de la hoja: un ancla fuera del grid devuelve 400.
  assert.ok(b.anchorCell.columnIndex + GRAFICO.cols.mes <= meta.footprint.cols)
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
