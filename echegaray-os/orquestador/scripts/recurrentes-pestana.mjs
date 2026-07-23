#!/usr/bin/env node
// LA PESTAÑA RECURRENTES — LOS SERVICIOS QUE SE PAGAN TODOS LOS MESES.
//
// POR QUÉ EXISTE (20/07). Era una pestaña HUÉRFANA: ningún script versionado la regeneraba, así que
// el agente que rehace el archivo cada 2 horas no la tocaba. Y sin embargo el Cash Flow Mensual leía
// de ella su proyección de "Servicios recurrentes". Un número del que depende el cuadro, mantenido
// a mano y por nadie.
//
// Y ADEMÁS PROYECTABA HACIA ATRÁS. La versión hecha a mano rellenaba con proyección los meses YA
// CERRADOS: a Movistar le ponía $374.260 en junio cuando el real es $0. Eso no es una estimación, es
// tapar un problema — a Movistar no se le carga una factura desde mayo, y el cuadro lo escondía
// poniendo un número donde no había ninguno. Un mes cerrado muestra lo que pasó, aunque sea cero, y
// si el cero es raro se avisa.
//
// QUÉ CAMBIÓ EN LA DEFINICIÓN. Un servicio es recurrente cuando lo paga la ESTRUCTURA. Los mismos
// proveedores facturando a una obra (el baño químico de La Estrella, el agua de San Francisco) son
// costo de esa obra: $4.186.497 que estaban acá y volvieron a Materiales. Un baño de obra no es un
// gasto fijo mensual — se termina cuando termina la obra, y proyectarlo como fijo inventa caja.
//
//   node orquestador/scripts/recurrentes-pestana.mjs [--dry]

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { hallarPestana } from '../lib/sheet-pestanas.mjs'
import { MIN_MESES, COL_RUBRO, COL_FECHA, COL_TOTAL } from '../lib/cash-flow-lineas.mjs'
import { escribirPreservando } from '../lib/preservar-anotaciones.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const PESTAÑA = 'Recurrentes'
const DRY = process.argv.includes('--dry')
const AÑO = 2026
const RUBRO = 'Servicios recurrentes'

const letra = (i) => { let s = ''; for (let n = i; n >= 0; n = Math.floor(n / 26) - 1) s = String.fromCharCode(65 + (n % 26)) + s; return s }

// A + 12 meses + Total real + Meses con gasto + Promedio. Después, ocultas, las 12 del real puro.
const C_MES0 = 1, C_TOTREAL = 13, C_NMESES = 14, C_PROM = 15, ANCHO_VIS = 16
const C_AUX0 = 17
const ANCHO = C_AUX0 + 12
const FILA_CAB = 4

function grilla(proveedores) {
  const filas = []
  const vacia = () => Array(ANCHO).fill('')
  const push = (f) => { filas.push(f); return filas.length }

  const t = vacia(); t[0] = `Servicios recurrentes ${AÑO}`
  push(t)
  const n = vacia()
  n[0] = `Sale de Compras, rubro "${RUBRO}" (columna AC). Un servicio es recurrente cuando lo paga la ESTRUCTURA: los mismos proveedores facturando a una obra son costo de esa obra y están en Materiales. Los meses cerrados muestran lo que REALMENTE se pagó, aunque sea $0 — un cero acá significa que falta cargar una factura, y taparlo con una proyección esconde el problema. De agosto en adelante es PROYECCIÓN: promedio de los meses con gasto × la inflación de Parámetros, y sólo para los proveedores que aparecieron en ${MIN_MESES} meses o más.`
  push(n)
  // EL TÍTULO DE SECCIÓN VA JUSTO ARRIBA DE SU ENCABEZADO, y ocupa la fila en blanco que ya había:
  // así no corre ninguna fila. Las fórmulas de abajo referencian filas absolutas y un desplazamiento
  // las dejaría apuntando a otra cosa, en silencio.
  const s1 = vacia(); s1[0] = '1 · EL GASTO RECURRENTE, MES A MES'; push(s1)

  const cab = vacia()
  cab[0] = 'Proveedor'
  for (let m = 0; m < 12; m++) cab[C_MES0 + m] = new Date(Date.UTC(AÑO, m, 1))
  cab[C_TOTREAL] = 'Total real'
  cab[C_NMESES] = 'Meses con gasto'
  cab[C_PROM] = 'Promedio mensual'
  cab[C_AUX0] = 'AUXILIAR — el real de cada mes. De acá sale la proyección: sin separarlo, la fórmula de un mes se leería a sí misma (#REF!). No borrar.'
  push(cab)

  const f0 = filas.length + 1
  for (const prov of proveedores) {
    const f = filas.length + 1
    const fila = vacia()
    fila[0] = prov
    for (let m = 0; m < 12; m++) {
      const ca = letra(C_AUX0 + m)
      const cm = letra(C_MES0 + m)
      // El REAL, en la columna auxiliar.
      fila[C_AUX0 + m] = `=SUMIFS(${COL_TOTAL};${COL_RUBRO};"${RUBRO}";Compras!$E$4:$E;$A${f};${COL_FECHA};">="&${cm}$${FILA_CAB};${COL_FECHA};"<"&EOMONTH(${cm}$${FILA_CAB};0)+1)`
      // Lo que se ve: en un mes CERRADO, el real y nada más. En un mes futuro, la proyección.
      fila[C_MES0 + m] = `=IF(EOMONTH(${cm}$${FILA_CAB};0)<=EOMONTH(TODAY();0);${ca}${f};IF($${letra(C_NMESES)}${f}<${MIN_MESES};0;$${letra(C_PROM)}${f}*IFERROR(INDEX(Parámetros!$C$74:$C$90;MATCH(EOMONTH(${cm}$${FILA_CAB};0);ARRAYFORMULA(EOMONTH(Parámetros!$A$74:$A$90;0));0));1)))`
    }
    const a0 = letra(C_AUX0), a1 = letra(C_AUX0 + 11)
    fila[C_TOTREAL] = `=SUM(${a0}${f}:${a1}${f})`
    fila[C_NMESES] = `=COUNTIF(${a0}${f}:${a1}${f};">0")`
    fila[C_PROM] = `=IFERROR($${letra(C_TOTREAL)}${f}/$${letra(C_NMESES)}${f};0)`
    push(fila)
  }
  const f1 = filas.length

  const tot = vacia()
  tot[0] = 'TOTAL'
  for (let m = 0; m < 12; m++) tot[C_MES0 + m] = `=SUM(${letra(C_MES0 + m)}${f0}:${letra(C_MES0 + m)}${f1})`
  tot[C_TOTREAL] = `=SUM(${letra(C_TOTREAL)}${f0}:${letra(C_TOTREAL)}${f1})`
  const fTot = push(tot)

  push(vacia())
  const ctrl = filas.length + 1
  const c1 = vacia()
  c1[0] = '2 · CONTROL — EL REAL DE ESTA PESTAÑA CONTRA COMPRAS'
  push(c1)
  const c2 = vacia()
  // Se compara contra lo que TIENE FECHA DE CAJA: un gasto sin fecha no cae en ningún mes y por lo
  // tanto no puede estar en este cuadro. Compararlo contra el total entero hacía fallar el control
  // por un motivo que no es un error — y un control que falla por algo que está bien se deja de mirar.
  c2[0] = 'Compras del rubro, con fecha de caja'
  // ">0" y no "<>": la columna de fecha de caja la llena un ARRAYFORMULA que devuelve "" en las
  // filas que no son gasto, y para SUMIFS ese "" no es "distinto de vacío" — el criterio "<>" las
  // contaba a todas y el control comparaba contra sí mismo. Una fecha real es un número mayor que 0.
  c2[1] = `=SUMIFS(${COL_TOTAL};${COL_RUBRO};"${RUBRO}";${COL_FECHA};">0")`
  push(c2)
  const c3 = vacia()
  c3[0] = 'Suma del real de este cuadro'
  c3[1] = `=SUM(${letra(C_TOTREAL)}${f0}:${letra(C_TOTREAL)}${f1})`
  push(c3)
  const c4 = vacia()
  c4[0] = '⇒ Diferencia (tiene que ser $0)'
  c4[1] = `=B${ctrl + 1}-B${ctrl + 2}`
  c4[2] = 'Distinto de cero = hay un proveedor recurrente que este cuadro no está listando.'
  push(c4)
  const c5 = vacia()
  c5[0] = `Proveedores no proyectados (< ${MIN_MESES} meses)`
  c5[1] = `=COUNTIF(${letra(C_NMESES)}${f0}:${letra(C_NMESES)}${f1};"<${MIN_MESES}")`
  c5[2] = 'No es una tendencia: es un pago suelto. Proyectarlo inventa plata.'
  push(c5)
  const cSF = vacia()
  cSF[0] = '⚠ Del rubro, sin fecha de caja'
  cSF[1] = `=SUMIF(${COL_RUBRO};"${RUBRO}";${COL_TOTAL})-B${ctrl + 1}`
  cSF[2] = 'Está clasificado pero no se sabe CUÁNDO sale. Hay que fecharlo en Compras.'
  push(cSF)
  const c6 = vacia()
  c6[0] = '⚠ Meses cerrados en $0 (falta factura)'
  c6[1] = `=SUMPRODUCT((${letra(C_AUX0)}${f0}:${letra(C_AUX0 + 11)}${f1}=0)*(${letra(C_MES0)}$${FILA_CAB}:${letra(C_MES0 + 11)}$${FILA_CAB}<=EOMONTH(TODAY();0)))`
  c6[2] = 'Un proveedor que factura todos los meses y un mes aparece en cero: o dejó de facturar, o la factura no se cargó. El cuadro NO lo tapa con una proyección.'
  push(c6)

  return { filas, f0, f1, fTot, ctrl }
}

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  const hojas = await google.getSheetMeta(ID)
  const hoja = hallarPestana(hojas, PESTAÑA)

  // Los proveedores salen de la PLANILLA, no de una lista tipeada acá: si mañana entra un servicio
  // recurrente nuevo, aparece solo. La lista de rubro-caja decide QUIÉN es recurrente; ésta decide
  // quién efectivamente facturó.
  const compras = await google.readSheetValues(ID, 'Compras!A4:AC940')
  const provs = [...new Set(compras.filter((f) => String(f?.[28] ?? '').trim() === RUBRO)
    .map((f) => String(f?.[4] ?? '').trim()).filter(Boolean))].sort()
  if (!provs.length) throw new Error(`no encontré ninguna fila con rubro "${RUBRO}" en Compras`)

  const g = grilla(provs)
  console.log(`${hoja.title}: ${g.filas.length} filas · ${provs.length} proveedores · TOTAL en la fila ${g.fTot}`)
  console.log(`  ${provs.join(' · ')}`)
  if (DRY) return console.log('--dry: no escribí nada.')

  // EL FORMATO SE LIMPIA ANTES DE ESCRIBIR, no después. Con USER_ENTERED, Google interpreta el valor
  // SEGÚN EL FORMATO QUE LA CELDA YA TIENE: si quedó en TEXTO de un layout anterior, "1/2/2026" se
  // guarda como texto y ninguna pintada posterior lo convierte en fecha. Por eso febrero salía
  // "1/2/2026" al lado de enero mostrando "ene". Primero se limpia, después se escribe, y al final
  // se pinta.
  await google.spreadsheetBatchUpdate(ID, [{
    repeatCell: {
      range: { sheetId: hoja.sheetId, startRowIndex: 0, endRowIndex: Math.min(hoja.rows ?? 200, 200), startColumnIndex: 0, endColumnIndex: hoja.cols ?? ANCHO },
      cell: {}, fields: 'userEnteredFormat',
    },
  }])
  // NO se borra nada escrito por una persona: se lee, se fusiona y se escribe. Ver lib/preservar-anotaciones.mjs.
  const gridRec = g.filas.map((f) => f.map((c) => (c instanceof Date ? `${c.getUTCDate()}/${c.getUTCMonth() + 1}/${c.getUTCFullYear()}` : c)))
  const { conservadas } = await escribirPreservando(google, ID, hoja.title, gridRec, { anchoHoja: Math.max(ANCHO, hoja.cols ?? ANCHO) })
  if (conservadas.length) console.log(`  ✋ ${conservadas.length} celda(s) de una persona — CONSERVADAS`)
  await formatear(google, hoja, g)

  const v = await google.readSheetValues(ID, `${hoja.title}!A1:C${g.filas.length}`)
  console.log(`\nCONTROL  Compras ${v[g.ctrl]?.[1]} · cuadro ${v[g.ctrl + 1]?.[1]} · diferencia ${v[g.ctrl + 2]?.[1]}`)
  console.log(`  sin proyectar: ${v[g.ctrl + 3]?.[1]} · sin fecha de caja: ${v[g.ctrl + 4]?.[1]} · meses cerrados en $0: ${v[g.ctrl + 5]?.[1]}`)
  // "-$0" es CERO: el formato de moneda dibuja el signo cuando el número es una fracción negativa de
  // peso. Comparar el texto contra "0" hacía fallar el control por medio centavo y dejaba el agente
  // en rojo con los datos perfectos — un control que grita por nada se deja de mirar.
  const dif = Number(String(v[g.ctrl + 2]?.[1] ?? '0').replace(/[^\d,-]/g, '').replace(/\./g, '').replace(',', '.')) || 0
  if (Math.abs(dif) >= 1) { console.log(`  ⚠ la diferencia no es $0: ${dif}`); process.exitCode = 1 }
}

async function formatear(google, hoja, g) {
  const { sheetId } = hoja
  const AZUL = { red: 0.17, green: 0.25, blue: 0.37 }
  const AMBAR = { red: 1, green: 0.97, blue: 0.88 }
  const n = g.filas.length
  const r = (r0, r1, c0 = 0, c1 = ANCHO) => ({ sheetId, startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1 })
  // El formato viejo ya se limpió antes de escribir los valores (ver main): acá sólo se pinta.
  const req = [{ unmergeCells: { range: r(0, n) } }]
  const fmt = (rg, fields, format) => req.push({ repeatCell: { range: rg, cell: { userEnteredFormat: format }, fields } })

  fmt(r(0, n, 1, ANCHO), 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment',
    { numberFormat: { type: 'CURRENCY', pattern: '"$"#,##0;[Red]-"$"#,##0;"—"' }, horizontalAlignment: 'RIGHT' })
  fmt(r(0, 1), 'userEnteredFormat.textFormat', { textFormat: { bold: true, fontSize: 13 } })
  fmt(r(1, 2), 'userEnteredFormat.textFormat,userEnteredFormat.wrapStrategy',
    { textFormat: { italic: true, fontSize: 9, foregroundColor: { red: 0.4, green: 0.4, blue: 0.45 } }, wrapStrategy: 'WRAP' })
  fmt(r(FILA_CAB - 1, FILA_CAB), 'userEnteredFormat',
    { backgroundColor: AZUL, textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 }, fontSize: 9 }, numberFormat: { type: 'DATE', pattern: 'mmm' }, horizontalAlignment: 'CENTER' })
  fmt({ ...r(FILA_CAB - 1, FILA_CAB), startColumnIndex: C_TOTREAL, endColumnIndex: ANCHO }, 'userEnteredFormat.numberFormat', { numberFormat: { type: 'TEXT' } })
  // Los meses proyectados en ámbar: un estimado no se puede confundir con un hecho.
  const primeraProy = new Date().getUTCMonth() + 1 // 0-based mes actual +1 = primer mes futuro
  fmt({ ...r(g.f0 - 1, g.f1), startColumnIndex: C_MES0 + primeraProy, endColumnIndex: C_MES0 + 12 },
    'userEnteredFormat.backgroundColor,userEnteredFormat.textFormat', { backgroundColor: AMBAR, textFormat: { italic: true } })
  fmt(r(g.fTot - 1, g.fTot), 'userEnteredFormat.textFormat,userEnteredFormat.backgroundColor',
    { textFormat: { bold: true }, backgroundColor: { red: 0.89, green: 0.91, blue: 0.94 } })
  fmt({ ...r(g.ctrl + 2, g.ctrl + 3), startColumnIndex: 0, endColumnIndex: 1 }, 'userEnteredFormat.textFormat', { textFormat: { bold: true } })
  // Las notas van en la columna C, pero SÓLO en el bloque de control: en las filas de arriba la C es
  // FEBRERO. Pintar la columna entera de texto —copiado de otra pestaña donde C sí es la columna de
  // notas— dejaba febrero mostrando "359154,95" en crudo al lado de enero en pesos.
  fmt(r(g.ctrl - 1, n, 2, 3), 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment',
    { numberFormat: { type: 'TEXT' }, horizontalAlignment: 'LEFT' })
  // Las columnas auxiliares, ocultas: son andamio, no información.
  req.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: C_AUX0, endIndex: ANCHO }, properties: { hiddenByUser: true }, fields: 'hiddenByUser' } })
  req.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 240 }, fields: 'pixelSize' } })
  req.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 1, endIndex: ANCHO_VIS }, properties: { pixelSize: 96 }, fields: 'pixelSize' } })
  req.push({ updateSheetProperties: { properties: { sheetId, gridProperties: { frozenRowCount: FILA_CAB, frozenColumnCount: 1 } }, fields: 'gridProperties.frozenRowCount,gridProperties.frozenColumnCount' } })
  await google.spreadsheetBatchUpdate(ID, req)
}

main().catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
