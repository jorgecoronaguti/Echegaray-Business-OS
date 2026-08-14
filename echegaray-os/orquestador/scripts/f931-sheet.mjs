#!/usr/bin/env node
// LAS DDJJ F931 REALES, LEÍDAS DEL PDF Y PUESTAS EN EL SHEET.
//
// POR QUÉ EXISTE (21/07). El bloque "1 · DECLARADO EN LA DDJJ F931" de Cargas Sociales tenía 84
// números pegados y —lo más grave— NINGÚN SCRIPT LO ESCRIBÍA. Alguien transcribió a mano seis meses
// de declaraciones y ahí quedaron: cuando se presente el F931 de julio, el cuadro va a seguir
// mostrando seis meses y nadie se va a enterar. Es la regla 6 incumplida de la peor manera, porque
// no falla: envejece.
//
// El parser de las DDJJ ya existía en lib/cargas-sociales.mjs, con sus tests, desde el 20/07. Nunca
// se había conectado a nada. Es el mismo patrón que ya apareció tres veces en este OS: la capacidad
// construida y desenchufada.
//
// ═══ LA CADENA COMPLETA ═══
//
//   PDF en el data room → parseF931 → _F931_RAW (réplica declarada) → fórmulas del bloque 1
//
// Igual que _ARCA_RAW con el libro de IVA: si el insumo no está en el archivo, se trae el INSUMO y
// no se pega el RESULTADO. Y la réplica dice de qué archivo salió cada columna y cuándo se leyó.
//
// GANANCIA DE PRECISIÓN, NO SÓLO DE AUTOMATISMO. Lo transcripto estaba redondeado al peso; el PDF
// trae los centavos. El total declarado del semestre pasa de $44.776.342 a su valor exacto.
//
//   node orquestador/scripts/f931-sheet.mjs [--dry]

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { query } from '../lib/db.mjs'
import { parseF931, CONCEPTOS_F931 } from '../lib/cargas-sociales.mjs'
import * as E from '../lib/estilo-pestana.mjs'
import { escribirPreservando } from '../lib/preservar-anotaciones.mjs'
import { conColaMedidaLeida, avisoDeCola } from '../lib/cola-de-rango.mjs'
import { ALERTA } from '../lib/glifos.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
export const PESTAÑA = '_F931_RAW'
const DESTINO = 'Cargas Sociales'
const AÑO = String(new Date().getFullYear())
const DRY = process.argv.includes('--dry')

/** Las columnas de la réplica. El orden es contrato: las fórmulas del bloque 1 lo referencian. */
export const COLUMNAS = [
  ['Período', 'texto'], ['Código', 'texto'], ['Concepto', 'texto'], ['Monto', 'monedaExacta'],
  ['Empleados', 'cantidad'], ['Remuneración declarada', 'monedaExacta'], ['Archivo de origen', 'texto'],
]
export const COL = { periodo: 'A', codigo: 'B', concepto: 'C', monto: 'D', empleados: 'E', remuneracion: 'F', archivo: 'G' }
export const FILA0 = 4

/** NÚCLEO PURO: las filas de la réplica a partir de una DDJJ ya parseada. */
export function filasDe(ddjj, archivo) {
  if (!ddjj?.periodo) return []
  return CONCEPTOS_F931.map((c) => [
    // El apóstrofo: USER_ENTERED parsea "2026-06" como FECHA, y el formato TEXT posterior no lo
    // revierte. Los COUNTIFS siguen andando y los SUMIFS devuelven CERO sin dar error. Ya pasó con
    // _ARCA_RAW y costó una tarde encontrarlo.
    `'${ddjj.periodo}`,
    `'${c.codigo}`,
    c.nombre,
    Number(ddjj.conceptos?.[c.clave]) || 0,
    ddjj.empleados ?? '',
    Number(ddjj.remuneracion) || '',
    archivo,
  ]).filter((f) => f[3] > 0)
}

/** NÚCLEO PURO: la fórmula de una celda del cuadro, por período y código de concepto. */
export function celdaF931(periodo, codigo) {
  return `=IFERROR(SUMIFS(${PESTAÑA}!$${COL.monto}$${FILA0}:$${COL.monto};${PESTAÑA}!$${COL.periodo}$${FILA0}:$${COL.periodo};"${periodo}";${PESTAÑA}!$${COL.codigo}$${FILA0}:$${COL.codigo};"${codigo}");0)`
}

/** NÚCLEO PURO: empleados o remuneración del período — un dato de cabecera, no una suma. */
export function celdaCabecera(periodo, col) {
  return `=IFERROR(INDEX(${PESTAÑA}!$${col}$${FILA0}:$${col};MATCH("${periodo}";${PESTAÑA}!$${COL.periodo}$${FILA0}:$${COL.periodo};0));"")`
}

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })

  // Los PDFs del data room, por nombre. El índice de Drive ya los tiene catalogados.
  const { rows: archivos } = await query(
    `select name, drive_file_id from drive_index
      where name ilike '%931%' and name like $1 and mime_type = 'application/pdf'
      order by name`, [`${AÑO}%`])
  if (!archivos.length) { console.log(`no hay DDJJ F931 de ${AÑO} en el índice de Drive`); return }

  const datos = []
  const fallidos = []
  for (const a of archivos) {
    try {
      // readPdfText ya existe en el cliente y extrae el texto LOCALMENTE (0 costo de API): no se
      // duplica la capacidad, se usa.
      const { text, scanned } = await google.readPdfText(a.drive_file_id, { maxChars: 60000 })
      if (scanned) { fallidos.push(`${a.name} (PDF escaneado, sin texto)`); continue }
      const d = parseF931(text)
      // NO SE INVENTA UNA DECLARACIÓN. Si el PDF no parsea, se dice cuál y se sigue: mejor un mes
      // faltante y visible que un mes completado con un número que nadie leyó de ningún lado.
      if (!d?.periodo) { fallidos.push(a.name); continue }
      datos.push({ ...d, archivo: a.name })
    } catch (e) { fallidos.push(`${a.name} (${String(e?.message ?? e).slice(0, 40)})`) }
  }
  datos.sort((x, y) => x.periodo.localeCompare(y.periodo))
  const filas = datos.flatMap((d) => filasDe(d, d.archivo))
  const corte = new Date().toISOString().slice(0, 16).replace('T', ' ')

  console.log(`${archivos.length} PDF(s) de ${AÑO} · ${datos.length} declaración(es) leída(s) · ${filas.length} filas`)
  for (const d of datos) console.log(`  ${d.periodo}  total ${Math.round(d.total).toLocaleString('es-AR')}  ·  ${d.empleados} empleados  ·  rem ${Math.round(d.remuneracion).toLocaleString('es-AR')}`)
  if (fallidos.length) console.log(`  ⚠ no pude leer: ${fallidos.join(' · ')}`)
  if (!datos.length) { console.log('  no escribo nada: ninguna declaración se pudo leer'); process.exitCode = 1; return }
  if (DRY) return console.log('--dry: no escribí nada.')

  // ── LA RÉPLICA ────────────────────────────────────────────────────────────────────────────────
  let meta = await google.getSheetMeta(ID)
  let hoja = meta.find((h) => h.title === PESTAÑA)
  if (!hoja) {
    await google.spreadsheetBatchUpdate(ID, [{ addSheet: { properties: { title: PESTAÑA, gridProperties: { rowCount: filas.length + 40, columnCount: COLUMNAS.length + 1, frozenRowCount: 3 } } } }])
    meta = await google.getSheetMeta(ID)
    hoja = meta.find((h) => h.title === PESTAÑA)
    console.log(`  pestaña ${PESTAÑA} creada`)
  }
  const alto = Math.max(filas.length + FILA0 + 20, 60)
  if ((hoja.rows ?? 0) < alto) {
    await google.spreadsheetBatchUpdate(ID, [{ updateSheetProperties: { properties: { sheetId: hoja.sheetId, gridProperties: { rowCount: alto } }, fields: 'gridProperties.rowCount' } }])
  }
  // NO se borra nada escrito por una persona (regla de oro): se arma la grilla completa
  // —título, nota, encabezados y datos— y se FUSIONA con lo que hay. Ver lib/preservar-anotaciones.mjs.
  const gridRaw = [
    [`_F931_RAW — las DDJJ F931 leídas de los PDF del data room · corte ${corte}`],
    [`${datos.length} declaración(es) de ${AÑO}, leídas directamente del PDF presentado ante ARCA. NO se carga a mano: la reescribe el agente. Existe para que el cuadro "DECLARADO EN LA DDJJ F931" sea una fórmula y no una transcripción — hasta hoy esos números estaban tipeados y ningún script los actualizaba.${fallidos.length ? ` ${ALERTA} ${fallidos.length} archivo(s) que no pude leer: ${fallidos.join(', ')}.` : ''}`],
    COLUMNAS.map(([n]) => n),
    ...filas,
  ]
  // LA COLA DE UNA CORRIDA ANTERIOR (13/08). Esta réplica se acorta cuando un PDF deja de leerse o se
  // saca del data room: la DDJJ vieja sobreviviría en la pestaña y el cuadro "DECLARADO EN LA DDJJ"
  // sumaría un período que ya no tiene respaldo. Un espejo con cola miente igual que un cuadro.
  const cola = await conColaMedidaLeida(google, ID, PESTAÑA, gridRaw, { ancho: COLUMNAS.length, tope: alto })
  if (avisoDeCola(cola, PESTAÑA)) console.log(avisoDeCola(cola, PESTAÑA))
  const { conservadas } = await escribirPreservando(google, ID, PESTAÑA, cola.filas, { espejo: true /* _F931_RAW es un espejo de los PDF F931 del data room, no una pestaña que el dueño edite: sin candado ni firma, para que refresque siempre (misma razón que _J_*, _BANCO_RAW, _ARCA_RAW) */, anchoHoja: Math.max(COLUMNAS.length, hoja.cols ?? COLUMNAS.length) })
  if (conservadas.length) console.log(`  ✋ ${conservadas.length} celda(s) de una persona — CONSERVADAS`)

  const rg = (r0, r1, c0, c1) => ({ sheetId: hoja.sheetId, startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1 })
  const reqs = [
    E.reset(hoja.sheetId, alto, COLUMNAS.length + 1),
    { repeatCell: { range: rg(0, 1, 0, COLUMNAS.length), cell: { userEnteredFormat: E.titulo() }, fields: 'userEnteredFormat' } },
    { repeatCell: { range: rg(1, 2, 0, COLUMNAS.length), cell: { userEnteredFormat: E.nota() }, fields: 'userEnteredFormat' } },
    { repeatCell: { range: rg(2, 3, 0, COLUMNAS.length), cell: { userEnteredFormat: E.encabezado() }, fields: 'userEnteredFormat' } },
    { updateSheetProperties: { properties: { sheetId: hoja.sheetId, gridProperties: { frozenRowCount: 3 } }, fields: 'gridProperties.frozenRowCount' } },
    { updateDimensionProperties: { range: { sheetId: hoja.sheetId, dimension: 'ROWS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: E.ALTO.titulo }, fields: 'pixelSize' } },
  ]
  COLUMNAS.forEach(([, unidad], j) => {
    reqs.push({ repeatCell: { range: rg(FILA0 - 1, alto, j, j + 1), cell: { userEnteredFormat: E.celda(unidad) }, fields: 'userEnteredFormat(numberFormat,textFormat,horizontalAlignment)' } })
    reqs.push({ updateDimensionProperties: { range: { sheetId: hoja.sheetId, dimension: 'COLUMNS', startIndex: j, endIndex: j + 1 }, properties: { pixelSize: j === 2 ? 260 : j === 6 ? 200 : E.ANCHO.numero }, fields: 'pixelSize' } })
  })
  await google.spreadsheetBatchUpdate(ID, reqs)

  // ═══ LA PESTAÑA "CARGAS SOCIALES" YA NO SE ESCRIBE DESDE ACÁ (23/07) ═══
  //
  // Este script escribía el bloque 1 y el de SAC directamente sobre la pestaña, ubicando sus filas
  // por rótulo. Otros dos scripts hacían lo mismo con sus propios bloques. Tres dueños sobre la
  // misma pestaña es lo que la dejó con cinco anchos de grilla distintos y con dos bloques que no
  // eran de nadie —y que quedaron rotos en #VALUE! durante semanas sin que nadie se enterara—.
  //
  // Ahora este script mantiene una sola cosa, y la mantiene bien: la RÉPLICA del insumo. La pestaña
  // la arma cargas-sociales-pestana.mjs, leyendo de acá.
  const enPdf = datos.reduce((s, d) => s + d.total, 0)
  console.log(`  réplica escrita · total declarado según los PDF: ${Math.round(enPdf).toLocaleString('es-AR')}`)
  console.log(`  la pestaña "${DESTINO}" la arma cargas-sociales-pestana.mjs a partir de esta réplica`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
}
