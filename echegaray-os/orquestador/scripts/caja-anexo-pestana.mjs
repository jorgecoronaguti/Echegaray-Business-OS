#!/usr/bin/env node
// `_CAJA_ANEXO` — EL DETALLE Y LAS CONCILIACIONES QUE SE FUERON DE CAJA.
//
// POR QUÉ EXISTE (05/08/2026). CAJA tenía 143 filas y el dueño la describió tres veces con la misma
// palabra: *"está pésima"*. Setenta de esas filas eran el anexo del ANALISTA. Esta pestaña las recibe
// enteras — ninguna verificación desaparece — y CAJA publica el veredicto de cada control en una
// línea. Ver lib/caja-anexo.mjs para el diseño y lib/caja-anexo-nombres.mjs para el contrato.
//
// ESTE PASO VA ANTES QUE `caja-pestana.mjs` EN EL AGENTE, y no es cosmético: CAJA cita los
// `ANEXO_*` por nombre, y un nombre que todavía no existe deja #NAME? en la pestaña que el dueño
// abre todos los días. En el arranque en frío el que muestra #NAME? por una corrida es el auxiliar,
// que es el lado barato para equivocarse.
//
//   node orquestador/scripts/caja-anexo-pestana.mjs [--dry]

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import * as E from '../lib/estilo-pestana.mjs'
import { MONEDA_CUERPO, MONEDA_TOTAL } from '../lib/formato-statement.mjs'
import { hallarPestana } from '../lib/sheet-pestanas.mjs'
import { escribirPreservando } from '../lib/preservar-anotaciones.mjs'
import { conEdicionesRespetadas, guardarRegistro } from '../lib/respetar-ediciones.mjs'
import { publicar } from '../lib/rangos-nombrados.mjs'
import { requestsTextoPorContenido } from '../lib/formato-texto-por-contenido.mjs'
import { grillaAnexo, ANCHO_ANEXO, ANCHOS_ANEXO, PESTANA_ANEXO } from '../lib/caja-anexo.mjs'
import { DESDE_CAJA, CELDA_CAJA_MINIMA, ESPECIE_ANEXO } from '../lib/caja-anexo-nombres.mjs'
import { TIPO_CAMBIO } from '../lib/caja-disponibilidades.mjs'
import { conceptosFueraDelCalendario, lineasDeCaja, marcaDeLinea } from '../lib/calendario-egresos.mjs'
import { carteraDelArchivo, refsDelArchivo, SIN_FUENTE_EN_VENTANA } from '../lib/caja-refs.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const DRY = process.argv.includes('--dry')

const letra = (i) => String.fromCharCode(65 + i)

/**
 * Lo que una persona ya cargó en el anexo, rescatado ANTES de reescribir.
 *
 * Hoy es UNA sola fila —el "Dólar declarado por la empresa", opcional— y se busca POR SU RÓTULO, no
 * por número de fila: si mañana el bloque se mueve, el dato viaja con él. Es exactamente el defecto
 * que en CAJA dejó la caja física en $0 cuando el bloque del arqueo bajó cuatro filas.
 */
export function rescatarAnexo(filas = []) {
  const cargado = new Map()
  for (const fila of filas) {
    const a = String(fila?.[0]?.valor ?? '').trim()
    if (a !== TIPO_CAMBIO.declarado.nombre) continue
    const leer = (i) => { const c = fila?.[i]; return c?.formula ?? (c?.numero ?? c?.valor ?? '') }
    cargado.set(a, { saldo: leer(2), fecha: leer(5), origen: leer(6) })
  }
  return cargado
}

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  const hojas = await google.getSheetMeta(ID)

  // LOS CONCEPTOS QUE EL CALENDARIO NO PUEDE UBICAR EN EL TIEMPO, medidos contra el cuadro contable
  // COMPLETO y no contra las fuentes que el propio calendario suma. Un control validado contra su
  // propia información da cero por construcción, y ese cero ya se leyó como "está todo bien" mientras
  // faltaban $77M.
  const egresos = lineasDeCaja().filter(({ signo }) => signo === -1)
  const sinFuente = egresos.filter(({ linea }) => SIN_FUENTE_EN_VENTANA.includes(marcaDeLinea(linea)))
    .map(({ linea }) => linea.nombre)
  const conceptosCiegos = conceptosFueraDelCalendario(
    egresos.map(({ linea }) => linea.nombre).filter((n) => !sinFuente.includes(n))).concat(sinFuente)

  let hoja = hojas.find((h) => h.title === PESTANA_ANEXO)
  const refs = await refsDelArchivo(google, ID, hojas)
  const cartera = await carteraDelArchivo()

  const previo = hoja
    ? await google.readSheetGrid(ID, `${PESTANA_ANEXO}!A1:G`).catch(() => ({ filas: [] }))
    : { filas: [] }
  const g = grillaAnexo({ refs, cartera, conceptosCiegos, cargado: rescatarAnexo(previo.filas ?? []) })
  console.log(`${PESTANA_ANEXO}: ${g.filas.length} filas · ${g.destinos.length} rangos con nombre`)
  if (DRY) return console.log('--dry: no escribí nada.')

  // LA PESTAÑA SE CREA CON ALTO DE SOBRA. Un batch que apunta más allá del alto real ABORTA entero y
  // la pestaña queda con lo de la corrida anterior; el alto se ASEGURA, no se supone.
  if (!hoja) {
    await google.spreadsheetBatchUpdate(ID, [{
      addSheet: { properties: { title: PESTANA_ANEXO, gridProperties: { rowCount: g.filas.length + 40, columnCount: ANCHO_ANEXO, frozenRowCount: 2 } } },
    }])
    hoja = hallarPestana(await google.getSheetMeta(ID), PESTANA_ANEXO)
    console.log(`  ✚ creé la pestaña ${PESTANA_ANEXO}`)
  }
  const alto = Math.max(g.filas.length + 20, hoja.rows ?? 0)
  if ((hoja.rows ?? 0) < alto) {
    await google.spreadsheetBatchUpdate(ID, [{
      updateSheetProperties: { properties: { sheetId: hoja.sheetId, gridProperties: { rowCount: alto } }, fields: 'gridProperties.rowCount' },
    }])
  }

  // LO QUE PUEDE FALLAR VA PRIMERO: borrar es irreversible y escribir puede fallar. Una fila más ancha
  // que la tabla hace que la API rechace el batch ENTERO, y eso ya dejó una pestaña vacía una vez.
  const malas = g.filas.map((f, i) => (f.length > ANCHO_ANEXO ? i + 1 : 0)).filter(Boolean)
  if (malas.length) throw new Error(`${malas.length} fila(s) más anchas que ${ANCHO_ANEXO} columnas: ${malas.slice(0, 5).join(', ')}. NO escribo.`)

  await google.spreadsheetBatchUpdate(ID, [{ unmergeCells: { range: { sheetId: hoja.sheetId, startRowIndex: 0, endRowIndex: Math.max(g.filas.length, hoja.rows ?? 0), startColumnIndex: 0, endColumnIndex: ANCHO_ANEXO } } }]).catch(() => {})
  // UNA LECTURA QUE FALLA NO ES UNA PESTAÑA VACÍA: con `.catch(() => [])` un 429 se convierte en "el
  // dueño lo borró todo" y la Regla 0 escribe encima de lo suyo. Falla cerrado.
  const actual = await google.readSheetValues(ID, `${PESTANA_ANEXO}!A1:${letra(ANCHO_ANEXO - 1)}`).catch((e) => {
    throw new Error(`no pude leer "${PESTANA_ANEXO}" (${e.message}). NO escribo: sin esa lectura la Regla 0 decide a ciegas.`)
  })
  const { grid, respetadas, ediciones, candidatos } = await conEdicionesRespetadas(ID, PESTANA_ANEXO, g.filas, actual)
  g.filas = grid
  for (const r of respetadas) console.log(`  ✋ respeto tu texto ("${r.suyo.slice(0, 44)}")`)
  const escritura = await escribirPreservando(google, ID, PESTANA_ANEXO, g.filas, { respetar: false, anchoHoja: Math.max(ANCHO_ANEXO, hoja.cols ?? ANCHO_ANEXO) })
  // UNA PESTAÑA QUE NO SE ESCRIBIÓ NO CAMBIÓ DE FORMA: su formato y sus nombres son los de su última
  // escritura y así tienen que quedar. Reapuntar los nombres a una grilla que no se escribió es lo que
  // el 03/08 dejó `CAJA_ARQUEO_ARS` en una celda vacía y borró $42,88M del total, con diff cero.
  if (escritura?.bloqueada || escritura?.editadaPorHumano) {
    console.log(`  🔒 "${PESTANA_ANEXO}" bajo tu control: no escribí, NO le toco el formato NI muevo sus rangos con nombre.`)
    return
  }

  // LOS NOMBRES, DESPUÉS DE ESCRIBIR — Y VERIFICADOS. `publicar` con `titulo` relee cada celda y
  // compara contra la ESPECIE prometida: un nombre publicado sobre una celda vacía o sobre un texto es
  // el defecto que dejó `ARCA_COMPRAS_TOTAL` devolviendo un número de comprobante.
  const destinos = g.destinos.map((d) => ({ ...d, especie: d.especie ?? ESPECIE_ANEXO[d.name] }))
  const { malApuntados, verificado } = await publicar(google, ID, hoja.sheetId, destinos, { titulo: PESTANA_ANEXO })
  console.log(`  🔖 ${destinos.length} rango(s) con nombre publicados${verificado ? ' y verificados' : ' (NO se pudieron releer: sin verificar)'}`)
  for (const m of malApuntados) {
    console.warn(`  ⚠ ${m.name} promete ${m.espera} y en ${letra(m.col - 1)}${m.fila} hay ${m.encontro} (${String(m.valor).slice(0, 30)})`)
  }

  // LA CAJA MÍNIMA NO VIVE EN NINGUNA DE LAS DOS PESTAÑAS: el nombre apunta a su FUENTE. Así CAJA y el
  // anexo la leen sin que ninguno la copie — un parámetro tiene una sola dirección en el archivo.
  const valores = hallarPestana(hojas, CELDA_CAJA_MINIMA.pestana)
  if (valores) {
    await publicar(google, ID, valores.sheetId,
      [{ name: DESDE_CAJA.minima, fila: CELDA_CAJA_MINIMA.fila, col: CELDA_CAJA_MINIMA.col }])
  } else {
    console.warn(`  ⚠ no encontré "${CELDA_CAJA_MINIMA.pestana}": ${DESDE_CAJA.minima} queda como estaba`)
  }

  await formatear(google, hoja.sheetId, g)
  const quedo = await google.readSheetValues(ID, `${PESTANA_ANEXO}!A1:${letra(ANCHO_ANEXO - 1)}${g.filas.length}`).catch(() => [])
  await guardarRegistro(ID, PESTANA_ANEXO, g.filas, ediciones, quedo, candidatos)
    .catch((e) => console.warn(`  ⚠ no pude guardar el registro de rótulos: ${e.message}`))
  console.log('QUEDÓ ESCRITO.')
}

/**
 * EL FORMATO DEL ANEXO — el mismo lenguaje que CAJA, para que las dos se lean igual.
 *
 * SE RESETEA TODO AL ESTÁNDAR Y RECIÉN DESPUÉS SE PINTAN LAS EXCEPCIONES. Un formateador que sólo
 * APLICA deja cada corrida encima de la anterior, y así llegó CAJA a tener dos tipografías, seis
 * tamaños y nueve fondos.
 */
async function formatear(google, sheetId, g) {
  const n = g.filas.length
  const r = (r0, r1, c0 = 0, c1 = ANCHO_ANEXO) => ({ sheetId, startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1 })
  const req = [
    { unmergeCells: { range: r(0, n) } },
    E.reset(sheetId, Math.max(n + 20, 120), ANCHO_ANEXO),
    { updateSheetProperties: { properties: { sheetId, gridProperties: { hideGridlines: true } }, fields: 'gridProperties.hideGridlines' } },
  ]
  const INK = { red: 0.10, green: 0.13, blue: 0.20 }
  const MUTED = { red: 0.53, green: 0.52, blue: 0.49 }
  const HAIR = { red: 0.82, green: 0.80, blue: 0.76 }
  const fmt = (rg, fields, format) => req.push({ repeatCell: { range: rg, cell: { userEnteredFormat: E.conFuente(format) }, fields } })
  const borde = (rg) => req.push({ updateBorders: { range: rg, bottom: { style: 'SOLID', color: HAIR } } })

  // Los grupos viejos se borran ANTES: la API los apila y el margen izquierdo termina con una escalera.
  const grupos = (await google.getRowGroups(ID).catch(() => [])).find((s) => s.sheetId === sheetId)?.grupos ?? []
  for (const gr of grupos) req.push({ deleteDimensionGroup: { range: { sheetId, dimension: 'ROWS', startIndex: gr.startIndex, endIndex: gr.endIndex } } })

  // El "$" es del TOTAL, no de cada celda: un símbolo repetido en cien filas no distingue nada.
  for (const c of [2, 3, 4]) {
    fmt(r(0, n, c, c + 1), 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment',
      { numberFormat: MONEDA_CUERPO, horizontalAlignment: 'RIGHT' })
  }
  for (const f of g.totales ?? []) {
    for (const c of [2, 3, 4]) fmt(r(f - 1, f, c, c + 1), 'userEnteredFormat.numberFormat', { numberFormat: MONEDA_TOTAL })
  }
  fmt(r(0, n, 1, 2), 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment',
    { numberFormat: { type: 'TEXT' }, horizontalAlignment: 'CENTER' })
  fmt(r(0, n, 5, 6), 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment',
    { numberFormat: { type: 'DATE', pattern: 'dd/mm/yyyy' }, horizontalAlignment: 'CENTER' })
  // La última columna es PROSA: texto, gris, con ajuste. Nunca plata.
  fmt(r(0, n, ANCHO_ANEXO - 1, ANCHO_ANEXO), 'userEnteredFormat',
    { ...E.nota(), numberFormat: { type: 'TEXT' }, wrapStrategy: 'WRAP', verticalAlignment: 'MIDDLE' })
  // UNA TASA NO ES PLATA: con formato de moneda, el 55% anual se dibuja "$1".
  if (g.fTasa) fmt(r(g.fTasa - 1, g.fTasa, 2, 3), 'userEnteredFormat.numberFormat', { numberFormat: { type: 'PERCENT', pattern: '0.00%' } })
  // LOS DÍAS SON DÍAS: "2 días" con formato moneda se dibuja "$2".
  if (g.fDias) fmt(r(g.fDias - 1, g.fDias, 2, 3), 'userEnteredFormat.numberFormat', { numberFormat: { type: 'NUMBER', pattern: '0" días";;"—"' } })
  // La cotización es una relación, no plata.
  if (g.fTC) fmt(r(g.fTC - 3, g.fTC, 2, 3), 'userEnteredFormat.numberFormat', { numberFormat: { type: 'NUMBER', pattern: '#,##0.00' } })
  // LA CELDA DE CARGA EN AMARILLO: lo que una persona escribe tiene que verse distinto de lo que el
  // sistema calcula, o nadie sabe qué puede tocar sin romper nada.
  if (g.fDec) {
    for (const c of [2, 5]) fmt(r(g.fDec - 1, g.fDec, c, c + 1), 'userEnteredFormat.backgroundColor', { backgroundColor: { red: 1, green: 0.98, blue: 0.86 } })
  }
  fmt(r(0, 1), 'userEnteredFormat.textFormat', { textFormat: { bold: true, fontSize: E.TAM.titulo } })
  fmt(r(1, 2), 'userEnteredFormat.textFormat,userEnteredFormat.wrapStrategy',
    { textFormat: { italic: true, fontSize: E.TAM.nota, foregroundColor: E.COLOR.nota }, wrapStrategy: 'WRAP' })

  g.filas.forEach((f, i) => {
    const t = String(f[0] ?? '')
    if (/^A\d+ · /.test(t)) {
      fmt(r(i, i + 1), 'userEnteredFormat', { textFormat: { bold: true, fontFamily: E.FUENTE, fontSize: E.TAM.cuerpo, foregroundColor: INK }, horizontalAlignment: 'LEFT' })
      borde(r(i, i + 1))
    }
    // Un ENCABEZADO es texto, nunca plata ni fecha: se le devuelve el formato de número junto con la
    // tipografía, o gana el que se aplicó a la columna entera más arriba.
    if (/^(Concepto|Línea|Valor|Qué|Horizonte)/.test(t)) {
      fmt(r(i, i + 1), 'userEnteredFormat.numberFormat', { numberFormat: { type: 'TEXT' } })
      fmt(r(i, i + 1), 'userEnteredFormat.textFormat,userEnteredFormat.horizontalAlignment',
        { textFormat: { bold: true, foregroundColor: MUTED, fontSize: E.TAM.nota }, horizontalAlignment: 'LEFT' })
      borde(r(i, i + 1))
    }
    if (/^⇒/.test(t)) fmt(r(i, i + 1, 0, 1), 'userEnteredFormat.textFormat', { textFormat: { bold: true, fontFamily: E.FUENTE, fontSize: E.TAM.cuerpo } })
  })

  // NINGUNA FILA OCULTA, NUNCA. Una fila que existe y no se ve es peor que una fila fea: no se puede
  // auditar lo que no se sabe que está.
  req.push({ updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 0, endIndex: Math.max(n + 40, 140) }, properties: { hiddenByUser: false }, fields: 'hiddenByUser' } })
  // NI UNA NOTA, EN NINGUNA COLUMNA. Una nota vive FUERA del valor de la celda: reescribir la pestaña
  // no la toca, así que la única forma de que un borrado dure es borrarlas explícitamente.
  req.push({
    updateCells: {
      range: { sheetId, startRowIndex: 0, endRowIndex: n, startColumnIndex: 0, endColumnIndex: ANCHO_ANEXO },
      rows: Array.from({ length: n }, () => ({ values: Array.from({ length: ANCHO_ANEXO }, () => ({ note: '' })) })),
      fields: 'note',
    },
  })
  ANCHOS_ANEXO.forEach((px, i) => req.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: i, endIndex: i + 1 }, properties: { pixelSize: px }, fields: 'pixelSize' } }))
  const { requests: rTxt } = requestsTextoPorContenido(sheetId, g.filas || [])
  req.push(...rTxt)
  await google.spreadsheetBatchUpdate(ID, req)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main()
    .catch((e) => { console.error('ERROR:', e.message); process.exitCode = 1 })
    .finally(async () => { await import('../lib/db.mjs').then((m) => m.closePool()).catch(() => {}) })
}
