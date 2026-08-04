#!/usr/bin/env node
// ESCRIBE LA SECCIÓN 1 DE PROVEEDORES: la deuda agrupada por proveedor, con sus facturas debajo.
//
// Todo el bloque es UN derrame desde la celda ancla. Ninguna fila materializada: al pagarle a un
// proveedor, su cabecera y sus facturas desaparecen y el cuadro se cierra solo — sin el hueco que el
// dueño reportó. El titular de arriba ya es fórmula viva y no se toca.
//
// Lo que NO se toca: la columna H (Comentarios) y la sección 2 entera. Se toma la huella de esas
// celdas antes, se relee después, y una sola diferencia aborta con rojo.
//
//   node orquestador/scripts/proveedores-agrupado-aplicar.mjs            → muestra qué haría
//   node orquestador/scripts/proveedores-agrupado-aplicar.mjs --aplicar  → escribe y verifica

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { diferenciasDeHuella, huellaProtegida } from '../lib/proveedores-bloque-vivo.mjs'
import { geometriaDeLaSeccion } from '../lib/proveedores-pivot-seccion1.mjs'
import {
  altoDelBloque, formulaBloqueAgrupado, mismoOrdenQueLaFormula, rangosDeGrupo, ROTULOS,
} from '../lib/proveedores-agrupado.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const PESTAÑA = 'Proveedores'
const APLICAR = process.argv.includes('--aplicar')
const ANCHO = ROTULOS.length

const plata = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-AR')
const iCol = { prov: 4, comp: 7, obra: 9, tipo: 15, fecha: 16, estado: 23, comercial: 35, saldo: 37 }

/** El formato de cada columna del bloque. Una dinámica o un bloque anterior dejan el suyo pegado:
 *  las fechas salieron como $46.238 y los conteos como 01/01/1900 por no reponerlo. */
function formatos(sheetId, desde, alto) {
  const col = (i, numberFormat, horizontalAlignment) => ({ repeatCell: {
    range: { sheetId, startRowIndex: desde, endRowIndex: desde + alto, startColumnIndex: i, endColumnIndex: i + 1 },
    cell: { userEnteredFormat: { numberFormat, horizontalAlignment } },
    fields: 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment' } })
  const T = { type: 'TEXT', pattern: '@' }
  return [
    col(0, T, 'LEFT'), col(1, { type: 'DATE', pattern: 'dd/mm/yyyy' }, 'RIGHT'), col(2, T, 'LEFT'),
    col(3, { type: 'CURRENCY', pattern: '"$"#,##0' }, 'RIGHT'), col(4, T, 'LEFT'), col(5, T, 'LEFT'), col(6, T, 'LEFT'),
  ]
}

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })

  // El universo, con EXACTAMENTE el mismo criterio que la fórmula: estado y comercial.
  const compras = await google.readSheetValues(ID, 'Compras!A4:AL', { render: 'UNFORMATTED_VALUE' })
  const pendientes = (compras ?? [])
    .filter((f) => String(f?.[iCol.estado] ?? '').trim() === 'Pendiente'
      && String(f?.[iCol.comercial] ?? '').trim() === '1'
      && String(f?.[iCol.prov] ?? '').trim() !== '')
    .map((f) => ({ proveedor: String(f[iCol.prov]).trim(), proximoPago: f[iCol.fecha], saldo: Number(f[iCol.saldo]) || 0 }))
  const total = pendientes.reduce((a, x) => a + x.saldo, 0)

  const visible = await google.readSheetValues(ID, `${PESTAÑA}!A1:R220`, { render: 'FORMATTED_VALUE' })
  const antes = await google.readSheetValues(ID, `${PESTAÑA}!A1:R220`, { render: 'FORMULA' })
  const geo = geometriaDeLaSeccion(visible)

  const ordenadas = mismoOrdenQueLaFormula(pendientes)
  const alto = altoDelBloque(ordenadas)
  const anclaFila = geo.filaEncabezado + 1
  const disponibles = geo.filaLimite - anclaFila
  const grupos = rangosDeGrupo(ordenadas, anclaFila - 1)

  console.log(`FACTURAS ${pendientes.length} · PROVEEDORES ${new Set(pendientes.map((x) => x.proveedor)).size} · TOTAL ${plata(total)}`)
  console.log(`ANCLA ${PESTAÑA}!A${anclaFila} · alto ${alto} · disponibles ${disponibles} hasta la sección 2 (fila ${geo.filaLimite})`)
  console.log(`GRUPOS +/- : ${grupos.map((g) => `${g.proveedor} ${g.desde}-${g.hasta}`).join(' · ') || '—'}`)
  // SI NO ENTRA, SE HACE LUGAR — no se recorta el cuadro. Insertar filas ANTES del título de la
  // sección 2 empuja todo lo de abajo y Sheets reapunta solo las fórmulas y los rangos con nombre.
  // El colchón es para que una factura nueva no obligue a insertar otra vez cada vez.
  const COLCHON = 6
  const faltan = alto > disponibles ? alto - disponibles + COLCHON : 0
  if (faltan) console.log(`⚠ no entra por ${alto - disponibles} fila(s): se insertan ${faltan} antes de la sección 2`)
  if (!APLICAR) { console.log('\n(sin --aplicar: no se escribió nada)'); return }

  const meta = await google.getSheetMeta(ID)
  const sheetId = meta.find((s) => s.title === PESTAÑA)?.sheetId
  if (!Number.isInteger(sheetId)) throw new Error('no encontré el sheetId de Proveedores')

  if (faltan) {
    await google.spreadsheetBatchUpdate(ID, [{ insertDimension: {
      range: { sheetId, dimension: 'ROWS', startIndex: geo.filaLimite - 1, endIndex: geo.filaLimite - 1 + faltan },
      inheritFromBefore: true } }], { espejo: true })
    geo.filaLimite += faltan
    console.log(`  la sección 2 ahora arranca en la fila ${geo.filaLimite}`)
  }

  // LA HUELLA SE TOMA DESPUÉS DE INSERTAR, NO ANTES. Insertar filas corre todo lo de abajo: una
  // huella tomada antes compara la fila 101 vieja contra la 107 nueva y grita 769 diferencias que
  // no son daño, sino el corrimiento. Un guard que llora siempre no protege nada — se ignora.
  const base = faltan ? await google.readSheetValues(ID, `${PESTAÑA}!A1:R220`, { render: 'FORMULA' }) : antes
  const huellaAntes = huellaProtegida(base, { ...geo, ancho: ANCHO })
  console.log(`\nHUELLA PROTEGIDA ANTES: ${huellaAntes.size} celdas`)

  const desdeIdx = anclaFila - 1
  const hastaIdx = geo.filaLimite - 1
  const vacias = Array.from({ length: hastaIdx - desdeIdx }, () => ({
    values: Array.from({ length: ANCHO }, () => ({ userEnteredValue: null })),
  }))
  // Los grupos viejos se borran antes de crear los nuevos: la API no reemplaza un grupo, lo apila.
  const gruposViejos = (await google.getRowGroups(ID)).find((s) => s.title === PESTAÑA)?.grupos ?? []
  const borrarGrupos = gruposViejos
    .filter((g) => g.startIndex >= geo.filaEncabezado - 1 && g.endIndex <= geo.filaLimite)
    .map((g) => ({ deleteDimensionGroup: { range: { sheetId, dimension: 'ROWS', startIndex: g.startIndex, endIndex: g.endIndex } } }))

  await google.spreadsheetBatchUpdate(ID, [
    ...borrarGrupos,
    { updateCells: {
      range: { sheetId, startRowIndex: geo.filaEncabezado - 1, endRowIndex: hastaIdx, startColumnIndex: 0, endColumnIndex: ANCHO },
      rows: [{ values: ROTULOS.map((v) => ({ userEnteredValue: { stringValue: v } })) }, ...vacias],
      fields: 'userEnteredValue' } },
    { updateCells: {
      range: { sheetId, startRowIndex: desdeIdx, endRowIndex: desdeIdx + 1, startColumnIndex: 0, endColumnIndex: 1 },
      rows: [{ values: [{ userEnteredValue: { formulaValue: `=${formulaBloqueAgrupado()}` } }] }],
      fields: 'userEnteredValue' } },
    ...formatos(sheetId, desdeIdx, alto),
    // La cabecera de cada proveedor en negrita: la jerarquía se lee sin plegar nada.
    ...grupos.map((g) => ({ repeatCell: {
      range: { sheetId, startRowIndex: g.desde - 2, endRowIndex: g.desde - 1, startColumnIndex: 0, endColumnIndex: ANCHO },
      cell: { userEnteredFormat: { textFormat: { bold: true } } }, fields: 'userEnteredFormat.textFormat.bold' } })),
    ...grupos.map((g) => ({ addDimensionGroup: {
      range: { sheetId, dimension: 'ROWS', startIndex: g.desde, endIndex: g.hasta } } })),
  ].filter(Boolean), { espejo: true })

  const despues = await google.readSheetValues(ID, `${PESTAÑA}!A1:R220`, { render: 'FORMULA' })
  const dif = diferenciasDeHuella(huellaAntes, huellaProtegida(despues, { ...geo, ancho: ANCHO }))
  if (dif.length) {
    console.error(`\n✗✗ SALIÓ DE SU RANGO — ${dif.length} celda(s) protegidas cambiaron:`)
    for (const d of dif.slice(0, 30)) console.error(`   ${d.dir}: "${d.antes}" → "${d.despues}"`)
    process.exitCode = 1
    return
  }
  console.log('✓ ni una celda protegida cambió (columna H y sección 2, verificadas releyendo)')

  const vista = await google.readSheetValues(ID, `${PESTAÑA}!A${geo.filaEncabezado}:H${geo.filaLimite - 1}`)
  console.log('\nEL CUADRO, LEÍDO DEL ARCHIVO:')
  for (const f of vista ?? []) {
    const t = (f ?? []).map((c) => String(c ?? '')).join(' | ')
    if (t.replace(/[| ]/g, '')) console.log('  ' + t.slice(0, 110))
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
