#!/usr/bin/env node
// Crea/rehace la pestaña "Materiales" — el corte de los $192,6M de materiales de obra.
//
// "De Compras empecemos a trabajar el tema materiales civil y materiales mantenimiento". Son 420
// filas y el bloque de plata más grande después de la gente, y no tenían ninguna pestaña. El único
// dato de QUÉ se compró es texto libre (476 grafías para 736 filas), así que primero hay que
// clasificarlo — eso lo hace familia-material.mjs, en una columna de Compras, igual que el rubro.
//
// LAS TRES PREGUNTAS QUE LA PESTAÑA CONTESTA, y por qué son ésas:
//   1. ¿En qué se va la plata? (familia × mes) → es la unidad en la que se cotiza; sin esto no se
//      puede contrastar el real contra el presupuesto de la obra.
//   2. ¿En qué obra? (familia × obra) → una familia que se dispara en una sola obra es un desvío de
//      esa obra, no un problema de precios.
//   3. ¿Con quién? (proveedor) → dónde hay concentración y por lo tanto poder de negociación.
//
// Todo son fórmulas contra Compras. Ningún número pegado a mano.
//
//   node orquestador/scripts/materiales-pestana.mjs [--dry]

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { FAMILIAS, SIN_FAMILIA, RUBROS_CON_FAMILIA, formulaFamilia } from '../lib/familia-material.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const PESTAÑA = 'Materiales'
const DRY = process.argv.includes('--dry')
const AÑO = 2026

const COL_FAMILIA = 'Compras!$AE$4:$AE'
const COL_RUBRO = 'Compras!$AC$4:$AC'
const COL_FECHA = 'Compras!$AD$4:$AD'
const COL_TOTAL = 'Compras!$O$4:$O'
const COL_OBRA = 'Compras!$J$4:$J'
const COL_PROV = 'Compras!$E$4:$E'

const letra = (i) => { let s = ''; for (let n = i; n >= 0; n = Math.floor(n / 26) - 1) s = String.fromCharCode(65 + (n % 26)) + s; return s }
// Suma de los DOS rubros de material: Civil y Mantenimiento son la misma bolsa para este análisis.

function grilla({ obras, proveedores }) {
  const filas = []
  const push = (c) => { filas.push(c); return filas.length }
  const nombres = FAMILIAS.map(([n]) => n)
  const meses = Array.from({ length: 12 }, (_, m) => `1/${m + 1}/${AÑO}`)

  push([`Materiales de obra ${AÑO} — Civil + Mantenimiento`])
  push(['Sale de Compras: rubro "Materiales Civil" o "Materiales Mantenimiento" (columna AC), familia según la columna AE. Todo por fecha de PAGO, no de factura.'])
  push([])

  // ── 1. FAMILIA × MES ────────────────────────────────────────────────────────────────────────────
  push(['1. EN QUÉ SE VA LA PLATA — por familia y por mes'])
  const cabFam = push(['Familia', ...meses, `Total ${AÑO}`, '% del total', 'Civil', 'Mantenimiento'])
  const fam0 = filas.length + 1
  for (const n of nombres) {
    const f = filas.length + 1
    push([
      n,
      ...meses.map((_, i) => `=SUMIFS(${COL_TOTAL};${COL_FAMILIA};$A${f};${COL_FECHA};">="&${letra(i + 1)}$${cabFam};${COL_FECHA};"<"&EOMONTH(${letra(i + 1)}$${cabFam};0)+1)`),
      `=SUMIF(${COL_FAMILIA};$A${f};${COL_TOTAL})`,
      `=IFERROR(${letra(13)}${f}/${letra(13)}$TOTFAM;0)`,
      `=SUMIFS(${COL_TOTAL};${COL_FAMILIA};$A${f};${COL_RUBRO};"Materiales Civil")`,
      `=SUMIFS(${COL_TOTAL};${COL_FAMILIA};$A${f};${COL_RUBRO};"Materiales Mantenimiento")`,
    ])
  }
  const fSC = filas.length + 1
  push([
    `${SIN_FAMILIA} — falta describir qué se compró`,
    ...meses.map((_, i) => `=SUMIFS(${COL_TOTAL};${COL_FAMILIA};"${SIN_FAMILIA}";${COL_FECHA};">="&${letra(i + 1)}$${cabFam};${COL_FECHA};"<"&EOMONTH(${letra(i + 1)}$${cabFam};0)+1)`),
    `=SUMIF(${COL_FAMILIA};"${SIN_FAMILIA}";${COL_TOTAL})`,
    `=IFERROR(${letra(13)}${fSC}/${letra(13)}$TOTFAM;0)`,
    `=SUMIFS(${COL_TOTAL};${COL_FAMILIA};"${SIN_FAMILIA}";${COL_RUBRO};"Materiales Civil")`,
    `=SUMIFS(${COL_TOTAL};${COL_FAMILIA};"${SIN_FAMILIA}";${COL_RUBRO};"Materiales Mantenimiento")`,
  ])
  const fam1 = filas.length
  const totFam = push([
    'TOTAL MATERIALES',
    ...meses.map((_, i) => `=SUM(${letra(i + 1)}${fam0}:${letra(i + 1)}${fam1})`),
    `=SUM(${letra(13)}${fam0}:${letra(13)}${fam1})`, '',
    `=SUM(${letra(15)}${fam0}:${letra(15)}${fam1})`,
    `=SUM(${letra(16)}${fam0}:${letra(16)}${fam1})`,
  ])
  push([])

  // ── 2. FAMILIA × OBRA ───────────────────────────────────────────────────────────────────────────
  push(['2. EN QUÉ OBRA — la misma plata, abierta por obra'])
  const cabObra = push(['Familia', ...obras, 'Total', 'Control (tiene que dar $0)'])
  const obra0 = filas.length + 1
  for (const n of [...nombres, SIN_FAMILIA]) {
    const f = filas.length + 1
    push([
      n === SIN_FAMILIA ? `${SIN_FAMILIA} — falta describir qué se compró` : n,
      ...obras.map((_, i) => `=SUMIFS(${COL_TOTAL};${COL_FAMILIA};LEFT($A${f};${n.length});${COL_OBRA};${letra(i + 1)}$${cabObra})`),
      `=SUM(${letra(1)}${f}:${letra(obras.length)}${f})`,
      // Si aparece una obra nueva que no está en las columnas, esta resta deja de dar cero.
      `=SUMIF(${COL_FAMILIA};LEFT($A${f};${n.length});${COL_TOTAL})-${letra(obras.length + 1)}${f}`,
    ])
  }
  const obra1 = filas.length
  push(['TOTAL POR OBRA',
    ...obras.map((_, i) => `=SUM(${letra(i + 1)}${obra0}:${letra(i + 1)}${obra1})`),
    `=SUM(${letra(obras.length + 1)}${obra0}:${letra(obras.length + 1)}${obra1})`,
    `=SUM(${letra(obras.length + 2)}${obra0}:${letra(obras.length + 2)}${obra1})`,
  ])
  push([])

  // ── 3. PROVEEDORES ──────────────────────────────────────────────────────────────────────────────
  push(['3. CON QUIÉN — dónde se concentra la compra (ahí está el poder de negociación)'])
  push(['Proveedor', 'Total del año', '% del total', 'Facturas'])
  const prov0 = filas.length + 1
  for (const p of proveedores) {
    const f = filas.length + 1
    push([
      p,
      `=SUMIFS(${COL_TOTAL};${COL_PROV};$A${f};${COL_RUBRO};"Materiales Civil")+SUMIFS(${COL_TOTAL};${COL_PROV};$A${f};${COL_RUBRO};"Materiales Mantenimiento")`,
      `=IFERROR($B${f}/$N$TOTFAM;0)`,
      `=COUNTIFS(${COL_PROV};$A${f};${COL_RUBRO};"Materiales Civil")+COUNTIFS(${COL_PROV};$A${f};${COL_RUBRO};"Materiales Mantenimiento")`,
    ])
  }
  const prov1 = filas.length
  push([`Subtotal de estos ${proveedores.length}`, `=SUM($B${prov0}:$B${prov1})`, `=IFERROR($B${filas.length + 1}/$N$TOTFAM;0)`, `=SUM($D${prov0}:$D${prov1})`])
  push(['Resto de proveedores', `=$N$TOTFAM-$B${filas.length}`, `=IFERROR($B${filas.length + 1}/$N$TOTFAM;0)`, ''])
  push([])

  // ── 4. CONTROL ──────────────────────────────────────────────────────────────────────────────────
  push(['CONTROL — que esta pestaña sea exactamente lo que dice el cash flow'])
  push(['Materiales Civil (rubro de Compras)', `=SUMIF(${COL_RUBRO};"Materiales Civil";${COL_TOTAL})`, 'Es la misma línea del Cash Flow Mensual.'])
  push(['Materiales Mantenimiento (rubro de Compras)', `=SUMIF(${COL_RUBRO};"Materiales Mantenimiento";${COL_TOTAL})`, ''])
  const ctrl = filas.length + 1
  push(['⇒ Diferencia contra el total de arriba (tiene que ser $0)', `=$B${ctrl - 2}+$B${ctrl - 1}-$N$TOTFAM`, 'Distinto de cero = hay materiales que ninguna familia está mirando.'])
  push(['Sin describir — plata que no se sabe en qué se gastó', `=SUMIF(${COL_FAMILIA};"${SIN_FAMILIA}";${COL_TOTAL})`, 'Filas de Compras que dicen "materiales varios", "???" o están vacías. No se les inventa familia: hay que describirlas en Compras.'])
  push(['Sin describir — cuántas facturas son', `=COUNTIF(${COL_FAMILIA};"${SIN_FAMILIA}")`, ''])

  // Resolver el marcador del total de familias, que se usa antes de saber en qué fila cae.
  const resuelto = filas.map((f) => f.map((c) => (typeof c === 'string' ? c.replaceAll('$TOTFAM', String(totFam)) : c)))
  return { filas: resuelto, fam0, fam1, totFam, obra0, obra1, prov0, prov1, cabFam, cabObra, ctrl, anchoObras: obras.length }
}

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })

  // Las obras y los proveedores salen del dato real, no de una lista mía. Si mañana aparece una obra
  // nueva, la columna de control de la tabla 2 deja de dar $0 y se ve.
  const obras = ['LA ESTRELLA', 'San Francisco', 'MESSINAS', 'ARCOR', 'Administracion', 'Almacen', 'Taller', 'SAINT GOBAIN']
  const proveedores = ['Alumetal', 'Corralon Progreso', 'DUPEC', 'Industrias Castel', 'SIDERAGRO', 'Acerolatina SA',
    'Gerson Castro', 'Friolatina SA', 'Hormiserv', 'Const-Sek', 'FEMENIA', 'AGUERO', 'Combustibles Barcelo', 'Trielec', 'Pedro Fredes']

  const g = grilla({ obras, proveedores })
  const ancho = Math.max(...g.filas.map((f) => f.length))
  const cuadro = g.filas.map((f) => { const r = [...f]; while (r.length < ancho) r.push(''); return r })
  console.log(`${PESTAÑA}: ${cuadro.length} filas x ${ancho} columnas`)
  console.log(`  familias ${g.fam0}-${g.fam1} · total ${g.totFam} · obras ${g.obra0}-${g.obra1} · proveedores ${g.prov0}-${g.prov1}`)
  if (DRY) return console.log('--dry: no escribí nada.')

  // La columna de familia en Compras: la misma disciplina que el rubro, una sola definición.
  const meta0 = await google.getSheetMeta(ID)
  const compras = meta0.find((s) => s.title === 'Compras')
  const reqC = []
  if (compras.cols < 31) reqC.push({ appendDimension: { sheetId: compras.sheetId, dimension: 'COLUMNS', length: 31 - compras.cols } })
  reqC.push({
    updateCells: {
      range: { sheetId: compras.sheetId, startRowIndex: 2, endRowIndex: 4, startColumnIndex: 30, endColumnIndex: 31 },
      rows: [
        { values: [{ userEnteredValue: { stringValue: 'Familia de material' }, userEnteredFormat: { backgroundColor: { red: 0.17, green: 0.25, blue: 0.37 }, textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } } } }] },
        { values: [{ userEnteredValue: { formulaValue: formulaFamilia() } }] },
      ],
      fields: 'userEnteredValue,userEnteredFormat',
    },
  })
  reqC.push({ updateDimensionProperties: { range: { sheetId: compras.sheetId, dimension: 'COLUMNS', startIndex: 30, endIndex: 31 }, properties: { pixelSize: 230 }, fields: 'pixelSize' } })
  await google.spreadsheetBatchUpdate(ID, reqC)

  // La pestaña: crearla si no existe, si existe limpiarla entera.
  let hoja = (await google.getSheetMeta(ID)).find((s) => s.title === PESTAÑA)
  if (!hoja) {
    await google.spreadsheetBatchUpdate(ID, [{ addSheet: { properties: { title: PESTAÑA, gridProperties: { rowCount: 200, columnCount: 20 } } } }])
    hoja = (await google.getSheetMeta(ID)).find((s) => s.title === PESTAÑA)
  } else {
    await google.clearValues(ID, `${PESTAÑA}!A1:Z200`)
  }
  await google.batchUpdateValues(ID, [{ range: `${PESTAÑA}!A1:${letra(ancho - 1)}${cuadro.length}`, values: cuadro }])
  await formatear(google, hoja.sheetId, g, ancho, cuadro.length)

  // Verificar leyendo lo que quedó, no lo que quise escribir.
  const v = await google.readSheetValues(ID, `${PESTAÑA}!A1:T${cuadro.length}`)
  const err = []
  v.forEach((f, i) => (f || []).forEach((c, j) => { if (/^#(REF|ERROR|N\/A|VALUE|¡|DIV|NAME|NUM|NULL)/.test(String(c ?? ''))) err.push(`${letra(j)}${i + 1}=${c}`) }))
  console.log(err.length ? `\n⚠ ${err.length} celdas en error: ${err.slice(0, 8).join(' ')}` : '\n✓ sin errores')
  console.log('\nFAMILIAS:')
  for (let i = g.fam0; i <= g.fam1; i++) console.log(`  ${String(v[i - 1]?.[14] ?? '').padStart(7)}  ${String(v[i - 1]?.[13] ?? '').padStart(14)}  ${v[i - 1]?.[0]}`)
  console.log(`  ${' '.repeat(7)}  ${String(v[g.totFam - 1]?.[13] ?? '').padStart(14)}  TOTAL`)
  const c = g.ctrl
  console.log('\nCONTROL:')
  console.log(`  Materiales Civil          ${v[c - 3]?.[1]}`)
  console.log(`  Materiales Mantenimiento  ${v[c - 2]?.[1]}`)
  console.log(`  ⇒ Diferencia              ${v[c - 1]?.[1]}`)
  console.log(`  Sin describir             ${v[c]?.[1]}  (${v[c + 1]?.[1]} facturas)`)
}

async function formatear(google, sheetId, g, ancho, filas) {
  const AZUL = { red: 0.17, green: 0.25, blue: 0.37 }
  const GRIS = { red: 0.93, green: 0.94, blue: 0.95 }
  const r = (r0, r1, c0 = 0, c1 = ancho) => ({ sheetId, startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1 })
  const req = [{ unmergeCells: { range: r(0, filas) } }]
  const fmt = (rg, fields, format) => req.push({ repeatCell: { range: rg, cell: { userEnteredFormat: format }, fields } })

  fmt(r(0, filas, 1), 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment',
    { numberFormat: { type: 'CURRENCY', pattern: '"$"#,##0;[Red]-"$"#,##0;"—"' }, horizontalAlignment: 'RIGHT' })
  fmt(r(0, 1), 'userEnteredFormat.textFormat', { textFormat: { bold: true, fontSize: 13 } })
  fmt(r(1, 2), 'userEnteredFormat.textFormat', { textFormat: { italic: true, fontSize: 9, foregroundColor: { red: 0.4, green: 0.4, blue: 0.45 } } })
  // Encabezados de las tres tablas y sus filas de título.
  for (const f of [g.cabFam, g.cabObra, g.prov0 - 1]) {
    fmt(r(f - 2, f - 1), 'userEnteredFormat.textFormat', { textFormat: { bold: true, fontSize: 11 } })
    fmt(r(f - 1, f), 'userEnteredFormat', { backgroundColor: AZUL, textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 }, fontSize: 9 }, horizontalAlignment: 'CENTER', wrapStrategy: 'WRAP' })
  }
  fmt({ ...r(g.cabFam - 1, g.cabFam), startColumnIndex: 1, endColumnIndex: 13 }, 'userEnteredFormat.numberFormat', { numberFormat: { type: 'DATE', pattern: 'mmm' } })
  // Totales en negrita.
  for (const f of [g.totFam, g.obra1 + 1, g.prov1 + 1, g.prov1 + 2]) {
    fmt(r(f - 1, f), 'userEnteredFormat.textFormat,userEnteredFormat.backgroundColor', { textFormat: { bold: true }, backgroundColor: { red: 0.89, green: 0.91, blue: 0.94 } })
  }
  // Los porcentajes son porcentajes, no pesos.
  fmt({ ...r(g.fam0 - 1, g.totFam), startColumnIndex: 14, endColumnIndex: 15 }, 'userEnteredFormat.numberFormat', { numberFormat: { type: 'PERCENT', pattern: '0.0%' } })
  fmt({ ...r(g.prov0 - 1, g.prov1 + 2), startColumnIndex: 2, endColumnIndex: 3 }, 'userEnteredFormat.numberFormat', { numberFormat: { type: 'PERCENT', pattern: '0.0%' } })
  fmt({ ...r(g.prov0 - 1, g.prov1 + 1), startColumnIndex: 3, endColumnIndex: 4 }, 'userEnteredFormat.numberFormat', { numberFormat: { type: 'NUMBER', pattern: '0' } })
  // El bloque de control lleva texto explicativo en la columna C: que no lo formatee como plata.
  fmt({ ...r(g.ctrl - 3, filas), startColumnIndex: 2, endColumnIndex: ancho }, 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment,userEnteredFormat.textFormat',
    { numberFormat: { type: 'TEXT' }, horizontalAlignment: 'LEFT', textFormat: { fontSize: 9, italic: true } })
  fmt(r(g.ctrl - 5, g.ctrl - 4), 'userEnteredFormat.textFormat', { textFormat: { bold: true, fontSize: 11 } })
  fmt(r(g.ctrl - 1, g.ctrl), 'userEnteredFormat.textFormat', { textFormat: { bold: true } })
  fmt({ ...r(g.prov1 + 2, filas), startColumnIndex: 3, endColumnIndex: 4 }, 'userEnteredFormat.numberFormat', { numberFormat: { type: 'NUMBER', pattern: '0' } })

  req.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 300 }, fields: 'pixelSize' } })
  req.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 1, endIndex: ancho }, properties: { pixelSize: 108 }, fields: 'pixelSize' } })
  req.push({ updateSheetProperties: { properties: { sheetId, gridProperties: { frozenColumnCount: 1 } }, fields: 'gridProperties.frozenColumnCount' } })
  await google.spreadsheetBatchUpdate(ID, req)
}

main().catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
