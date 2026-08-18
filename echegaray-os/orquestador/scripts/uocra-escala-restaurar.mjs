#!/usr/bin/env node
// RESTAURA `_UOCRA_RAW` — LA RÉPLICA DE LA ESCALA SALARIAL QUE YO MISMO PISÉ.
//
// ═══ QUÉ PASÓ (18/08/2026) ═══
//
// Publiqué las DDJJ de UOCRA en una pestaña nueva y la llamé `_UOCRA_RAW` sin verificar que el
// nombre estuviera libre. **No lo estaba**: era la réplica VIVA de la escala salarial del convenio,
// que llegaba por IMPORTHTML y de la que cuelga todo el cuadro 4.3 de "Jornales por Quincena"
// (`uocra-acuerdos.mjs`: `HOJA = '_UOCRA_RAW'`, `COL = {mes:'A', categoria:'B', basico:'D'}`).
// La escritura borró 391 filas suyas y el cuadro empezó a leer mis columnas: el básico de Ayudante
// pasó a mostrarse en $12.928.002 la hora, y el Oficial cobrando menos que el Medio Oficial.
//
// ═══ QUÉ RESTAURA ESTO, Y QUÉ NO ═══
//
// SÍ: los VALORES. `public.uocra_escala` tiene las 115 filas que `nomina-replica.mjs` venía
// espejando desde esa misma pestaña, así que la escala vuelve completa y el cuadro 4.3 vuelve a
// mostrar los básicos reales del convenio.
//
// NO: la fórmula IMPORTHTML que la mantenía viva. Esa fórmula no está en el repositorio —la cargó
// una persona en el Sheet— y no se puede reconstruir sin la URL. Queda escrito en la fila 2 de la
// pestaña para que nadie la crea viva cuando no lo está: **desde acá la escala NO se actualiza sola**
// hasta que el dueño reponga el IMPORTHTML desde el historial de versiones del archivo.
//
// Publicar valores donde antes había una fórmula viva es una degradación, y por eso se declara en la
// propia pestaña en vez de dejarla con pinta de estar al día.
//
//   node orquestador/scripts/uocra-escala-restaurar.mjs [--dry]

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import * as E from '../lib/estilo-pestana.mjs'
import { escribirPreservando } from '../lib/preservar-anotaciones.mjs'
import { conColaMedidaLeida } from '../lib/cola-de-rango.mjs'
import { query, closePool } from '../lib/db.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
export const PESTAÑA = '_UOCRA_RAW'
const DRY = process.argv.includes('--dry')

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

/**
 * El rótulo del mes tal como lo espera `mesDeRotulo()`: empieza con el nombre del mes y, si el
 * origen lo declara, lleva el % del escalón. NÚCLEO PURO.
 */
export function rotuloDeFila(vigencia, fuente) {
  const d = vigencia instanceof Date ? vigencia : new Date(String(vigencia))
  if (Number.isNaN(d.getTime())) return ''
  const mes = MESES[d.getUTCMonth()]
  const nombre = mes.charAt(0).toUpperCase() + mes.slice(1)
  // El % viene adentro del texto de la fuente ("… · escalón +1.9%"). Se conserva con coma decimal,
  // que es como lo escribe el acuerdo y como lo lee `pctDeRotulo`.
  const pct = /([+-]?\d{1,2}(?:[.,]\d{1,2})?)\s*%/.exec(String(fuente ?? ''))
  return pct ? `${nombre} ${pct[1].replace('.', ',')}%`.replace('+', '+') : nombre
}

async function main() {
  const { rows } = await query(
    `select vigencia_desde, zona, categoria, basico_hora, mensual, cct, fuente
       from public.uocra_escala
      order by vigencia_desde, categoria`)
  if (!rows.length) {
    console.log('public.uocra_escala está vacía — NO escribo nada. Restaurar desde el historial de versiones del Sheet.')
    process.exitCode = 1
    return
  }

  // El orden es CONTRATO: el cuadro 4.3 ubica cada categoría por su NÚMERO DE FILA, resuelto al
  // parsear. Agrupado por vigencia y, dentro, por categoría — igual que venía de la réplica.
  const datos = rows.map((r) => {
    const esMensual = r.mensual != null
    const basico = Number(esMensual ? r.mensual : r.basico_hora) || ''
    return [
      rotuloDeFila(r.vigencia_desde, r.fuente),
      String(r.categoria ?? ''),
      esMensual ? 'mensual' : 'hora',
      basico,
      '', '', '',           // E, F, G — columnas que la réplica traía del sitio y no tenemos
      basico,               // H — Zona A. En San Juan, Zona A == Básico.
      String(r.cct ?? ''),
      String(r.fuente ?? ''),
    ]
  })

  const vigencias = [...new Set(rows.map((r) => String(r.vigencia_desde).slice(0, 10)))]
  console.log(`public.uocra_escala — ${datos.length} fila(s) · ${vigencias.length} vigencia(s), de ${vigencias[0]} a ${vigencias[vigencias.length - 1]}`)
  if (DRY) return console.log('--dry: no escribí nada.')

  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  let meta = await google.getSheetMeta(ID)
  let hoja = meta.find((h) => h.title === PESTAÑA)
  if (!hoja) {
    await google.spreadsheetBatchUpdate(ID, [{ addSheet: { properties: { title: PESTAÑA, gridProperties: { rowCount: datos.length + 40, columnCount: 12, frozenRowCount: 3 } } } }])
    meta = await google.getSheetMeta(ID)
    hoja = meta.find((h) => h.title === PESTAÑA)
  }
  const alto = Math.max(datos.length + 20, 60)

  const grid = [
    [`${PESTAÑA} — escala salarial UOCRA · RESTAURADA desde public.uocra_escala el ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`],
    ['⚠ ESTA PESTAÑA YA NO SE ACTUALIZA SOLA. Traía un IMPORTHTML que la mantenía viva y una escritura del OS lo borró el 18/08/2026. Estos son los valores espejados en Postgres (public.uocra_escala), completos y verificables, pero CONGELADOS: cuando se firme un acuerdo nuevo NO va a entrar solo. Para volver a tenerla viva hay que reponer el IMPORTHTML desde el historial de versiones del archivo (Archivo › Historial de versiones), que es lo único que conserva la fórmula original.'],
    ['Mes', 'Categoría', 'Unidad', 'Básico', '', '', '', 'Zona A', 'CCT', 'Origen'],
    ...datos,
  ]

  const cola = await conColaMedidaLeida(google, ID, PESTAÑA, grid, { ancho: 10, tope: 400 })
  await escribirPreservando(google, ID, PESTAÑA, cola.filas, { respetar: false, espejo: true, anchoHoja: 12 })

  const rg = (r0, r1, c0, c1) => ({ sheetId: hoja.sheetId, startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1 })
  await google.spreadsheetBatchUpdate(ID, [
    E.reset(hoja.sheetId, alto, 12),
    { repeatCell: { range: rg(0, 1, 0, 10), cell: { userEnteredFormat: E.titulo() }, fields: 'userEnteredFormat' } },
    { repeatCell: { range: rg(1, 2, 0, 10), cell: { userEnteredFormat: E.nota() }, fields: 'userEnteredFormat' } },
    { repeatCell: { range: rg(2, 3, 0, 10), cell: { userEnteredFormat: E.encabezado() }, fields: 'userEnteredFormat' } },
    { repeatCell: { range: rg(3, alto, 3, 4), cell: { userEnteredFormat: E.celda('monedaExacta') }, fields: 'userEnteredFormat(numberFormat,textFormat,horizontalAlignment)' } },
    { repeatCell: { range: rg(3, alto, 7, 8), cell: { userEnteredFormat: E.celda('monedaExacta') }, fields: 'userEnteredFormat(numberFormat,textFormat,horizontalAlignment)' } },
  ])

  // LA EVIDENCIA ES DEL EFECTO: se relee sin formato y se comprueba que el básico sea NÚMERO.
  const v = await google.readSheetValues(ID, `${PESTAÑA}!A4:D${3 + datos.length}`, { render: 'UNFORMATTED_VALUE' })
  const numericos = v.filter((f) => typeof f?.[3] === 'number').length
  console.log(`${PESTAÑA}: ${datos.length} filas · ${v.length} releídas · ${numericos} con básico numérico`)
  if (numericos < datos.length - 5) { console.log('  ⚠ NO COINCIDEN'); process.exitCode = 1 }
  await closePool()
}

main().catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
