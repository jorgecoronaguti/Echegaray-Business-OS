#!/usr/bin/env node
// Rehace la pestaña Estructura: un cuadro, sin detalle, con la proyección ADENTRO.
//
// "La proyección de gastos de estructura la quiero en el mismo cuadro, no así como en la captura" —
// la versión anterior tenía la proyección apilada en una columna al final, separada de los meses.
// Ahora cada mes de agosto a diciembre muestra su proyección en la misma fila y la misma columna
// donde estaría el real, con fondo distinto para que no se confunda jamás un estimado con un hecho.
//
// TAMBIÉN SACA UNA DUPLICACIÓN. La pestaña tenía su PROPIO clasificador: repetía a mano toda la
// lógica de "esto no es nómina, no es gremial, no es recurrente, es unidad de negocio Estructura".
// Esa regla ya vive en la columna "Rubro de caja" de Compras. Acá ahora sólo se sub-clasifica lo
// que Compras ya marcó como Estructura — una definición, no dos que se pueden desincronizar.
//
// LA REGLA DE PROYECCIÓN, y por qué es ésa. Sólo se proyecta un rubro que apareció en 4 meses o
// más. Sin ese filtro, la compra de una moto ($4.352.000, una vez en enero) se proyectaba todos los
// meses y la estructura del año daba $120,8M contra $33M reales. Un gasto que pasó una vez no es
// una tendencia. El monto proyectado es el promedio de los meses en que SÍ hubo gasto, ajustado por
// la inflación de Parámetros (REM del BCRA, que el OS actualiza solo).
//
//   node orquestador/scripts/estructura-pestana.mjs [--dry]

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { SUBRUBROS, OTROS } from '../lib/sub-rubro-estructura.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const PESTAÑA = 'Estructura'
const DRY = process.argv.includes('--dry')
const AÑO = 2026
const MIN_MESES = 4 // menos que esto no es una tendencia, es un gasto suelto

const letra = (i) => { let s = ''; for (let n = i; n >= 0; n = Math.floor(n / 26) - 1) s = String.fromCharCode(65 + (n % 26)) + s; return s }

// Los sub-rubros viven en la lib: el auditor de reglas de oro necesita la lista para verificar que
// ninguna fórmula use un sub-rubro que la definición única no conoce, y no puede importar un script.


// Columnas. Visible: A + 12 meses + 4 de totales. Auxiliar (oculta): el real de cada mes, que es de
// donde sale la proyección — sin separarlo, la fórmula de un mes se leería a sí misma (#REF!).
const C_MES0 = 1, C_TOTREAL = 13, C_PROY = 14, C_TOTAL = 15, C_PCT = 16
const C_AUX0 = 18            // S..AD: el real de los 12 meses
const C_NMESES = 30          // AE: en cuántos meses hubo gasto
const ANCHO = 32

const FILA_CAB = 6
// El sub-rubro vive en COMPRAS (columna AF), no acá. SUMIFS devuelve #VALUE! cuando el rango a
// sumar está en una pestaña y los criterios en otra — ya me pasó dos veces en esta planilla. Con
// todos los rangos en Compras funciona, y encima es la misma disciplina que el rubro y la familia:
// una sola columna que define el dato, en el lugar donde vive el dato.
const rangoSub = 'Compras!$AF$4:$AF'
const rangoFecha = 'Compras!$AD$4:$AD'
const COL_SUB_COMPRAS = 31   // AF

function grilla() {
  const rubros = [...SUBRUBROS.map(([n]) => n), OTROS]
  const filas = []
  const push = (c) => { filas.push(c); return filas.length }
  const vacia = () => Array(ANCHO).fill('')

  const t = vacia(); t[0] = 'GASTOS DE ESTRUCTURA — lo que cuesta que la empresa exista, independientemente de las obras'; push(t)
  const s = vacia()
  s[0] = `Sale de Compras, rubro "Estructura" (columna AC). De agosto en adelante son PROYECCIONES: promedio de los meses con gasto, ajustado por la inflación de Parámetros. Sólo se proyecta lo que apareció en ${MIN_MESES} meses o más.`
  push(s)
  push(vacia()); push(vacia()); push(vacia())

  const cab = vacia()
  cab[0] = 'Rubro'
  for (let m = 0; m < 12; m++) cab[C_MES0 + m] = `1/${m + 1}/${AÑO}`
  cab[C_TOTREAL] = 'Total real'
  cab[C_PROY] = 'Proyectado'
  cab[C_TOTAL] = `Total ${AÑO}`
  cab[C_PCT] = '% del total'
  cab[C_AUX0] = 'AUXILIAR — el real de cada mes. De acá sale la proyección. No borrar ni mostrar.'
  push(cab)

  const f0 = filas.length + 1
  for (const r of rubros) {
    const f = filas.length + 1
    const fila = vacia()
    fila[0] = r
    for (let m = 0; m < 12; m++) {
      const cm = letra(C_MES0 + m), ca = letra(C_AUX0 + m)
      // El real del mes, contra Compras.
      fila[C_AUX0 + m] = `=SUMIFS(Compras!$O$4:$O;${rangoSub};$A${f};${rangoFecha};">="&${cm}$${FILA_CAB};${rangoFecha};"<"&EOMONTH(${cm}$${FILA_CAB};0)+1)`
      // Lo que se ve: el real si lo hay; si no, la proyección (o nada si el rubro no es recurrente).
      fila[C_MES0 + m] = `=IF(${ca}${f}<>0;${ca}${f};IF($${letra(C_NMESES)}${f}<${MIN_MESES};0;$${letra(C_TOTREAL)}${f}/$${letra(C_NMESES)}${f}*IFERROR(INDEX(Parámetros!$C$74:$C$90;MATCH(EOMONTH(${cm}$${FILA_CAB};0);ARRAYFORMULA(EOMONTH(Parámetros!$A$74:$A$90;0));0));1)))`
    }
    fila[C_NMESES] = `=COUNTIF($${letra(C_AUX0)}${f}:$${letra(C_AUX0 + 11)}${f};"<>0")`
    fila[C_TOTREAL] = `=SUM($${letra(C_AUX0)}${f}:$${letra(C_AUX0 + 11)}${f})`
    fila[C_TOTAL] = `=SUM($${letra(C_MES0)}${f}:$${letra(C_MES0 + 11)}${f})`
    fila[C_PROY] = `=$${letra(C_TOTAL)}${f}-$${letra(C_TOTREAL)}${f}`
    fila[C_PCT] = `=IFERROR($${letra(C_TOTAL)}${f}/$${letra(C_TOTAL)}$TOT;0)`
    push(fila)
  }
  const f1 = filas.length
  const tot = vacia()
  tot[0] = 'TOTAL ESTRUCTURA'
  for (const c of [...Array(12).keys()].map((m) => C_MES0 + m).concat([C_TOTREAL, C_PROY, C_TOTAL])) {
    tot[c] = `=SUM(${letra(c)}${f0}:${letra(c)}${f1})`
  }
  const fTot = push(tot)

  push(vacia())
  const c1 = vacia()
  c1[0] = 'CONTROL — que este cuadro sea exactamente el rubro Estructura de Compras'
  push(c1)
  const c2 = vacia(); c2[0] = 'Estructura según Compras'; c2[1] = '=SUMIF(Compras!$AC$4:$AC;"Estructura";Compras!$O$4:$O)'
  c2[3] = 'Es la misma línea del Cash Flow Mensual.'
  const fc = push(c2)
  const c3 = vacia(); c3[0] = '⇒ Diferencia (debe ser $0)'; c3[1] = `=$B${fc}-$${letra(C_TOTREAL)}${fTot}`
  c3[3] = 'Distinto de cero = hay gastos de estructura que este cuadro no está mirando.'
  push(c3)
  const c4 = vacia(); c4[0] = `Rubros no proyectados (< ${MIN_MESES} meses)`
  c4[1] = `=COUNTIFS($${letra(C_NMESES)}${f0}:$${letra(C_NMESES)}${f1};"<${MIN_MESES}";$${letra(C_TOTREAL)}${f0}:$${letra(C_TOTREAL)}${f1};">0")`
  c4[3] = 'Un gasto que pasó una o dos veces no es una tendencia. Proyectarlo infló el año a $120,8M contra $33M reales.'
  push(c4)

  const resuelto = filas.map((f) => f.map((c) => (typeof c === 'string' ? c.replaceAll('$TOT', String(fTot)) : c)))
  return { filas: resuelto, f0, f1, fTot, fCtrl: fc, rubros }
}

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  const g = grilla()
  console.log(`${PESTAÑA}: ${g.filas.length} filas x ${ANCHO} columnas · rubros ${g.f0}-${g.f1} · total ${g.fTot}`)
  if (DRY) {
    console.log('Ejemplo de celda visible (enero, primer rubro):')
    console.log('  ', g.filas[g.f0 - 1][C_MES0])
    return
  }

  const meta = await google.getSheetMeta(ID)
  const hoja = meta.find((s) => s.title === PESTAÑA)
  const compras = meta.find((s) => s.title === 'Compras')
  const { sheetId } = hoja
  if (hoja.cols < ANCHO) {
    await google.spreadsheetBatchUpdate(ID, [{ appendDimension: { sheetId, dimension: 'COLUMNS', length: ANCHO - hoja.cols } }])
  }

  // El sub-rubro, en Compras, colgado del rubro que Compras ya definió.
  const texto = 'LOWER(Compras!$K$4:$K&" "&Compras!$L$4:$L&" "&Compras!$E$4:$E)'
  let sub = `"${OTROS}"`
  for (const [n, p] of [...SUBRUBROS].reverse()) sub = `IF(REGEXMATCH(${texto};"${p}");"${n}";${sub})`
  const fSub = `=ARRAYFORMULA(IF(Compras!$AC$4:$AC<>"Estructura";"";${sub}))`
  const reqC = []
  if (compras.cols < COL_SUB_COMPRAS + 1) {
    reqC.push({ appendDimension: { sheetId: compras.sheetId, dimension: 'COLUMNS', length: COL_SUB_COMPRAS + 1 - compras.cols } })
  }
  reqC.push({
    updateCells: {
      range: { sheetId: compras.sheetId, startRowIndex: 2, endRowIndex: 4, startColumnIndex: COL_SUB_COMPRAS, endColumnIndex: COL_SUB_COMPRAS + 1 },
      rows: [
        { values: [{ userEnteredValue: { stringValue: 'Sub-rubro de estructura' }, userEnteredFormat: { backgroundColor: { red: 0.17, green: 0.25, blue: 0.37 }, textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } } } }] },
        { values: [{ userEnteredValue: { formulaValue: fSub } }] },
      ],
      fields: 'userEnteredValue,userEnteredFormat',
    },
  })
  reqC.push({ updateDimensionProperties: { range: { sheetId: compras.sheetId, dimension: 'COLUMNS', startIndex: COL_SUB_COMPRAS, endIndex: COL_SUB_COMPRAS + 1 }, properties: { pixelSize: 200 }, fields: 'pixelSize' } })
  await google.spreadsheetBatchUpdate(ID, reqC)

  await google.clearValues(ID, `${PESTAÑA}!A1:${letra(ANCHO - 1)}200`)
  await google.batchUpdateValues(ID, [
    { range: `${PESTAÑA}!A1:${letra(ANCHO - 1)}${g.filas.length}`, values: g.filas },
  ])
  await formatear(google, sheetId, g)

  const v = await google.readSheetValues(ID, `${PESTAÑA}!A1:${letra(C_PCT)}${g.filas.length}`)
  const err = []
  v.forEach((f, i) => (f || []).forEach((c, j) => { if (/^#(REF|ERROR|N\/A|VALUE|¡|DIV|NAME|NUM|NULL)/.test(String(c ?? ''))) err.push(`${letra(j)}${i + 1}=${c}`) }))
  console.log(err.length ? `\n⚠ ${err.length} celdas en error: ${err.slice(0, 8).join(' ')}` : '\n✓ sin errores')
  console.log('\nRUBRO                                REAL     PROYECTADO      TOTAL AÑO')
  for (let i = g.f0; i <= g.fTot; i++) {
    const f = v[i - 1] || []
    console.log(`${String(f[0] ?? '').slice(0, 32).padEnd(34)}${String(f[C_TOTREAL] ?? '').padStart(12)}${String(f[C_PROY] ?? '').padStart(15)}${String(f[C_TOTAL] ?? '').padStart(15)}`)
  }
  console.log('\nCONTROL:')
  console.log(`  Estructura según Compras   ${v[g.fCtrl - 1]?.[1]}`)
  console.log(`  ⇒ Diferencia               ${v[g.fCtrl]?.[1]}`)
  console.log(`  Rubros sin proyectar       ${v[g.fCtrl + 1]?.[1]}`)
}

async function formatear(google, sheetId, g) {
  const AZUL = { red: 0.17, green: 0.25, blue: 0.37 }
  const AMBAR = { red: 1, green: 0.97, blue: 0.88 } // el fondo de lo proyectado
  const r = (r0, r1, c0 = 0, c1 = ANCHO) => ({ sheetId, startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1 })
  const req = [{ unmergeCells: { range: r(0, g.filas.length) } }]
  const fmt = (rg, fields, format) => req.push({ repeatCell: { range: rg, cell: { userEnteredFormat: format }, fields } })

  fmt(r(0, g.filas.length, 1), 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment',
    { numberFormat: { type: 'CURRENCY', pattern: '"$"#,##0;[Red]-"$"#,##0;"—"' }, horizontalAlignment: 'RIGHT' })
  fmt(r(0, 1), 'userEnteredFormat.textFormat', { textFormat: { bold: true, fontSize: 13 } })
  fmt(r(1, 2), 'userEnteredFormat.textFormat,userEnteredFormat.wrapStrategy',
    { textFormat: { italic: true, fontSize: 9, foregroundColor: { red: 0.4, green: 0.4, blue: 0.45 } }, wrapStrategy: 'WRAP' })
  fmt(r(FILA_CAB - 1, FILA_CAB), 'userEnteredFormat',
    { backgroundColor: AZUL, textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 }, fontSize: 9 }, horizontalAlignment: 'CENTER', wrapStrategy: 'WRAP' })
  fmt({ ...r(FILA_CAB - 1, FILA_CAB), startColumnIndex: C_MES0, endColumnIndex: C_MES0 + 12 },
    'userEnteredFormat.numberFormat', { numberFormat: { type: 'DATE', pattern: 'mmm' } })
  // Los meses proyectados con fondo ámbar: un estimado no se puede confundir con un hecho.
  // Agosto es el primer mes proyectado (índice 7 de los 12).
  fmt({ ...r(g.f0 - 1, g.fTot), startColumnIndex: C_MES0 + 7, endColumnIndex: C_MES0 + 12 },
    'userEnteredFormat.backgroundColor,userEnteredFormat.textFormat',
    { backgroundColor: AMBAR, textFormat: { italic: true } })
  fmt({ ...r(g.f0 - 1, g.fTot + 1), startColumnIndex: C_PROY, endColumnIndex: C_PROY + 1 },
    'userEnteredFormat.backgroundColor,userEnteredFormat.textFormat', { backgroundColor: AMBAR, textFormat: { italic: true } })
  fmt(r(g.fTot - 1, g.fTot), 'userEnteredFormat.textFormat,userEnteredFormat.backgroundColor',
    { textFormat: { bold: true }, backgroundColor: { red: 0.89, green: 0.91, blue: 0.94 } })
  fmt({ ...r(g.f0 - 1, g.fTot), startColumnIndex: C_PCT, endColumnIndex: C_PCT + 1 },
    'userEnteredFormat.numberFormat', { numberFormat: { type: 'PERCENT', pattern: '0.0%' } })
  // El bloque de control: la columna D lleva la explicación, no plata.
  fmt({ ...r(g.fCtrl - 2, g.filas.length), startColumnIndex: 2, endColumnIndex: ANCHO },
    'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment,userEnteredFormat.textFormat',
    { numberFormat: { type: 'TEXT' }, horizontalAlignment: 'LEFT', textFormat: { fontSize: 9, italic: true } })
  fmt(r(g.fCtrl - 2, g.fCtrl - 1), 'userEnteredFormat.textFormat', { textFormat: { bold: true, fontSize: 11 } })
  fmt(r(g.fCtrl, g.fCtrl + 1), 'userEnteredFormat.textFormat', { textFormat: { bold: true } })
  fmt({ ...r(g.fCtrl + 1, g.fCtrl + 2), startColumnIndex: 1, endColumnIndex: 2 },
    'userEnteredFormat.numberFormat', { numberFormat: { type: 'NUMBER', pattern: '0' } })

  req.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 250 }, fields: 'pixelSize' } })
  req.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 1, endIndex: C_PCT + 1 }, properties: { pixelSize: 100 }, fields: 'pixelSize' } })
  // Las auxiliares se ocultan: el dueño pidió "no quiero el detalle de nada".
  req.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: C_PCT + 1, endIndex: ANCHO }, properties: { hiddenByUser: true }, fields: 'hiddenByUser' } })
  req.push({ updateSheetProperties: { properties: { sheetId, gridProperties: { frozenRowCount: FILA_CAB, frozenColumnCount: 1 } }, fields: 'gridProperties.frozenRowCount,gridProperties.frozenColumnCount' } })
  await google.spreadsheetBatchUpdate(ID, req)
}

main().catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
