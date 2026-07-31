#!/usr/bin/env node
// RESUMEN — UN SOLO TABLERO: "LO QUE VIENE A PAGAR".
//
// POR QUÉ SE REHIZO (22/07). El dueño: "rehacer cada pestaña en base a las reglas de oro, TODAS menos
// Compras y Cobranzas. Regla de oro, minimalismo". RESUMEN tenía tres bloques y uno de ellos era una
// TABLA DINÁMICA NATIVA HUÉRFANA: la deuda a proveedores (filas 10-35) más un segundo pivot por
// cliente (columna H). Las dos cosas mal, a la vez:
//
//   · DUPLICABAN la pestaña Proveedores al centavo ($10.818.047,36 en las dos). Regla 4: nunca
//     duplicar un concepto ya desglosado en otra pestaña.
//   · NO LAS MANTENÍA NINGÚN AGENTE. `plantar()` de pivot-sheets.mjs no se llamaba desde ningún paso
//     vivo: se plantaron a mano una vez y quedaron. Regla 6 (todo se actualiza solo) y 13 (un agente
//     por cada dato). Un pivot ajeno con enumeraciones que nadie regenera es un cuadro que se congela
//     —lo dice el propio pivot-sheets.mjs sobre el de cobranzas—.
//   · SON OPACAS. Todas sus celdas son `derivada`: no hay fórmula que el OS controle, hay una
//     definición de pivot que Google calcula. La regla 2 pide fórmula o celda con origen trazable.
//
// QUÉ ES AHORA. Un tablero de compromisos: jornales, proveedores, cheques y tarjeta, cada uno UN
// total por fórmula que apunta a su pestaña, con el detalle REMITIDO a esa pestaña —no copiado—. El
// que quiere ver proveedor por proveedor abre Proveedores; acá ve cuánto y adónde. Minimalismo:
// menos cuadros, cada número con su dueño.
//
// LO QUE NO MEZCLA. No hay un "gran total" que sume una quincena de jornales con cheques que vencen
// en noviembre: eso cruzaría ventanas de tiempo (regla del CLAUDE raíz). El TOTAL COMPROMETIDO es un
// STOCK —lo que se debe hoy, sin importar la fecha de pago—: quincena en curso + deuda a proveedores
// + cheques sin debitar + tarjeta pendiente. Las líneas de horizonte (próxima quincena, próximos 3
// meses, cheques a 30/7 días) quedan informativas, aparte del total.
//
//   node orquestador/scripts/resumen-pestana.mjs [--dry]

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { hallarPestana } from '../lib/sheet-pestanas.mjs'
import { borrar } from '../lib/pivot-sheets.mjs'
import { escribirPreservando } from '../lib/preservar-anotaciones.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const PESTAÑA = 'RESUMEN'
const DRY = process.argv.includes('--dry')
const ANCHO = 3 // A=Compromiso · B=Cuándo/detalle · C=Monto

// ═══ LAS FÓRMULAS QUE YA ESTABAN BIEN, TRAÍDAS AL SCRIPT PARA QUE UN AGENTE LAS POSEA ═══
//
// Los bloques de jornales y cheques ya eran fórmula sobre sus pestañas, pero los había puesto una
// persona a mano: ningún script los regeneraba (regla 13). Al tomar RESUMEN entero, el agente pasa a
// ser el dueño. Se reproducen VERIFICADAS contra el Sheet, no reescritas de memoria.
const CH = "'Cheques Emitidos'"
const chFecha = `${CH}!$I$2:$I`, chMonto = `${CH}!$F$2:$F`, chDebito = `${CH}!$K$2:$K`
// Un cheque cuenta como pendiente si tiene fecha y NO está debitado (K distinto de "SI").
const chBase = `ISNUMBER(${chFecha})*(UPPER(${chDebito})<>"SI")*IF(ISNUMBER(${chMonto});${chMonto};0)`

// El total de tarjeta pendiente vive en su cuadro de control, que SE MUEVE (se escribe debajo de los
// consumos, que crecen). Por eso se ubica por RÓTULO con MATCH sobre la columna A entera, no por
// celda fija —la regla de "fila por nombre, no por posición" cruzando pestañas—. El comodín evita
// meter el emoji "⇒" adentro de la fórmula.
const TARJETA_PEND = `=IFERROR(INDEX('Tarjeta de Credito'!$B:$B;MATCH("*TOTAL PENDIENTE";'Tarjeta de Credito'!$A:$A;0));0)`

function grilla() {
  const filas = []
  const vacia = () => Array(ANCHO).fill('')
  const push = (a = '', b = '', c = '') => { filas.push([a, b, c]); return filas.length }

  push('LO QUE VIENE A PAGAR')
  push('Se completa solo. Cada línea es un total por fórmula; el detalle vive en su pestaña — acá se ve cuánto y adónde ir a mirarlo.')
  push()
  push('Compromiso', 'Cuándo / dónde ver el detalle', 'Monto')

  // ── JORNALES ── (fuente: Jornales por Quincena)
  // POR RANGO CON NOMBRE, NO POR NÚMERO DE FILA. Estas tres líneas citaban $A$23, $G$24 y $G$24:$G$29
  // de Jornales; el rediseño del 23/07 movió esos bloques y las tres habrían mostrado la fila
  // equivocada sin dar error. `INDEX(rango;n)` toma la enésima fila del bloque, esté donde esté.
  const proy = (col, n) => `INDEX(JORNALES_PROY_${col};${n})`
  const fJornalCierre = push('Jornales — próxima quincena a pagar',
    `=TEXT(${proy('DESDE', 1)};"dd/mm")&" – "&TEXT(${proy('HASTA', 1)};"dd/mm")&"  ·  ver Jornales por Quincena"`,
    `=${proy('TOTAL', 1)}`)
  push('Jornales — la siguiente',
    `=TEXT(${proy('DESDE', 2)};"dd/mm")&" – "&TEXT(${proy('HASTA', 2)};"dd/mm")&"  ·  proyección"`,
    `=${proy('TOTAL', 2)}`)
  push('Jornales — próximos 3 meses',
    `=TEXT(${proy('DESDE', 1)};"dd/mm")&" – "&TEXT(${proy('HASTA', 6)};"dd/mm")&"  ·  proyección"`,
    `=SUM(INDEX(JORNALES_PROY_TOTAL;1):INDEX(JORNALES_PROY_TOTAL;6))`)

  push()

  // ── PROVEEDORES ── (fuente: Proveedores, que a su vez sale de Compras)
  const fProv = push('Deuda a proveedores (facturas pendientes)', 'ver Proveedores — proveedor por proveedor y fecha de pago', `=Proveedores!$B$6`)
  push('  · sin fecha de pago — no cae en ninguna semana', 'ver Proveedores, bloque ⚠ SIN FECHA', `=Proveedores!$B$27`)

  push()

  // ── CHEQUES ── (fuente: Cheques Emitidos)
  const fCheq = push('Cheques emitidos sin debitar', 'ver Cheques Emitidos — cheque por cheque', `=SUMPRODUCT(${chBase})`)
  push('  · a cubrir en los próximos 30 días', 'por fecha del cheque', `=SUMPRODUCT(${chBase}*(${chFecha}>=TODAY())*(${chFecha}<TODAY()+30))`)
  push('  · a cubrir en los próximos 7 días', 'por fecha del cheque', `=SUMPRODUCT(${chBase}*(${chFecha}>=TODAY())*(${chFecha}<TODAY()+7))`)
  push('  · ⚠ vencidos y todavía sin debitar', 'ya pasó la fecha y el banco no lo cobró', `=SUMPRODUCT(${chBase}*(${chFecha}<TODAY()))`)

  push()

  // ── TARJETA ── (fuente: Tarjeta de Credito, cuadro de control)
  const fTarj = push('Tarjeta de crédito — cuotas pendientes', 'ver Tarjeta de Credito — débito automático por el total', TARJETA_PEND)

  push()

  // ── TOTAL COMPROMETIDO ── stock, no flujo: lo que se debe hoy sin importar la fecha de pago.
  const fTotal = push('⇒ TOTAL COMPROMETIDO (deuda cierta a hoy)',
    'Próxima quincena + proveedores + cheques + tarjeta. NO incluye el resto de las proyecciones (3 meses): eso mezclaría ventanas de tiempo.',
    `=C${fJornalCierre}+C${fProv}+C${fCheq}+C${fTarj}`)

  return { filas, fJornalCierre, fProv, fCheq, fTarj, fTotal, fCab: 4 }
}

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  const hojas = await google.getSheetMeta(ID)
  const hoja = hallarPestana(hojas, PESTAÑA)

  // ═══ SACAR LOS PIVOTS NATIVOS ANTES DE ESCRIBIR ═══
  // Un pivot no se pisa con un clearValues ni con un batch de valores: vive como metadata de la celda
  // ancla y se derrama solo. Si no se borra con updateCells(fields:'pivotTable'), quedan sus filas
  // derramadas debajo de lo nuevo. getPivotTables devuelve el ancla 1-indexada; borrar() la pide
  // 0-indexada.
  const pivots = await google.getPivotTables(ID, `'${hoja.title}'!A1:Z80`)
  console.log(`${hoja.title}: ${pivots.length} pivot(s) nativo(s) a eliminar${pivots.map((p) => ` [f${p.fila} c${p.col}]`).join('')}`)

  const g = grilla()
  console.log(`  tablero: ${g.filas.length} filas · TOTAL COMPROMETIDO en la fila ${g.fTotal}`)
  if (DRY) { for (const f of g.filas) console.log('   ', f.filter(Boolean).map((x) => String(x).slice(0, 50)).join('  |  ')); return }

  // 1) borrar pivots  2) limpiar formato y valores de TODA la altura vieja (los pivots ocupaban hasta
  //    la ~35; el bloque de cheques viejo llegaba a la 52) 3) escribir 4) formatear.
  const reqBorrar = pivots.map((p) => borrar(hoja.sheetId, p.fila - 1, p.col))
  if (reqBorrar.length) await google.spreadsheetBatchUpdate(ID, reqBorrar)
  await google.spreadsheetBatchUpdate(ID, [{
    repeatCell: {
      range: { sheetId: hoja.sheetId, startRowIndex: 0, endRowIndex: Math.min(hoja.rows ?? 80, 80), startColumnIndex: 0, endColumnIndex: Math.max(hoja.cols ?? 14, 14) },
      cell: {}, fields: 'userEnteredFormat',
    },
  }])
  // NO se borra nada escrito por una persona: se lee, se fusiona y se escribe. Ver lib/preservar-anotaciones.mjs.
  const escritura = await escribirPreservando(google, ID, hoja.title, g.filas, { anchoHoja: Math.max(3, hoja.cols ?? 3) })
  // ═══ SI LA ESCRITURA SE SALTEÓ, NO SE TOCA LA GEOMETRÍA (31/07) ═══
  //
  // El defecto que arruinó CAJA, buscado en todos los generadores y encontrado en seis. La guarda hace
  // bien su trabajo —con la pestaña candada o con la firma editada, `escribirPreservando` NO escribe—
  // pero el resultado se descartaba y la corrida seguía: el formateador pintaba la geometría de la
  // grilla NUEVA sobre los valores VIEJOS, y donde había rangos con nombre los reapuntaba a filas que
  // en la pestaña no tienen ese dato. En CAJA eso dejó CAJA_TOTAL_DISPONIBLE y CAJA_FECHA_SALDO sobre
  // dos celdas vacías: con el total y la fecha de corte en cero, todo cheque y toda quincena pasaban el
  // filtro y el calendario inflaba sus tramos. Sin un solo #ERROR y sin un aviso.
  //
  // Una pestaña que no se escribió no cambió de forma: su formato y sus nombres son los de su última
  // escritura y así tienen que quedar.
  const salteada = Boolean(escritura?.bloqueada || escritura?.editadaPorHumano)
  if (salteada) console.log('  🔒 bajo tu control: no escribí, y por lo tanto no le toco el formato ni sus rangos con nombre. Queda exactamente como la dejaste.')
  const { conservadas } = salteada ? { conservadas: [] } : escritura
  if (conservadas.length) console.log(`  ✋ ${conservadas.length} celda(s) de una persona — CONSERVADAS`)
  if (!salteada) await formatear(google, hoja, g)

  // ═══ VERIFICAR CONTRA EL SHEET, NO CONFIAR ═══
  const v = await google.readSheetValues(ID, `${hoja.title}!A1:C${g.filas.length}`)
  const errores = v.flat().filter((c) => /#(ERROR|REF|N\/A|VALUE|NAME)/i.test(String(c ?? '')))
  const piv2 = await google.getPivotTables(ID, `'${hoja.title}'!A1:Z80`)
  console.log(`\nCONTROL  jornales ${v[g.fJornalCierre - 1]?.[2]} · proveedores ${v[g.fProv - 1]?.[2]} · cheques ${v[g.fCheq - 1]?.[2]} · tarjeta ${v[g.fTarj - 1]?.[2]}`)
  console.log(`  ⇒ TOTAL COMPROMETIDO ${v[g.fTotal - 1]?.[2]}`)
  console.log(`  pivots restantes: ${piv2.length} · celdas en error: ${errores.length}`)
  if (piv2.length) { console.log('  ⚠ quedó un pivot nativo sin borrar'); process.exitCode = 1 }
  if (errores.length) { console.log(`  ⚠ ${errores.slice(0, 3).join(' · ')}`); process.exitCode = 1 }
}

async function formatear(google, hoja, g) {
  const { sheetId } = hoja
  const n = g.filas.length
  const AZUL = { red: 0.17, green: 0.25, blue: 0.37 }
  const r = (r0, r1, c0 = 0, c1 = ANCHO) => ({ sheetId, startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1 })
  const req = [{ unmergeCells: { range: r(0, 80) } }]
  const fmt = (rg, fields, format) => req.push({ repeatCell: { range: rg, cell: { userEnteredFormat: format }, fields } })

  // Toda la columna C en moneda; A y B a la izquierda como texto.
  fmt(r(0, n, 2, 3), 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment',
    { numberFormat: { type: 'CURRENCY', pattern: '"$"#,##0;[Red]-"$"#,##0;"—"' }, horizontalAlignment: 'RIGHT' })
  fmt(r(0, n, 0, 2), 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment',
    { numberFormat: { type: 'TEXT' }, horizontalAlignment: 'LEFT' })
  // Título y subtítulo.
  fmt(r(0, 1), 'userEnteredFormat.textFormat', { textFormat: { bold: true, fontSize: 14 } })
  fmt(r(1, 2), 'userEnteredFormat.textFormat,userEnteredFormat.wrapStrategy',
    { textFormat: { italic: true, fontSize: 9, foregroundColor: { red: 0.4, green: 0.4, blue: 0.45 } }, wrapStrategy: 'WRAP' })
  // Cabecera de la tabla.
  fmt(r(g.fCab - 1, g.fCab), 'userEnteredFormat',
    { backgroundColor: AZUL, textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 }, fontSize: 10 }, horizontalAlignment: 'LEFT' })
  fmt({ ...r(g.fCab - 1, g.fCab), startColumnIndex: 2, endColumnIndex: 3 }, 'userEnteredFormat.horizontalAlignment', { horizontalAlignment: 'RIGHT' })
  // Encabezados de bloque (jornales, proveedores, cheques, tarjeta): la primera línea de cada uno en negrita.
  for (const f of [g.fJornalCierre, g.fProv, g.fCheq, g.fTarj]) {
    fmt(r(f - 1, f, 0, 1), 'userEnteredFormat.textFormat', { textFormat: { bold: true } })
  }
  // Notas y detalle (columna B) en gris chico.
  fmt(r(g.fCab, n, 1, 2), 'userEnteredFormat.textFormat,userEnteredFormat.wrapStrategy',
    { textFormat: { fontSize: 9, foregroundColor: { red: 0.4, green: 0.4, blue: 0.45 } }, wrapStrategy: 'WRAP' })
  // TOTAL COMPROMETIDO destacado.
  fmt(r(g.fTotal - 1, g.fTotal), 'userEnteredFormat.textFormat,userEnteredFormat.backgroundColor',
    { textFormat: { bold: true, fontSize: 11 }, backgroundColor: { red: 0.89, green: 0.91, blue: 0.94 } })
  // Anchos: compromiso ancho, detalle ancho, monto medio.
  req.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 320 }, fields: 'pixelSize' } })
  req.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 1, endIndex: 2 }, properties: { pixelSize: 360 }, fields: 'pixelSize' } })
  req.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 2, endIndex: 3 }, properties: { pixelSize: 150 }, fields: 'pixelSize' } })
  req.push({ updateSheetProperties: { properties: { sheetId, gridProperties: { frozenRowCount: g.fCab } }, fields: 'gridProperties.frozenRowCount' } })
  // Las dos filas con nota larga (subtítulo y nota del TOTAL) van a 3 líneas: con WRAP, una fila de
  // 20px sólo muestra la primera y el resto queda cortado. El autoajuste de Google no crece las filas
  // envueltas en este caso, así que se fija el alto explícito —determinístico— para el subtítulo
  // (fila 2) y la nota del TOTAL COMPROMETIDO.
  for (const idx of [1, g.fTotal - 1]) {
    req.push({ updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: idx, endIndex: idx + 1 }, properties: { pixelSize: 60 }, fields: 'pixelSize' } })
  }
  await google.spreadsheetBatchUpdate(ID, req)
}

main().catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
