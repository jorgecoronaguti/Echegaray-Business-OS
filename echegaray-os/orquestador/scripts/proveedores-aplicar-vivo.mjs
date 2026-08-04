#!/usr/bin/env node
// APLICA EL PLAN DE `proveedores-plan-vivo.mjs` — el gemelo que sí escribe.
//
// ═══ POR QUÉ SON DOS SCRIPTS Y NO UN FLAG ═══
//
// El que lee no importa una sola función de escritura: es imposible que escriba por accidente. Este
// importa las dos, y por eso todo lo que decide QUÉ se escribe vive en las mismas funciones puras que
// usa el plan (`rangosDesdeEncabezado`, `geometriaSeccion1`, `planDeEscritura`, `formulaPorFactura`).
// No hay forma de que el plan muestre una cosa y esto escriba otra.
//
// ═══ QUÉ CAMBIA EN LA PESTAÑA ═══
//
// La sección 1 pasa de VEINTE filas cableadas —con el nombre del proveedor tipeado adentro de la
// fórmula y la fila de Compras cableada (`Compras!$X$796`)— a UNA celda ancla cuyo derrame es la
// tabla. Medido el 04/08: 36 celdas dejaban hueco y 150 referencias estaban ciegas, y por eso RSV y
// DUPEC —cargados ese mismo día— no aparecían: un hueco de $537.363 que crecía con cada carga.
//
// ═══ LO QUE NO SE TOCA, Y CÓMO SE PRUEBA ═══
//
// La columna que el dueño rotuló más allá del contrato (hoy H, "Comentarios") y la sección 2 entera
// —donde vive la columna B con los CUIT que cargó a mano—. No alcanza con que el rango "no las
// incluya": un rango mal calculado también cree que no las incluye. Se toma la HUELLA de esas celdas
// antes de escribir, se vuelve a tomar después, y si aparece una sola diferencia el script lo grita.
// La evidencia es el dato leído del archivo, nunca la pantalla que respondió que sí.
//
//   node orquestador/scripts/proveedores-aplicar-vivo.mjs            → muestra qué haría
//   node orquestador/scripts/proveedores-aplicar-vivo.mjs --aplicar  → escribe y verifica

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import {
  diferenciasDeHuella, huellaProtegida, planDeEscritura, rangosDesdeEncabezado,
} from '../lib/proveedores-bloque-vivo.mjs'
import { geometriaDeLaSeccion } from '../lib/proveedores-pivot-seccion1.mjs'
import { formulaControl, formulaPorFactura, rangosCompras } from '../lib/proveedores-deuda-viva.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const PESTAÑA = 'Proveedores'
const APLICAR = process.argv.includes('--aplicar')

/** Los rótulos del cuadro, en el orden del dueño. El importe vuelve a la D, donde él lo tenía. */
const ROTULOS = ['Proveedor / factura', 'Próximo pago', 'Comprobante', 'Importe', 'Obra',
  'Tipo de Pago', 'Categoría']

const iCol = (ref) => {
  const m = /\$([A-Z]{1,3})\$/.exec(ref)
  let n = 0
  for (const ch of m?.[1] ?? 'A') n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

/** Cuántas facturas comerciales pendientes hay HOY: es lo que dimensiona la reserva del derrame. */
function contarPendientes(compras, rangos) {
  return compras.filter((f) => String(f?.[iCol(rangos.estado)] ?? '').trim() === 'Pendiente'
    && String(f?.[iCol(rangos.comercial)] ?? '').trim() === '1'
    && String(f?.[iCol(rangos.prov)] ?? '').trim() !== '').length
}

/** La celda del control, ubicada por el aviso que reemplaza — nunca por un número de fila. */
function filaDelControl(filas, geo) {
  const i = filas.findIndex((f, k) => k < geo.filaEncabezado
    && (f ?? []).some((c) => /Faltan .*factura|cierra con el titular/i.test(String(c ?? ''))))
  if (i < 0) throw new Error('no encontré la celda del aviso/control arriba del encabezado: no escribo a ciegas')
  return i + 1
}

/**
 * EL BLOQUE ES DUEÑO DE TODO SU ANCHO — Y ESO INCLUYE EL FORMATO DE SUS FILAS.
 *
 * El diseño viejo alternaba una fila-cabecera de proveedor EN NEGRITA con su fila de detalle en
 * redonda. Con el bloque plano esa alternancia queda huérfana: "Gruas San Blas" en negrita, "Mariana
 * SA" normal, "Hormiserv" negrita otra vez, sin que la negrita signifique nada. Es literalmente el
 * "son un desastre" del pedido, y no se arregla escribiendo la fórmula: hay que uniformar las filas.
 *
 * Se uniforma SÓLO el ancho del contrato (A..G). La columna H es del dueño y no entra — es la lección
 * de `columna-del-dueno-fuera-del-footprint`, donde rellenar "hasta el ancho de la hoja" le borró
 * catorce fechas.
 *
 * Alineación: texto a la izquierda, importes y fechas a la derecha, que es donde la coma se alinea y
 * las magnitudes se comparan de un vistazo.
 */
export function alineacionDelContrato() {
  // El orden es el de COLS_FACTURA: proveedor · próximo pago · comprobante · importe · obra · tipo · categoría
  return ['LEFT', 'RIGHT', 'LEFT', 'RIGHT', 'LEFT', 'LEFT', 'LEFT']
}

function pedidosDeFormato(sheetId, plan, geo) {
  const desde = geo.filaEncabezado
  return alineacionDelContrato().map((horizontalAlignment, c) => ({
    repeatCell: {
      range: { sheetId, startRowIndex: desde, endRowIndex: desde + plan.reserva, startColumnIndex: c, endColumnIndex: c + 1 },
      cell: { userEnteredFormat: { horizontalAlignment, textFormat: { bold: false, italic: false, fontSize: 9 } } },
      fields: 'userEnteredFormat.horizontalAlignment,userEnteredFormat.textFormat(bold,italic,fontSize)',
    },
  }))
}

/**
 * LAS ESCRITURAS. Sólo `userEnteredValue` y el formato del propio bloque: el resto de la pestaña es
 * del dueño y no se toca acá. El rango se limpia entero antes de poner el ancla — si quedara una
 * fórmula vieja en el camino del derrame, Sheets devuelve #REF! y la tabla entera desaparece.
 */
function pedidos({ sheetId, plan, geo, filaControl, formulaTabla, formulaCtl }) {
  const anclaFila = geo.filaEncabezado
  const vacia = () => ({ userEnteredValue: null })
  const filasVacias = Array.from({ length: plan.reserva }, () => ({
    values: Array.from({ length: plan.ancho }, vacia),
  }))
  return [
    { updateCells: {
      range: { sheetId, startRowIndex: anclaFila, endRowIndex: anclaFila + plan.reserva, startColumnIndex: 0, endColumnIndex: plan.ancho },
      rows: filasVacias, fields: 'userEnteredValue' } },
    { updateCells: {
      range: { sheetId, startRowIndex: anclaFila, endRowIndex: anclaFila + 1, startColumnIndex: 0, endColumnIndex: 1 },
      rows: [{ values: [{ userEnteredValue: { formulaValue: formulaTabla } }] }], fields: 'userEnteredValue' } },
    { updateCells: {
      range: { sheetId, startRowIndex: filaControl - 1, endRowIndex: filaControl, startColumnIndex: 0, endColumnIndex: 1 },
      rows: [{ values: [{ userEnteredValue: { formulaValue: formulaCtl } }] }], fields: 'userEnteredValue' } },
    ...pedidosDeFormato(sheetId, plan, geo),
  ]
}

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })

  const cabecera = (await google.readSheetValues(ID, 'Compras!A3:BZ3'))[0] || []
  const { rangos: crudos, avisos } = rangosDesdeEncabezado(cabecera)
  for (const a of avisos) console.warn(`  ⚠ ${a}`)
  const rangos = rangosCompras(crudos)

  const compras = await google.readSheetValues(ID, 'Compras!A4:BZ')
  const pendientes = contarPendientes(compras, rangos)

  const antes = await google.readSheetValues(ID, `${PESTAÑA}!A1:R220`, { render: 'FORMULA' })
  // La geometría se busca sobre el valor VISIBLE: si la sección 1 quedó como tabla dinámica, sus
  // celdas no tienen ni valor ni fórmula propios y una lectura FORMULA devuelve el bloque vacío —
  // el script no encontraba sus propios rótulos y no podía reemplazarla.
  const visible = await google.readSheetValues(ID, `${PESTAÑA}!A1:R220`, { render: 'FORMATTED_VALUE' })
  const geo = geometriaDeLaSeccion(visible)
  // Los rótulos del contrato: si la sección quedó como dinámica, el encabezado que hay es el de
  // Compras. Se reponen los del cuadro para que el plan valide contra lo que se va a escribir.
  const plan = planDeEscritura({ ...geo, encabezados: ROTULOS, pendientes })
  if (!plan.ok) { console.error(`✗ NO HAY PLAN: ${plan.motivo}`); process.exitCode = 1; return }

  const filaControl = filaDelControl(antes, geo)
  const finSaldo = geo.filaEncabezado + plan.reserva
  const formulaTabla = formulaPorFactura({ rangos, reserva: plan.reserva })
  const formulaCtl = formulaControl({
    rangos, rangoSaldo: `$D$${geo.filaEncabezado + 1}:$D$${finSaldo}`, que: 'el detalle factura por factura',
  })

  console.log(`PENDIENTES COMERCIALES HOY: ${pendientes}`)
  console.log(`ANCLA   ${PESTAÑA}!${plan.ancla}   RANGO ${PESTAÑA}!${plan.rango}   CONTROL A${filaControl}`)
  console.log(`NO SE TOCA  ${plan.columnasDelDueño.map((c) => `${c.columna} (${c.rotulo})`).join(' · ') || '—'}`)
  console.log(`NO SE TOCA  la sección 2 entera desde la fila ${geo.filaLimite}`)
  for (const a of plan.avisos) console.log(`  ⚠ ${a}`)
  if (!APLICAR) { console.log('\n(sin --aplicar: no se escribió nada)'); return }

  const meta = await google.getSheetMeta(ID)
  const sheetId = meta.find((s) => s.title === PESTAÑA)?.sheetId
  if (!Number.isInteger(sheetId)) throw new Error(`no encontré el sheetId de ${PESTAÑA}`)

  const huellaAntes = huellaProtegida(antes, { ...geo, ancho: plan.ancho })
  console.log(`\nHUELLA PROTEGIDA ANTES: ${huellaAntes.size} celdas (sección 2 + columnas del dueño)`)

  await google.spreadsheetBatchUpdate(ID,
    pedidos({ sheetId, plan, geo, filaControl, formulaTabla, formulaCtl }), { espejo: true })

  const despues = await google.readSheetValues(ID, `${PESTAÑA}!A1:R220`, { render: 'FORMULA' })
  const dif = diferenciasDeHuella(huellaAntes, huellaProtegida(despues, { ...geo, ancho: plan.ancho }))
  if (dif.length) {
    console.error(`\n✗✗ LA ESCRITURA SALIÓ DE SU RANGO — ${dif.length} celda(s) protegidas cambiaron:`)
    for (const d of dif.slice(0, 40)) console.error(`   ${d.dir}: "${d.antes}" → "${d.despues}"`)
    process.exitCode = 1
    return
  }
  console.log('✓ ni una celda protegida cambió (sección 2 y columnas del dueño, verificadas releyendo)')

  const vista = await google.readSheetValues(ID, `${PESTAÑA}!A${filaControl}:H${finSaldo}`)
  console.log(`\nCONTROL  ${String(vista[0]?.[0] ?? '')}`)
  console.log('\nBLOQUE VIVO:')
  for (const f of vista.slice(2)) if (String(f?.[0] ?? '').trim()) console.log('  ' + f.map((c) => String(c ?? '')).join(' | '))
}

main().catch((e) => { console.error(e); process.exit(1) })
