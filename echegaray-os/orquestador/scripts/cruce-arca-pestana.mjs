#!/usr/bin/env node
// _CRUCE_ARCA — LAS DISCREPANCIAS ENTRE COMPRAS Y EL LIBRO DE IVA DE ARCA, UNA POR FILA.
//
// ═══ POR QUÉ EXISTE (04/08) ═══
//
// Los controles de Materiales, Estructura y Recurrentes comparaban Compras contra Compras. El dueño:
// "pésimo eso". Un control se valida contra una fuente que el OS no produce, y la única de este
// archivo es el libro de IVA COMPRAS de ARCA.
//
// ═══ POR QUÉ UNA PESTAÑA Y NO UN NÚMERO PEGADO ═══
//
// El cruce NO se puede escribir como fórmula de Sheets: normaliza números de comprobante escritos de
// seis maneras distintas ("0038-00025483" y "38-25483" son la misma factura) y hace una segunda
// pasada por proveedor + importe para las filas que no tienen número cargado. Una fórmula daría un
// número PARECIDO y equivocado, que es peor que uno declarado. Ver lib/cobertura-arca.mjs.
//
// Así que se resuelve como ya se resolvió con `_ARCA_RAW`: se trae el INSUMO, no el RESULTADO. Esta
// pestaña es una lista de comprobantes con su número y su monto —el dato de grano fino—, y las
// pestañas visibles la suman con SUMIFS. Ninguna escribe un importe.
//
// ═══ LA VENTANA ═══
//
// ARCA imputa por período de DDJJ; Compras tiene fecha de factura Y fecha de caja. Este cruce usa la
// FECHA DE FACTURA, que es la única comparable con el libro. Ver lib/cruce-arca-compras.mjs.
//
//   node orquestador/scripts/cruce-arca-pestana.mjs --dry    ← primero, no escribe
//   node orquestador/scripts/cruce-arca-pestana.mjs

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { query } from '../lib/db.mjs'
import { normComprobante } from '../lib/cheques-cobertura.mjs'
import { conciliar, verificarIdentidad, veredicto } from '../lib/cruce-arca-compras.mjs'
import { CC, CFILA0, DIR } from '../lib/control-arca-bloque.mjs'
import * as E from '../lib/estilo-pestana.mjs'
import { escribirPreservando } from '../lib/preservar-anotaciones.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
export const PESTAÑA = '_CRUCE_ARCA'
const DRY = process.argv.includes('--dry')

/** Las columnas de la pestaña. El orden es contrato: lib/control-arca-bloque.mjs lo referencia. */
export const COLUMNAS = [
  ['Período', 'texto'], ['Dirección', 'texto'], ['Fecha', 'fecha'], ['Proveedor', 'texto'],
  ['CUIT', 'texto'], ['Comprobante', 'texto'], ['Importe', 'moneda'], ['Rubro', 'texto'],
  ['Fila de Compras', 'cantidad'], ['Qué hacer', 'texto'],
]

/**
 * Las columnas de Compras que este cruce lee, POR LETRA y no por encabezado.
 *
 * NO ES UN DESCUIDO. "Rubro de caja" aparece DOS VECES en la fila 3 de Compras (AB y AC) y "Orden de
 * pago (OS)" también (AG y AH). Resolver por nombre devuelve la PRIMERA, que es la columna
 * equivocada, y el cruce entero quedaría clasificando por una columna vacía sin dar un solo error.
 * Estas letras son el mismo contrato que ya usa lib/cash-flow-lineas.mjs; `verificarContrato()` grita
 * si alguna se movió.
 */
const IDX = { fechaFactura: 2, prov: 4, comprobante: 7, importe: 12, total: 14, rubro: 28, familia: 30, sub: 31 }
const ESPERADO = { 2: 'Fecha factura', 4: 'Proveedor', 7: 'N° Comprobante', 12: 'Importe', 14: 'Total', 28: 'Rubro de caja', 30: 'Familia de material', 31: 'Sub-rubro de estructura' }

/**
 * NÚCLEO PURO: ¿las columnas de Compras siguen donde el cruce cree?
 *
 * Una columna insertada a mano corre todo a la derecha y el cruce leería el rubro de otra columna.
 * Fallar acá es barato; producir una lista de "faltantes" fabricada por un corrimiento no lo es.
 */
export function verificarContrato(encabezado = []) {
  const norm = (s) => String(s ?? '').trim().toLowerCase()
  return Object.entries(ESPERADO)
    .filter(([i, nombre]) => norm(encabezado[Number(i)]) !== norm(nombre))
    .map(([i, nombre]) => `col ${Number(i)}: esperaba "${nombre}" y encontré "${encabezado[Number(i)] ?? ''}"`)
}

/** Serial de Sheets → 'YYYY-MM'. Se lee con UNFORMATTED_VALUE: el texto es_AR ya vació una pestaña. */
export const mesDeSerial = (v) => {
  const n = typeof v === 'number' ? v : NaN
  if (!Number.isFinite(n) || n <= 0) return ''
  const d = new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 86400000)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}
export const fechaDeSerial = (v) => {
  const n = typeof v === 'number' ? v : NaN
  if (!Number.isFinite(n) || n <= 0) return ''
  return new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 86400000).toISOString().slice(0, 10)
}

/** NÚCLEO PURO: las filas de Compras que el cruce necesita, ya normalizadas. */
export function filasDeCompras(valores = []) {
  return valores.map((f, i) => ({
    fila: i + CFILA0, periodo: mesDeSerial(f?.[IDX.fechaFactura]), fecha: fechaDeSerial(f?.[IDX.fechaFactura]),
    prov: String(f?.[IDX.prov] ?? '').trim(),
    comprobante: normComprobante(f?.[IDX.comprobante]),
    total: (typeof f?.[IDX.total] === 'number' ? f[IDX.total] : 0) || (typeof f?.[IDX.importe] === 'number' ? f[IDX.importe] : 0),
    rubro: String(f?.[IDX.rubro] ?? '').trim(),
    familia: String(f?.[IDX.familia] ?? '').trim(),
    sub: String(f?.[IDX.sub] ?? '').trim(),
  })).filter((f) => f.prov || f.total)
}

const comp = (c) => `${String(c.punto_venta ?? '').padStart(4, '0')}-${String(c.numero ?? '').padStart(8, '0')}`

/** NÚCLEO PURO: la grilla de datos — una fila por discrepancia, las dos direcciones en la misma lista. */
export function filasDeDiscrepancias(r) {
  const deArca = r.arcaSinCompras.map((c) => [
    `'${c.periodo ?? ''}`, DIR.arcaSinCompras,
    c.fecha_emision instanceof Date ? c.fecha_emision.toISOString().slice(0, 10) : String(c.fecha_emision ?? '').slice(0, 10),
    String(c.emisor_nombre ?? ''), String(c.emisor_cuit ?? ''), comp(c), Number(c.imp_total) || 0, '', '',
    'Cargar el comprobante en Compras: es gasto real que ningún cuadro está viendo.',
  ])
  const deCompras = r.comprasSinArca.map((f) => [
    `'${f.periodo}`, DIR.comprasSinArca, f.fecha, f.prov, '', f.comprobante || '(sin N° cargado)',
    f.total, f.rubro, f.fila,
    f.comprobante
      ? 'El N° está cargado pero ARCA no tiene ese comprobante: revisar el número, o el proveedor no lo declaró.'
      : 'Sin N° de comprobante en Compras: cargarlo, o confirmar que la compra no tuvo factura.',
  ])
  // Ordenadas por monto: los primeros concentran la plata y son los que alguien va a ir a buscar.
  return [...deArca, ...deCompras].sort((a, b) => Number(b[6]) - Number(a[6]))
}

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })

  const cab = await google.readSheetValues(ID, 'Compras!A3:BA3')
  const rotos = verificarContrato(cab[0] ?? [])
  // FALLA CERRADA. Con las columnas corridas, el cruce produciría una lista de faltantes inventada.
  if (rotos.length) throw new Error(`las columnas de Compras se movieron:\n  ${rotos.join('\n  ')}`)

  const valores = await google.readSheetValues(ID, 'Compras!A4:AN3000', { render: 'UNFORMATTED_VALUE' })
  const filasCompras = filasDeCompras(valores)
  const comprobantes = (await query(
    `select periodo, fecha_emision, tipo_comprobante, punto_venta, numero, emisor_cuit, emisor_nombre,
            imp_total::float8 imp_total
       from comprobantes_arca where tipo_libro='R' order by fecha_emision`)).rows

  const r = conciliar({ comprobantes, filasCompras, clave: (c) => normComprobante(`${c.punto_venta}-${c.numero}`) })
  const id = verificarIdentidad(r)
  const v = veredicto(r)
  const datos = filasDeDiscrepancias(r)

  console.log(`Ventana comparable (deducida de ARCA): ${r.ventana.desde ?? '—'} a ${r.ventana.hasta ?? '—'}  ·  criterio: FECHA DE FACTURA`)
  const $ = (n) => `$${Math.round(n).toLocaleString('es-AR')}`
  console.log(`  ARCA libro compras, neto de NC ......... ${$(r.totales.arcaNeto)}`)
  console.log(`  Compras comercial en la ventana ....... ${$(r.totales.comprasUniverso)}`)
  console.log(`  → ARCA registró y Compras no tiene .... ${$(r.totales.arcaSinCompras)}  (${r.arcaSinCompras.length} comprobantes)`)
  console.log(`  → Compras sin respaldo en ARCA ........ ${$(r.totales.comprasSinArca)}  (${r.comprasSinArca.length} filas)`)
  console.log(`  ⓘ fuera de ARCA por naturaleza ........ ${$(r.totales.fueraDeArca)}   ← no es error`)
  console.log(`  ⓘ posterior a la ventana .............. ${$(r.totales.fueraDeVentana)}   ← no es error`)
  console.log(`  identidad: dif ${$(id.difAgregada)} = explicado ${$(id.explicado)} + dif de importes ${$(id.difImportes)}  ${id.ok ? 'cierra' : '⚠ NO CIERRA'}`)
  if (r.desalineados.length) console.log(`  ⚠ ${r.desalineados.length} comprobante(s) con período de DDJJ distinto al mes de emisión`)
  if (r.desconocidos.length) console.log(`  ⚠ ${r.desconocidos.length} comprobante(s) con tipo que no sé si suma o resta`)
  if (r.totales.rubroDesconocido) console.log(`  ⚠ ${$(r.totales.rubroDesconocido)} en rubros que ninguna lista declara`)
  console.log(`\n${v.texto}\n`)
  if (!id.ok) { console.error('ERROR: la identidad no cierra — no escribo una pestaña que no se puede reconstruir.'); process.exit(1) }

  if (DRY) { console.log(`(--dry) ${datos.length} discrepancias · no escribí nada.`); return }

  let meta = await google.getSheetMeta(ID)
  let hoja = meta.find((h) => h.title === PESTAÑA)
  if (!hoja) {
    await google.spreadsheetBatchUpdate(ID, [{
      addSheet: { properties: { title: PESTAÑA, hidden: true, gridProperties: { rowCount: Math.max(datos.length + 40, 400), columnCount: COLUMNAS.length + 1, frozenRowCount: 3 } } },
    }])
    meta = await google.getSheetMeta(ID)
    hoja = meta.find((h) => h.title === PESTAÑA)
    console.log(`  pestaña ${PESTAÑA} creada (oculta)`)
  }

  // La grilla tiene que alcanzar ANTES de escribir: un rango que excede la hoja hace fallar el batch
  // entero y no escribe nada.
  const filasNecesarias = datos.length + CFILA0 + 20
  if ((hoja.rows ?? 0) < filasNecesarias) {
    await google.spreadsheetBatchUpdate(ID, [{
      updateSheetProperties: { properties: { sheetId: hoja.sheetId, gridProperties: { rowCount: filasNecesarias } }, fields: 'gridProperties.rowCount' },
    }])
  }

  const corte = new Date().toISOString().slice(0, 16).replace('T', ' ')
  const grid = [
    [`${PESTAÑA} — discrepancias Compras ↔ libro de IVA de ARCA · corte ${corte}`],
    [`Ventana ${r.ventana.desde ?? '—'}..${r.ventana.hasta ?? '—'} por FECHA DE FACTURA. ${datos.length} discrepancias. NO se carga a mano: la reescribe el agente. "${DIR.arcaSinCompras}" = ARCA lo registró y Compras no lo tiene (gasto real que ningún cuadro ve). "${DIR.comprasSinArca}" = está cargado en Compras y ARCA no tiene ese comprobante (carga sin respaldo fiscal). Lo que no lleva factura —jornales, cargas sociales, impuestos— NO está en esta lista: no es un error.`],
    COLUMNAS.map(([n]) => n),
    ...datos,
  ]
  // `espejo: true` como _ARCA_RAW: es la copia de un cruce contra una fuente externa, no hay nada del
  // dueño que preservar acá, y congelar un campo de ARCA sería congelar la fuente.
  const escritura = await escribirPreservando(google, ID, PESTAÑA, grid, {
    respetar: false, espejo: true, anchoHoja: Math.max(COLUMNAS.length, hoja.cols ?? COLUMNAS.length),
  })

  // ═══ SI LA ESCRITURA SE SALTEÓ, NO SE TOCA LA GEOMETRÍA ═══
  //
  // El desastre de CAJA no fue de CAJA, fue del PATRÓN: seis generadores descartaban el resultado de
  // `escribirPreservando` y formateaban igual, pintando la geometría de la grilla NUEVA sobre los
  // valores VIEJOS. Una pestaña que no se escribió no cambió de forma.
  const salteada = Boolean(escritura?.bloqueada || escritura?.editadaPorHumano)
  if (salteada) { console.log('  🔒 bajo tu control: no escribí, y por lo tanto no le toco el formato. Queda como la dejaste.'); return }
  const { conservadas } = escritura
  if (conservadas.length) console.log(`  ✋ ${conservadas.length} celda(s) de una persona — CONSERVADAS`)

  if (!salteada) await formatear(google, hoja, filasNecesarias)

  // VERIFICACIÓN DEL EFECTO: se relee la pestaña y se cuenta lo que quedó escrito. Lo que prueba una
  // escritura es el dato leído en su destino, nunca la respuesta del API.
  const leido = await google.readSheetValues(ID, `${PESTAÑA}!${CC.importe}${CFILA0}:${CC.importe}${CFILA0 + datos.length}`)
  const escritas = leido.filter((f) => String(f?.[0] ?? '').trim()).length
  console.log(`${PESTAÑA}: ${datos.length} discrepancias · ${escritas} escritas`)
  if (escritas !== datos.length) { console.log('  ⚠ no coinciden'); process.exitCode = 1 }
}

async function formatear(google, hoja, filasNecesarias) {
  const rg = (r0, r1, c0, c1) => ({ sheetId: hoja.sheetId, startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1 })
  const reqs = [
    E.reset(hoja.sheetId, filasNecesarias, COLUMNAS.length + 1),
    { repeatCell: { range: rg(0, 1, 0, COLUMNAS.length), cell: { userEnteredFormat: E.titulo() }, fields: 'userEnteredFormat' } },
    { repeatCell: { range: rg(1, 2, 0, COLUMNAS.length), cell: { userEnteredFormat: E.nota() }, fields: 'userEnteredFormat' } },
    { repeatCell: { range: rg(2, 3, 0, COLUMNAS.length), cell: { userEnteredFormat: E.encabezado() }, fields: 'userEnteredFormat' } },
    { updateSheetProperties: { properties: { sheetId: hoja.sheetId, gridProperties: { frozenRowCount: 3 } }, fields: 'gridProperties.frozenRowCount' } },
    { updateDimensionProperties: { range: { sheetId: hoja.sheetId, dimension: 'ROWS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: E.ALTO.titulo }, fields: 'pixelSize' } },
  ]
  COLUMNAS.forEach(([, unidad], j) => {
    reqs.push({ repeatCell: { range: rg(CFILA0 - 1, filasNecesarias, j, j + 1), cell: { userEnteredFormat: E.celda(unidad) }, fields: 'userEnteredFormat(numberFormat,textFormat,horizontalAlignment)' } })
    const ancho = unidad === 'moneda' ? E.ANCHO.numero : unidad === 'fecha' ? E.ANCHO.fecha : j === 3 || j === 9 ? E.ANCHO.texto : E.ANCHO.angosta
    reqs.push({ updateDimensionProperties: { range: { sheetId: hoja.sheetId, dimension: 'COLUMNS', startIndex: j, endIndex: j + 1 }, properties: { pixelSize: ancho }, fields: 'pixelSize' } })
  })
  for (let i = 0; i < reqs.length; i += 300) await google.spreadsheetBatchUpdate(ID, reqs.slice(i, i + 300))
}

// SÓLO CORRE SI SE LO INVOCA. Sin esta guarda, un test que importa una función pura arrancaría el
// generador contra el Sheet real.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
}
