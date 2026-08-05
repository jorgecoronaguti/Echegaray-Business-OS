#!/usr/bin/env node
// LA SECCIÓN 2 COMO TABLA DINÁMICA NATIVA — LOS QUE INFORMAN, Y EL RESTO EN UNA LÍNEA.
//
// La pregunta que contesta esta sección es CONCENTRACIÓN DE PROVEEDOR: con quién se gasta. Listaba
// los 105 comerciales y terminaba en `Estilo Herrajes $9.197` y `Google $25`: sesenta filas que no
// se negocian, no se financian y no son un riesgo de suministro, enterrando a las que sí. Ahora
// lista los que acumulan el 95% del gasto y cierra con dos líneas de pie —resto y total— que hacen
// que el corte no pierda un peso. El criterio y la evidencia del umbral, en
// `lib/proveedores-concentracion.mjs`; las fórmulas del pie, en `lib/proveedores-seccion2-pie.mjs`.
//
// Antes de esto listaba 30 por `TOP = 30` en el generador de texto: un número arbitrario que dejaba
// $28M en una línea muda y que no se movía con la realidad de la empresa.
//
// El CUIT llega por la columna derivada `CUIT (OS)` de Compras, que puso
// `proveedores-cuenta-corriente.mjs` desde `public.proveedores`. Va como segundo campo de fila: cada
// proveedor tiene uno solo, así que no agrupa y no deja ninguna celda vacía.
//
//   node orquestador/scripts/proveedores-seccion2-pivot.mjs            → muestra qué haría
//   node orquestador/scripts/proveedores-seccion2-pivot.mjs --aplicar  → escribe y verifica

import { loadConfig } from '../lib/config.mjs'
import { HAIR, INK } from '../lib/estilo-statement.mjs'
import { CONTADOR, MONEDA_CUERPO, MONEDA_TOTAL } from '../lib/formato-statement.mjs'
import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { COLCHON_FINAL, filaDelSiguienteTitulo, filasNoVacias, sobranteDeColchon, ultimaConDato } from '../lib/proveedores-colchon.mjs'
import { cortePorConcentracion, escalones, nombresVisibles, UMBRAL } from '../lib/proveedores-concentracion.mjs'
import { ANCHOS_PROVEEDORES } from '../lib/proveedores-frontera.mjs'
import { requestsDeRotulos, rotulosQueNoEntran } from '../lib/proveedores-rotulos.mjs'
import { columnasDeCompras, filasDelPie, referencias } from '../lib/proveedores-seccion2-pie.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const PESTAÑA = 'Proveedores'
const APLICAR = process.argv.includes('--aplicar')
/** Lo que se reserva de una cuando hay que insertar: insertar de a una fila cuesta una corrida entera. */
const COLCHON_RESERVA = 10
/** Hasta dónde se mira el ancho para decidir si una fila está vacía. Bien a la derecha del bloque. */
const ANCHO_LECTURA = 'AZ'
/** Las columnas del cuadro: proveedor · CUIT · comprado · comprobantes. */
const ANCHO = 4
/** Los nombres de los dos valores. Se declaran una vez: van al pivot Y a la fila de rótulos. */
const VALORES = Object.freeze(['Comprado 2026', 'Comprobantes'])

const plata = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-AR')

/** Un proveedor por fila: cuánto se le compró y en cuántos comprobantes. */
const pivot = (fuente, idx, visibles) => ({
  source: fuente,
  rows: [
    { sourceColumnOffset: idx.proveedor, showTotals: false, sortOrder: 'DESCENDING', valueBucket: { valuesIndex: 0 } },
    { sourceColumnOffset: idx.cuit, showTotals: false, sortOrder: 'ASCENDING' },
  ],
  values: [
    { sourceColumnOffset: idx.total, summarizeFunction: 'SUM', name: VALORES[0] },
    { sourceColumnOffset: idx.proveedor, summarizeFunction: 'COUNTA', name: VALORES[1] },
  ],
  // NUNCA por `condition`: un filtro por condición sobre una columna de grid descarta TODAS las
  // filas sin dar error, y la dinámica aparece perfecta y vacía. Los valores van como TEXTO — es la
  // representación lo que el pivot compara, aunque la columna sea numérica.
  filterSpecs: [
    { columnOffsetIndex: idx.comercial, filterCriteria: { visibleValues: ['1'] } },
    { columnOffsetIndex: idx.proveedor, filterCriteria: { visibleValues: visibles } },
  ],
  valueLayout: 'HORIZONTAL',
})

/**
 * Dónde empieza y termina la sección 2, por su TÍTULO — nunca por su propia salida anterior.
 *
 * El límite de abajo es LA SECCIÓN SIGUIENTE, sea la que sea. Estaba anclado a `/^3 ·/` y un día
 * dejó de existir: el generador del bloque de texto renumeró y la pestaña quedó 1, 2, 7, 5. El
 * número de la sección de al lado no es mío y se mueve; que abajo empiece OTRA sección, sí.
 */
function geometria(filas) {
  const t = (i) => String((filas[i] ?? [])[0] ?? '').trim()
  const i2 = filas.findIndex((_, i) => /^2\s*[·.\-]/.test(t(i)))
  if (i2 < 0) throw new Error('no encontré el título de la sección 2')
  const filaLimite = filaDelSiguienteTitulo(filas, i2 + 1)
  if (!filaLimite) throw new Error('no encontré la sección que sigue a la 2: sin límite no escribo')
  const iCab = filas.findIndex((_, i) => i > i2 && i < filaLimite - 1 && /PROVEEDOR/i.test(t(i)))
  if (iCab < 0) throw new Error('no encontré la fila de rótulos de la sección 2')
  return { filaRotulos: iCab + 1, filaLimite }
}

/** El formato de una columna del bloque, declarado en cada corrida: una dinámica no trae ninguno. */
const fmt = (sid, desde, hasta, col, numberFormat, align) => ({ repeatCell: {
  range: { sheetId: sid, startRowIndex: desde, endRowIndex: hasta, startColumnIndex: col, endColumnIndex: col + 1 },
  cell: { userEnteredFormat: { numberFormat, horizontalAlignment: align } },
  fields: 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment' } })

/** Una sola línea fina gris, siempre por abajo: es lo único que separa bloques acá. Sin reja. */
const raya = (sid, f0, ancho) => ({ repeatCell: {
  range: { sheetId: sid, startRowIndex: f0, endRowIndex: f0 + 1, startColumnIndex: 0, endColumnIndex: ancho },
  cell: { userEnteredFormat: { borders: { bottom: { style: 'SOLID', width: 1, color: HAIR } } } },
  fields: 'userEnteredFormat.borders.bottom' } })

const negrita = (sid, f0, ancho, bold = true) => ({ repeatCell: {
  range: { sheetId: sid, startRowIndex: f0, endRowIndex: f0 + 1, startColumnIndex: 0, endColumnIndex: ancho },
  cell: { userEnteredFormat: { textFormat: { bold, foregroundColor: INK } } },
  fields: 'userEnteredFormat.textFormat.bold,userEnteredFormat.textFormat.foregroundColor' } })

/** Una fila de valores lista para `updateCells`. `null` = celda mía y va vacía. */
const celdas = (valores) => ({ values: valores.map((c) => {
  if (c === null || c === undefined) return { userEnteredValue: null }
  return { userEnteredValue: String(c).startsWith('=') ? { formulaValue: String(c) } : { stringValue: String(c) } }
}) })

function informarCorte(corte, filas) {
  console.log(`COMERCIALES ${corte.listados.length + corte.resto.cantidad} proveedores · COMPRADO ${plata(corte.total)}`)
  console.log('dónde cortar (acumulado del gasto):')
  for (const e of escalones(filas)) {
    const marca = e.umbral === UMBRAL ? '←' : ' '
    console.log(`  ${(e.umbral * 100).toFixed(0).padStart(3)}%  lista ${String(e.listados).padStart(3)}`
      + ` · resto ${String(e.restoN).padStart(3)} por ${plata(e.restoTotal).padStart(14)} ${marca}`)
  }
  if (corte.sinNombre) {
    console.log(`⚠ hay ${plata(corte.sinNombre.total)} de compras comerciales SIN NOMBRE de proveedor:`
      + ' una dinámica no puede filtrar por el vacío, así que caen en el resto (la plata no se pierde)')
  }
}

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  const cabecera = (await google.readSheetValues(ID, 'Compras!A3:BZ3', { render: 'FORMATTED_VALUE' }))?.[0] ?? []
  const idx = columnasDeCompras(cabecera)
  const R = referencias(idx)
  const compras = await google.readSheetValues(ID, 'Compras!A4:BZ', { render: 'UNFORMATTED_VALUE' })
  const corte = cortePorConcentracion(compras ?? [], { umbral: UMBRAL })
  informarCorte(corte, compras ?? [])

  const visible = await google.readSheetValues(ID, `${PESTAÑA}!A1:R300`, { render: 'FORMATTED_VALUE' })
  const geo = geometria(visible)
  const alto = 1 + corte.listados.length + 2 // rótulos + un proveedor por fila + resto + total
  const disponibles = geo.filaLimite - geo.filaRotulos - 1

  console.log(`RÓTULOS fila ${geo.filaRotulos} · la sección siguiente en la ${geo.filaLimite} · necesita ${alto}, hay ${disponibles}`)
  const faltan = alto > disponibles ? alto - disponibles + COLCHON_RESERVA : 0
  if (faltan) console.log(`⚠ se insertan ${faltan} fila(s) antes de la sección siguiente`)
  if (!APLICAR) { console.log('\n(sin --aplicar: no se escribió nada)'); return }

  const meta = await google.getSheetMeta(ID)
  const sid = meta.find((s) => s.title === PESTAÑA)?.sheetId
  const cm = meta.find((s) => s.title === 'Compras')
  if (!Number.isInteger(sid) || !(cm?.rows > 3)) throw new Error('no pude resolver las pestañas')

  if (faltan) {
    await google.spreadsheetBatchUpdate(ID, [{ insertDimension: {
      range: { sheetId: sid, dimension: 'ROWS', startIndex: geo.filaLimite - 1, endIndex: geo.filaLimite - 1 + faltan },
      inheritFromBefore: true } }], { espejo: true })
    geo.filaLimite += faltan
  }

  const fuente = { sheetId: cm.sheetId, startRowIndex: 2, endRowIndex: cm.rows, startColumnIndex: 0, endColumnIndex: idx.cuit + 1 }
  const p1 = await escribirDinamica({ google, sid, geo, corte, idx, fuente })
  if (!p1) return
  const p0 = geo.filaRotulos + 1
  // El pie va DEBAJO del final real de la dinámica, y el final real puede pasarse de lo estimado.
  // Si el pie no entra antes de la sección siguiente, no se escribe: escribir ahí le pisaría el
  // título a otro dueño. Un cuadro sin total se ve; un título comido, no.
  if (p1 + 2 > geo.filaLimite - 1) {
    console.error(`✗✗ el pie caería en la fila ${p1 + 2} y la sección siguiente arranca en la ${geo.filaLimite}:`
      + ' no escribo el resto ni el total. Corré de nuevo — la próxima corrida reserva con el alto real.')
    process.exitCode = 1
    return
  }
  // Los dos primeros rótulos los hereda de los encabezados de Compras (la API no deja renombrar un
  // campo de fila); los dos últimos son los `name` de los valores, declarados en VALORES.
  const rotulos = [String(cabecera[idx.proveedor] ?? '').trim(), String(cabecera[idx.cuit] ?? '').trim(), ...VALORES]
  for (const r of rotulosQueNoEntran(rotulos, ANCHOS_PROVEEDORES)) {
    console.log(`⚠ el rótulo "${r.texto}" necesita ${r.lineas} líneas en su columna: hay que acortarlo`)
  }
  await escribirPie({ google, sid, R, p0, p1, rotulos })
  await recortarYVerificar({ google, sid, geo, corte, p0, p1, fResto: p1 + 1, fTotal: p1 + 2 })
}

/**
 * PRIMERA PASADA: LA DINÁMICA SOLA, Y SE MIDE DÓNDE TERMINÓ DE VERDAD.
 *
 * El pie no se escribe todavía. El alto de una dinámica es una estimación —un proveedor con dos CUIT
 * distintos en Compras emite DOS filas— y escribir el pie donde uno CREE que termina es escribir
 * encima del cuadro: Google se niega a renderizarlo y la sección entera queda invisible.
 *
 * @returns {Promise<number>} la última fila emitida (base 1), o 0 si no emitió nada.
 */
async function escribirDinamica({ google, sid, geo, corte, idx, fuente }) {
  const iRot = geo.filaRotulos - 1
  const finIdx = geo.filaLimite - 1
  const vacias = Array.from({ length: finIdx - iRot }, () => ({ values: Array.from({ length: 6 }, () => ({ userEnteredValue: null })) }))
  await google.spreadsheetBatchUpdate(ID, [
    { updateCells: { range: { sheetId: sid, startRowIndex: iRot, endRowIndex: finIdx, startColumnIndex: 0, endColumnIndex: 6 },
      rows: vacias, fields: 'userEnteredValue,pivotTable' } },
    { updateCells: { range: { sheetId: sid, startRowIndex: iRot, endRowIndex: iRot + 1, startColumnIndex: 0, endColumnIndex: 1 },
      rows: [{ values: [{ pivotTable: pivot(fuente, idx, nombresVisibles(corte)) }] }], fields: 'pivotTable' } },
    // Ninguna fila oculta: siete lo estuvieron en la sección 1 y el total cerraba igual.
    { updateDimensionProperties: { range: { sheetId: sid, dimension: 'ROWS', startIndex: iRot, endIndex: finIdx },
      properties: { hiddenByUser: false }, fields: 'hiddenByUser' } },
  ], { espejo: true })

  const emitido = await google.readSheetValues(ID, `${PESTAÑA}!A${geo.filaRotulos}:D${geo.filaLimite - 1}`, { render: 'FORMULA' })
  const p1 = ultimaConDato(emitido ?? [], { desde: 1, hasta: geo.filaLimite - geo.filaRotulos + 1 }) + iRot
  const listadas = p1 - geo.filaRotulos // filas de datos, sin la de rótulos
  if (p1 <= geo.filaRotulos) {
    console.error('✗✗ la dinámica no emitió una sola fila: el filtro la dejó vacía (la trampa del `condition`)')
    process.exitCode = 1
    return 0
  }
  if (listadas !== corte.listados.length) {
    console.log(`la dinámica emitió ${listadas} fila(s) de datos y se habían contado ${corte.listados.length}`
      + ' proveedores (un proveedor con dos CUIT distintos en Compras emite dos filas)')
  }
  return p1
}

/** SEGUNDA PASADA: el pie, pegado al final REAL, y el formato de cada columna declarado de nuevo. */
async function escribirPie({ google, sid, R, p0, p1, rotulos }) {
  const fResto = p1 + 1
  const fTotal = p1 + 2
  const pie = filasDelPie({ R, p0, p1, fResto, fTotal })
  const iRot = p0 - 2
  await google.spreadsheetBatchUpdate(ID, [
    { updateCells: { range: { sheetId: sid, startRowIndex: fResto - 1, endRowIndex: fTotal, startColumnIndex: 0, endColumnIndex: ANCHO },
      rows: [celdas(pie.resto), celdas(pie.total)], fields: 'userEnteredValue' } },
    // CADA COLUMNA DECLARA SU FORMATO EN CADA CORRIDA. Una dinámica no trae formato: usa el que la
    // celda ya tenía, y por eso una fecha heredada convierte un conteo en `01/01/1900`.
    // ═══ Y EL CUERPO ARRANCA EN iRot + 1, NO EN iRot (05/08) ═══
    //
    // Con el rango arrancando en la fila de rótulos, la celda que dice "Comprado 2026" quedaba
    // declarada CURRENCY y la que dice "Comprobantes", contador: los dos `texto_en_numero` que el
    // auditor reportaba como C69 y D69 los producía este mismo bloque en cada corrida.
    fmt(sid, iRot + 1, fTotal, 0, { type: 'TEXT', pattern: '@' }, 'LEFT'),
    fmt(sid, iRot + 1, fTotal, 1, { type: 'TEXT', pattern: '@' }, 'LEFT'),
    // El "$" es del total: repetido en cada fila deja de informar y sólo ensucia la columna. El cero
    // va en raya y el negativo entre paréntesis (AICPA/FASB, endosado por IFRS y exigido por la SEC).
    fmt(sid, iRot + 1, fTotal - 1, 2, MONEDA_CUERPO, 'RIGHT'),
    fmt(sid, iRot + 1, fTotal - 1, 3, CONTADOR, 'RIGHT'),
    fmt(sid, fTotal - 1, fTotal, 2, MONEDA_TOTAL, 'RIGHT'),
    fmt(sid, fTotal - 1, fTotal, 3, CONTADOR, 'RIGHT'),
    // La fila de rótulos tiene su formato propio —texto, wrap y el alto que necesite— porque no es
    // cuerpo: ver lib/proveedores-rotulos.mjs.
    // `negrita` no va acá: la negrita del rótulo ya la pone `requestsDeRotulos`, y dos escritores
    // sobre el mismo formato es cómo se pierde el tamaño de fuente que uno de los dos declaró.
    ...requestsDeRotulos({ sheetId: sid, fila: iRot + 1, textos: rotulos, anchos: ANCHOS_PROVEEDORES, derecha: [2, 3] }),
    raya(sid, iRot, ANCHO),
    negrita(sid, fResto - 1, ANCHO, false), raya(sid, fResto - 1, ANCHO),
    negrita(sid, fTotal - 1, ANCHO),
    { updateDimensionProperties: { range: { sheetId: sid, dimension: 'ROWS', startIndex: iRot, endIndex: fTotal },
      properties: { hiddenByUser: false }, fields: 'hiddenByUser' } },
  ], { espejo: true })
}

/**
 * DEVOLVER EL AIRE QUE SOBRÓ, Y PROBAR QUE EL CORTE NO PERDIÓ PLATA.
 *
 * Las dos cosas RELEYENDO el archivo: lo que prueba una escritura es el dato leído en su destino,
 * nunca la pantalla que respondió que sí.
 */
async function recortarYVerificar({ google, sid, geo, corte, p0, p1, fResto, fTotal }) {
  const ancho = await google.readSheetValues(ID, `${PESTAÑA}!A1:${ANCHO_LECTURA}${geo.filaLimite + 20}`, { render: 'FORMULA' })
  const siguiente = filaDelSiguienteTitulo(ancho, geo.filaRotulos)
  const s = sobranteDeColchon({ filas: ancho, desde: geo.filaRotulos, hasta: siguiente })
  const sucias = filasNoVacias(ancho, s)
  if (s.sobrante && sucias.length) {
    console.error(`✗ NO recorto: las filas ${sucias.join(', ')} tienen datos — borrar no tiene vuelta`)
  } else if (s.sobrante) {
    console.log(`${s.blancas} fila(s) de aire antes de la sección siguiente → se devuelven ${s.sobrante}, quedan ${COLCHON_FINAL}`)
    await google.spreadsheetBatchUpdate(ID, [{ deleteDimension: { range: {
      sheetId: sid, dimension: 'ROWS', startIndex: s.desdeBorrar - 1, endIndex: s.hastaBorrar - 1 } } }], { espejo: true })
  } else {
    console.log(`${s.blancas} fila(s) de aire antes de la sección siguiente: no sobra nada (colchón ${COLCHON_FINAL})`)
  }

  const leido = await google.readSheetValues(ID, `${PESTAÑA}!A${p0}:D${fTotal}`, { render: 'UNFORMATTED_VALUE' })
  const num = (f, c) => Number((leido?.[f - p0] ?? [])[c]) || 0
  const listado = Array.from({ length: p1 - p0 + 1 }, (_, i) => num(p0 + i, 2)).reduce((a, b) => a + b, 0)
  const resto = num(fResto, 2)
  const total = num(fTotal, 2)
  console.log(`\nLEÍDO DEL ARCHIVO: ${p1 - p0 + 1} proveedores por ${plata(listado)}`
    + ` + resto ${plata(resto)} = ${plata(listado + resto)} · TOTAL ${plata(total)}`)
  console.log('  ' + String((leido?.[fResto - p0] ?? [])[0] ?? '(vacío)'))

  const difCuadro = Math.round(listado + resto - total)
  const difFuente = Math.round(total - corte.total)
  if (difCuadro !== 0) {
    console.error(`✗✗ el corte PIERDE ${plata(difCuadro)}: listado + resto no da el total del cuadro`)
    process.exitCode = 1
  } else console.log('✓ listado + resto = TOTAL, al peso')
  if (difFuente !== 0) {
    console.error(`✗✗ el TOTAL del cuadro difiere de las compras comerciales de Compras en ${plata(difFuente)}`)
    process.exitCode = 1
  } else console.log(`✓ el TOTAL es el de las compras comerciales de Compras (${plata(corte.total)}), al peso`)

  const rotos = (leido ?? []).flat().filter((c) => /#(REF|NAME|VALUE|DIV|N\/A|ERROR|¿NOMBRE)/i.test(String(c ?? '')))
  if (rotos.length) { console.error(`✗✗ ${rotos.length} celda(s) con error: ${[...new Set(rotos)].join(' · ')}`); process.exitCode = 1 }
}

main().catch((e) => { console.error(e); process.exit(1) })
