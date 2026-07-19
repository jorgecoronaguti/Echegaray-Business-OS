#!/usr/bin/env node
// Test de parseo del dashboard P&L. Hermético, 0 DB, 0 API. Filas calcadas del layout real.
import { parseMonto, parsePct, parsePyL, indiceMes, pyLDePeriodo } from './pyl.mjs'

let ok = 0, fail = 0
const check = (n, c) => { if (c) ok++; else { fail++; console.error(`FALLA: ${n}`) } }

// parseMonto — formatos es-AR reales del Sheet
check('$ 50.000.000 → 50000000', parseMonto(' $ 50.000.000 ') === 50000000)
check('$ - → 0', parseMonto(' $ -    ') === 0)
check('negativo $ -5.368.507', parseMonto(' $ -5.368.507 ') === -5368507)
check('con decimal $44.664,00', parseMonto('$44.664,00') === 44664)
check('vacío/null → 0', parseMonto(null) === 0 && parseMonto('') === 0)
check('paréntesis negativo', parseMonto('($ 1.000)') === -1000)

// parsePct
check('34,0% → 34', parsePct('34,0%') === 34)
check('pct vacío → null', parsePct('') === null)
check('(20,5%) paréntesis → -20,5', parsePct('(20,5%)') === -20.5)

// parsePyL — layout real (fila 4 header, filas de datos con etiqueta + 12 meses + Total)
const M = (v) => ` $ ${v} `
const filas = [
  ['Dashboard P&L mensual'],
  [], [],
  ['', 'ene-26', 'feb-26', 'mar-26', 'abr-26', 'may-26', 'jun-26', 'jul-26', 'ago-26', 'sept-26', 'oct-26', 'nov-26', 'dic-26', 'Total 2026'],
  ['Ingresos Civil', M('50.000.000'), M('30.000.000'), M('49.586.777'), M('12.396.694'), M('46.700.000'), M('50.000.000'), M('107.232.162'), M('70.649.367'), M('40.703.867'), M('25.782.554'), M('13.702.500'), M('13.702.500'), M('510.456.421')],
  ['Ingresos Mantenimiento', M('13.970.000'), M('37.452.462'), M('16.366.116'), M('13.790.000'), M('3.210.000'), ' $ - ', M('3.583.956'), M('7.000.000'), M('7.000.000'), M('7.000.000'), M('7.000.000'), M('7.000.000'), M('123.372.534')],
  ['Total Ingresos', M('63.970.000'), M('67.452.462'), M('65.952.893'), M('26.186.694'), M('49.910.000'), M('50.000.000'), M('110.816.118'), M('77.649.367'), M('47.703.867'), M('32.782.554'), M('20.702.500'), M('20.702.500'), M('633.828.955')],
  [],
  ['Costos Directos Civil', M('40.653.228'), M('14.977.364'), M('14.573.938'), M('17.740.245'), M('11.999.738'), M('32.732.421'), M('29.571.655'), M('28.682.167'), M('11.218.196'), M('6.829.575'), M('4.030.147'), M('4.030.147'), M('217.038.822')],
  ['Costos Directos Mantenimiento', M('1.594.253'), M('2.101.011'), M('676.963'), ' $ - ', ' $ - ', M('1.556.841'), M('1.075.187'), M('1.400.000'), M('1.400.000'), M('1.400.000'), M('1.400.000'), M('1.400.000'), M('14.004.255')],
  ['Total Costos Directos', M('42.247.481'), M('17.078.375'), M('15.250.902'), M('17.740.245'), M('11.999.738'), M('34.289.262'), M('30.646.841'), M('30.082.167'), M('12.618.196'), M('8.229.575'), M('5.430.147'), M('5.430.147'), M('231.043.076')],
  [],
  ['Margen Bruto', M('21.722.519'), M('50.374.087'), M('50.701.991'), M('8.446.449'), M('37.910.262'), M('15.710.738'), M('80.169.276'), M('47.567.200'), M('35.085.671'), M('24.552.980'), M('15.272.353'), M('15.272.353'), M('402.785.879')],
  ['Margen Bruto %', '34,0%', '74,7%', '76,9%', '32,3%', '76,0%', '31,4%', '72,3%', '61,3%', '73,5%', '74,9%', '73,8%', '73,8%', '63,5%'],
  [],
  ['Gastos generales (Estructura, Administrativos)', M('8.649.586'), M('8.637.828'), M('5.269.019'), M('6.503.672'), M('7.573.438'), M('10.035.868'), M('11.347.269'), M('12.606.061'), M('5.454.545'), M('5.454.545'), M('5.454.545'), M('10.750.000'), M('97.736.378')],
  ['Cargas sociales y contribuciones (FCL, otros)', M('3.633.557'), M('4.065.323'), M('5.189.513'), M('6.525.684'), M('5.239.327'), M('6.054.136'), M('6.011.649'), M('9.091.508'), M('4.848.485'), M('7.886.437'), M('4.848.485'), M('4.848.485'), M('68.242.589')],
  ['Total Gastos operativos', M('12.283.143'), M('12.703.151'), M('10.458.533'), M('13.029.355'), M('12.812.766'), M('16.090.004'), M('17.358.919'), M('21.697.569'), M('10.303.030'), M('13.340.982'), M('10.303.030'), M('15.598.485'), M('165.978.967')],
  [],
  ['Impuesto a los Ingresos Brutos ', M('1.919.100'), M('2.023.574'), M('1.978.587'), M('785.601'), M('1.497.300'), M('1.500.000'), M('3.324.484'), M('2.329.481'), M('1.431.116'), M('983.477'), M('621.075'), M('621.075'), M('19.014.869')],
  [],
  ['EBITDA', M('7.520.276'), M('35.647.362'), M('38.264.871'), ' $ -5.368.507 ', M('23.600.196'), ' $ -1.879.266 ', M('59.485.874'), M('23.540.151'), M('23.351.525'), M('10.228.520'), M('4.348.248'), ' $ -947.207 ', M('217.792.043')],
  // fila "EBITDA %" REAL debajo de EBITDA — no debe pisar el monto de EBITDA (bug detectado en e2e)
  ['EBITDA %', '11,8%', '52,8%', '58,0%', '(20,5%)', '47,3%', '(3,8%)', '53,7%', '30,3%', '49,0%', '31,2%', '21,0%', '(4,6%)', '27,2%'],
]
const p = parsePyL(filas)
check('12 meses detectados', p.meses.length === 12 && p.meses[0] === 'ene-26' && p.meses[11] === 'dic-26')
check('ingresos total 2026', p.total.ingresos === 633828955)
check('costos directos total', p.total.costos_directos === 231043076)
check('margen bruto total', p.total.margen_bruto === 402785879)
check('margen bruto % total = 63,5', p.total.margen_bruto_pct === 63.5)
check('ebitda total NO pisado por EBITDA %', p.total.ebitda === 217792043)
check('ebitda % total = 27,2 (fila aparte)', p.total.ebitda_pct === 27.2)
check('ebitda % abril negativo (paréntesis)', p.lineas.ebitda_pct.mensual[3] === -20.5)
check('ingresos julio (idx6)', p.lineas.ingresos.mensual[6] === 110816118)
check('ebitda abril negativo', p.lineas.ebitda.mensual[3] === -5368507)
check('iibb capturado', p.total.iibb === 19014869)

// indiceMes + pyLDePeriodo
check('"julio" → idx 6', indiceMes(p.meses, 'julio') === 6)
check('"jul-26" → idx 6', indiceMes(p.meses, 'jul-26') === 6)
check('"septiembre" → idx 8 (header sept-26)', indiceMes(p.meses, 'septiembre') === 8)
check('"acumulado" → -1', indiceMes(p.meses, 'acumulado') === -1)
check('período desconocido → null', indiceMes(p.meses, 'zzz') === null)
const jul = pyLDePeriodo(p, 6)
check('P&L julio: ingresos + margen%', jul.ingresos === 110816118 && jul.margen_bruto_pct === 72.3 && jul.periodo === 'jul-26')
const ytd = pyLDePeriodo(p, -1)
check('P&L acumulado: ebitda', ytd.ebitda === 217792043 && ytd.periodo === 'Total 2026')

console.log(`\npyl.test: ${ok} OK, ${fail} FALLA`)
process.exit(fail ? 1 : 0)
