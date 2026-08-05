#!/usr/bin/env node
// LA PESTAÑA CAJA — LA POSICIÓN DE TESORERÍA, EN UNA PANTALLA.
//
// POR QUÉ EXISTE. Era la única pestaña vacía del archivo, y por eso el número más grande del cuadro no
// significaba nada: "flujo acumulado −$433.811.452" es un DELTA, no un saldo. Sin saldo inicial, un
// cash flow dice cuánto se mueve pero no puede contestar la única pregunta que se le hace: qué día te
// quedás sin plata.
//
// LO QUE ESTA PESTAÑA NO HACE, A PROPÓSITO: no lleva movimientos. Cada cobro está en Cobranzas, cada
// pago en Compras y cada cheque en Cheques Emitidos. Un libro de movimientos acá sería la tercera
// copia de la misma plata, y el día que no coincidan nadie sabría cuál tiene razón.
//
// ═══ EL REDISEÑO DEL 05/08/2026 ═══
//
// Tenía 143 filas y el dueño la describió tres veces igual: *"está pésima"*. El anexo del analista
// —setenta filas de conciliaciones— se mudó ENTERO a `_CAJA_ANEXO`; ningún control desapareció, y acá
// queda el veredicto de cada uno en una línea. La grilla vive en lib/caja-grilla.mjs (se puede
// construir y verificar en frío, sin red y sin escribir una celda) y este archivo hace lo que sólo se
// puede hacer contra Google: leer, fusionar, escribir, formatear y publicar los nombres.
//
// IDEMPOTENCIA CON DATO HUMANO ADENTRO: es la ÚNICA pestaña del archivo donde se carga un número a
// mano. Antes de reescribirla se leen los valores cargados y se vuelven a poner en su lugar,
// buscándolos POR EL NOMBRE DE LA CUENTA y no por número de fila.
//
//   node orquestador/scripts/caja-pestana.mjs [--dry]

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import * as E from '../lib/estilo-pestana.mjs'
import { MONEDA_TOTAL, MONEDA_CUERPO, PORCENTAJE, VECES } from '../lib/formato-statement.mjs'
import { hallarPestana } from '../lib/sheet-pestanas.mjs'
import { escribirPreservando } from '../lib/preservar-anotaciones.mjs'
import { requestsTextoPorContenido } from '../lib/formato-texto-por-contenido.mjs'
import { conEdicionesRespetadas, guardarRegistro } from '../lib/respetar-ediciones.mjs'
import { CAJA as N_CAJA, publicar } from '../lib/rangos-nombrados.mjs'
import { filaDeCuenta } from '../lib/caja-disponibilidades.mjs'
import { DESDE_CAJA, PESTANA_ANEXO } from '../lib/caja-anexo-nombres.mjs'
import { refsDelArchivo, rescatar } from '../lib/caja-refs.mjs'
import { grilla, ANCHO, ANCHOS, FILAS_MAXIMAS } from '../lib/caja-grilla.mjs'
import { requestsDeGraficos } from '../lib/caja-graficos.mjs'

export { grilla, rescatar }

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const PESTAÑA = 'Caja'
const DRY = process.argv.includes('--dry')

const letra = (i) => { let s = ''; for (let n = i; n >= 0; n = Math.floor(n / 26) - 1) s = String.fromCharCode(65 + (n % 26)) + s; return s }

/**
 * Los rangos con nombre de esta pestaña, republicados en CADA corrida desde las filas reales.
 *
 * ═══ UN RANGO CON NOMBRE QUE NO SE REPUBLICA ES UNA FILA ESCRITA A MANO CON MEJOR LETRA ═══
 *
 * Los cuatro del arqueo se habían creado UNA vez y nadie los volvía a apuntar. Mientras la pestaña
 * estuvo candada no se notó; la primera vez que el generador la rehízo, el bloque bajó diez filas y los
 * cuatro nombres quedaron apuntando a la fila del tipo de cambio: "Caja en dólares" pasó a leerse a sí
 * misma y toda la columna dio #REF!, el total de disponibilidades incluido.
 *
 * LOS TRES DE ABAJO SON NUEVOS (05/08): el saldo del banco, su fecha de corte y la cartera. Nacen con
 * la mudanza del anexo, que dejó de poder citar la fila y ahora los cita por nombre.
 *
 * TIPO_CAMBIO_USD YA NO ESTÁ ACÁ: su bloque se mudó a `_CAJA_ANEXO`, que es quien lo publica. Por eso
 * ese paso corre ANTES que éste en el agente.
 */
export const RANGOS_DE_CAJA = [
  { nombre: DESDE_CAJA.arqueoArs, fila: (g) => g.fArqArs, col: 2 },
  { nombre: DESDE_CAJA.arqueoArsFecha, fila: (g) => g.fArqArs, col: 5 },
  { nombre: DESDE_CAJA.arqueoUsd, fila: (g) => g.fArqUsd, col: 2 },
  { nombre: DESDE_CAJA.arqueoUsdFecha, fila: (g) => g.fArqUsd, col: 5 },
  { nombre: DESDE_CAJA.bancoSaldo, fila: (g) => g.fBancoPesos, col: 4 },
  { nombre: DESDE_CAJA.bancoCorte, fila: (g) => g.fBancoPesos, col: 5 },
  { nombre: DESDE_CAJA.cartera, fila: (g) => g.fCartera, col: 2 },
]

/**
 * NÚCLEO PURO: los requests para publicar los rangos. `soloFaltantes` es la diferencia entre arrancar
 * en frío y reapuntar — y es lo que separa el bootstrap del daño.
 */
export function requestsDeRangos(sheetId, g, existentes = [], { soloFaltantes = false } = {}) {
  const reqs = []
  for (const r of RANGOS_DE_CAJA) {
    const fila = r.fila(g)
    // Sin fila no se publica NADA para ese nombre: dejar el rango viejo apuntando a una fila que ya no
    // es la suya es peor que no tenerlo — miente sin dar error.
    if (!Number.isFinite(fila) || fila < 1) continue
    const ya = existentes.find((x) => x.name === r.nombre)
    if (soloFaltantes && ya) continue
    const rango = { sheetId, startRowIndex: fila - 1, endRowIndex: fila, startColumnIndex: r.col, endColumnIndex: r.col + 1 }
    reqs.push(ya
      ? { updateNamedRange: { namedRange: { namedRangeId: ya.namedRangeId, name: r.nombre, range: rango }, fields: 'name,range' } }
      : { addNamedRange: { namedRange: { name: r.nombre, range: rango } } })
  }
  return reqs
}

/**
 * ═══ UN NOMBRE NO SE REAPUNTA A UNA GRILLA QUE TODAVÍA NO SE ESCRIBIÓ (03/08) ═══
 *
 * Esta función se llamaba ANTES de escribir con este argumento al lado: "va primero o la pestaña se
 * llena de #NAME? en la primera corrida". El argumento vale para la PRIMERA corrida y sólo para ésa.
 * En cualquier otra reapunta los nombres a las filas que el generador PIENSA escribir — y si el portón
 * después frena la escritura, la pestaña se queda con su layout viejo y los nombres apuntando a otro.
 * Pasó: `CAJA_ARQUEO_ARS` cayó en una celda vacía y el total de disponibilidades pasó de $123,79M a
 * $80,91M **sin un solo #REF! y sin una sola celda de contenido modificada**. La guarda protegía el
 * CONTENIDO y nadie protegía los NOMBRES.
 */
async function rangoConNombre(google, sheetId, g, { soloFaltantes = false } = {}) {
  const existentes = await google.getNamedRanges(ID).catch(() => [])
  const reqs = requestsDeRangos(sheetId, g, existentes, { soloFaltantes })
  if (reqs.length) await google.spreadsheetBatchUpdate(ID, reqs)
  return reqs.length
}

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  const hojas = await google.getSheetMeta(ID)
  const hoja = hallarPestana(hojas, PESTAÑA)
  const tab = hoja.title

  if (!hojas.some((h) => h.title === PESTANA_ANEXO)) {
    // NO SE ESCRIBE UNA CAJA QUE VA A MOSTRAR #NAME? EN SUS CONTROLES. El anexo publica once nombres
    // que esta pestaña cita; sin él, el bloque 6 y el crédito quedan en error y el dueño abre una
    // pestaña rota. Correr el paso que falta es una línea; escribir esto igual es media pantalla en rojo.
    throw new Error(`falta la pestaña "${PESTANA_ANEXO}". Corré primero: node orquestador/scripts/caja-anexo-pestana.mjs`)
  }

  // ═══ LA LECTURA NO LLEVA TECHO DE FILAS ═══
  //
  // Era `A1:I80` y el bloque donde el dueño tipea el ARQUEO vivía en la fila 148: el rescate NUNCA veía
  // el conteo ni su fecha. Mientras el bloque no se movía no se notaba, porque la fusión preservaba esas
  // celdas POR POSICIÓN. Una lectura con techo no devuelve "no hay dato", devuelve "no miré".
  const previo = await google.readSheetGrid(ID, `${tab}!A1:I`).catch(() => ({ filas: [] }))
  const cargado = rescatar(previo.filas ?? [])
  const refs = await refsDelArchivo(google, ID, hojas)

  const g = grilla(cargado, refs)
  console.log(`${tab}: ${g.filas.length} filas (tope ${FILAS_MAXIMAS}) · ${cargado.size} celda(s) con dato ya cargado`)
  if (g.filas.length > FILAS_MAXIMAS) {
    throw new Error(`CAJA quedó en ${g.filas.length} filas y el objetivo es ${FILAS_MAXIMAS}: no entra en una pantalla. Antes de escribir hay que decidir QUÉ SALE al anexo.`)
  }
  if (DRY) return console.log('--dry: no escribí nada.')

  // GARANTIZAR EL ALTO ANTES DE TODO: si el batch apunta más allá del alto real, la API ABORTA el write
  // entero y CAJA queda con lo de la corrida anterior. El alto se ASEGURA, no se supone.
  const hasta = Math.max(g.filas.length + 20, hoja.rows ?? 0)
  if ((hoja.rows ?? 0) < hasta) {
    await google.spreadsheetBatchUpdate(ID, [{
      updateSheetProperties: { properties: { sheetId: hoja.sheetId, gridProperties: { rowCount: hasta } }, fields: 'gridProperties.rowCount' },
    }])
  }
  const creados = await rangoConNombre(google, hoja.sheetId, g, { soloFaltantes: true })
  if (creados) console.log(`  🔖 ${creados} rango(s) con nombre CREADOS (no existían): arranque en frío`)

  // ═══ NO SE BORRA HASTA SABER QUE LO NUEVO SE PUEDE ESCRIBIR ═══
  //
  // Una corrida falló DESPUÉS del clear —filas de 9 columnas contra una grilla de 8, y la API rechaza
  // el batch entero— y la pestaña quedó vacía. En la corrida siguiente el rescate leyó una pestaña ya
  // limpia y los $1.725.000 que alguien había tipeado se perdieron. El error no fue el ancho: fue el
  // ORDEN. Borrar es irreversible y escribir puede fallar.
  const malas = g.filas.map((f, i) => (f.length > ANCHO ? i + 1 : 0)).filter(Boolean)
  if (malas.length) throw new Error(`${malas.length} fila(s) más anchas que la tabla (${ANCHO} columnas): ${malas.slice(0, 5).join(', ')}. NO borro nada.`)
  if (!g.filas.length) throw new Error('la grilla salió vacía: no escribo la pestaña')

  // DESARMAR LAS COMBINACIONES ANTES DE ESCRIBIR, NO DESPUÉS: en la corrida en que existe una celda
  // combinada, la escritura se pierde EN SILENCIO —ni error ni valor— y recién la corrida siguiente
  // deja el dato. Un dato que aparece a la segunda corrida, si el script corre una sola vez, no aparece.
  await google.spreadsheetBatchUpdate(ID, [{ unmergeCells: { range: { sheetId: hoja.sheetId, startRowIndex: 0, endRowIndex: Math.max(g.filas.length, hoja.rows ?? 0), startColumnIndex: 0, endColumnIndex: Math.max(ANCHO, hoja.cols ?? ANCHO) } } }]).catch(() => {})
  // UNA LECTURA QUE FALLA NO ES UNA PESTAÑA VACÍA: con `.catch(() => [])` un 429 se convertía en "está
  // vacía", la Regla 0 daba todos los rótulos por borrados por el dueño y la fusión escribía encima de
  // lo suyo. Si no se puede leer, no se puede decidir: falla cerrado.
  const actual = await google.readSheetValues(ID, `${tab}!A1:${letra(ANCHO - 1)}`).catch((e) => {
    throw new Error(`no pude leer "${PESTAÑA}" (${e.message}). NO escribo: sin esa lectura la Regla 0 decide a ciegas.`)
  })
  const { grid: gridFinal, respetadas, ediciones, candidatos } = await conEdicionesRespetadas(ID, PESTAÑA, g.filas, actual)
  g.filas = gridFinal
  for (const r of respetadas) console.log(`  ✋ respeto tu texto ("${r.suyo.slice(0, 44)}") en vez de escribir "${r.mio.slice(0, 44)}"`)
  const escritura = await escribirPreservando(google, ID, tab, g.filas, { respetar: false, anchoHoja: Math.max(ANCHO, hoja.cols ?? ANCHO) })
  // ═══ SI NO SE ESCRIBIÓ, NO SE FORMATEA NI SE MUEVEN LOS NOMBRES ═══
  //
  // La guarda hacía bien su trabajo —con la pestaña candada NO se escribe— pero el resultado se
  // ignoraba: `formatear` pintaba la geometría de la grilla NUEVA sobre los valores VIEJOS y `publicar`
  // reapuntaba CAJA_TOTAL_DISPONIBLE y CAJA_FECHA_SALDO a dos celdas vacías. Con el total en cero y la
  // fecha de corte en cero, TODO cheque y TODA quincena pasan el filtro ">=fecha de saldo" y el
  // calendario infla sus tramos. Sin un solo #ERROR y sin un aviso.
  if (escritura?.bloqueada || escritura?.editadaPorHumano) {
    console.log(`  🔒 "${PESTAÑA}" bajo tu control: no escribí, y por lo tanto NO le toco el formato, NI muevo sus rangos con nombre, NI reescribo su registro de rótulos.`)
    return
  }
  const { conservadas } = escritura
  if (conservadas.length) console.log(`  ✋ ${conservadas.length} celda(s) escritas por una persona — CONSERVADAS`)

  const publicados = await rangoConNombre(google, hoja.sheetId, g)
  console.log(`  🔖 ${publicados} rango(s) reapuntados a la grilla RECIÉN ESCRITA: ${RANGOS_DE_CAJA.map((r) => r.nombre).join(' · ')}`)
  await formatear(google, hoja.sheetId, g)

  const quedo = await google.readSheetValues(ID, `${tab}!A1:${letra(ANCHO - 1)}${g.filas.length}`).catch(() => [])
  await guardarRegistro(ID, PESTAÑA, g.filas, ediciones, quedo, candidatos).catch((e) => console.warn(`  ⚠ no pude guardar el registro de rótulos: ${e.message}`))

  // LOS DOS NOMBRES EN LA MISMA FILA. El Cash Flow Mensual ancla su saldo inicial en ellos: con
  // referencias por celda, insertar un bloque acá arriba dejaba sus dos filas de efectivo vacías y sin
  // avisar. Y la fecha ya no es "la última del bloque" (que dejó de tener fecha el día que el bloque
  // creció): es la celda calculada que está al lado del total.
  const { malApuntados } = await publicar(google, ID, hoja.sheetId, [
    { name: N_CAJA.total, fila: g.fTotal, col: 5 },
    { name: N_CAJA.fecha, fila: g.fTotal, col: 6 },
  ], { titulo: tab })
  for (const m of malApuntados) console.warn(`  ⚠ ${m.name} promete ${m.espera} y encontró ${m.encontro}`)

  const v = await google.readSheetValues(ID, `${tab}!A1:H${g.filas.length}`)
  const sinCargar = v.filter((f) => filaDeCuenta(String(f?.[0] ?? '').trim()) && !String(f?.[2] ?? '').trim())
  console.log(`\nQUEDÓ ESCRITO en ${g.filas.length} filas.`)
  console.log(`  Total disponibilidades: ${v[g.fTotal - 1]?.[4] || '—'}`)
  console.log(`  Piso de caja: ${v[g.fPeor - 1]?.[2] || '—'} · ${v[g.fPeor - 1]?.[6] || '—'}`)
  console.log(`  Controles: ${v[g.fCtrl1 - 2]?.[6] || '—'} · ${v[g.fCtrl1 - 1]?.[6] || '—'}`)
  if (sinCargar.length) console.log(`  ⚠ ${sinCargar.length} fila(s) sin dato cargado: ${sinCargar.map((f) => f[0]).join(' · ')}`)
}

/**
 * EL FORMATO — UN STATEMENT, NO UNA PLANILLA.
 *
 * SE RESETEA TODO AL ESTÁNDAR Y RECIÉN DESPUÉS SE PINTAN LAS EXCEPCIONES. El formateador viejo sólo
 * APLICABA formato, nunca lo sacaba, así que cada corrida dejaba lo suyo encima y debajo quedaba lo
 * viejo: dos tipografías, seis tamaños, nueve colores de texto y nueve fondos. No era un estándar, era
 * sedimento.
 *
 * SIN CUADRÍCULA Y SIN BARRAS DE COLOR: la jerarquía la dan la tipografía y una hairline, no un
 * rectángulo azul. Lo que se resta se distingue por el SIGNO y por la palabra.
 */
async function formatear(google, sheetId, g) {
  const AMARILLO = { red: 1, green: 0.98, blue: 0.86 }
  const INK = { red: 0.10, green: 0.13, blue: 0.20 }
  const MUTED = { red: 0.53, green: 0.52, blue: 0.49 }
  const HAIR = { red: 0.82, green: 0.80, blue: 0.76 }
  const ACENTO = { red: 0.11, green: 0.23, blue: 0.37 }
  const n = g.filas.length
  const r = (r0, r1, c0 = 0, c1 = ANCHO) => ({ sheetId, startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1 })
  const req = [
    { unmergeCells: { range: r(0, Math.max(n, 200)) } },
    E.reset(sheetId, Math.max(n + 20, 200), ANCHO),
    { updateSheetProperties: { properties: { sheetId, gridProperties: { hideGridlines: true, frozenRowCount: 3 } }, fields: 'gridProperties.hideGridlines,gridProperties.frozenRowCount' } },
  ]
  const borde = (rg, lados = { bottom: true }) => req.push({ updateBorders: { range: rg, ...(lados.bottom ? { bottom: { style: 'SOLID', color: HAIR } } : {}), ...(lados.top ? { top: { style: 'SOLID', color: HAIR } } : {}) } })
  // TODO FORMATO PASA POR conFuente: si define textFormat sin nombrar la tipografía, Sheets la
  // reemplaza por la de la hoja y la celda queda en otra fuente.
  const fmt = (rg, fields, format) => req.push({ repeatCell: { range: rg, cell: { userEnteredFormat: E.conFuente(format) }, fields } })

  // Los grupos viejos se borran ANTES: la API los apila y el margen izquierdo termina con una escalera
  // de +/- que crece cada dos horas. Y esta pestaña ya no pliega nada: entra entera en la pantalla.
  const grupos = (await google.getRowGroups(ID).catch(() => [])).find((s) => s.sheetId === sheetId)?.grupos ?? []
  for (const gr of grupos) req.push({ deleteDimensionGroup: { range: { sheetId, dimension: 'ROWS', startIndex: gr.startIndex, endIndex: gr.endIndex } } })

  // ═══ EL "$" ES DEL TOTAL, NO DE CADA CELDA ═══
  //
  // Todo el cuerpo salía con MONEDA_TOTAL: el signo pesos repetido cientos de veces. Un símbolo que
  // aparece en todas las filas no distingue nada, y la fila donde SÍ se cierra la cuenta deja de
  // destacarse. El cuerpo va primero y los totales encima: los `repeatCell` se aplican en orden.
  for (const c of [2, 3, 4, 5]) {
    fmt(r(0, n, c, c + 1), 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment',
      { numberFormat: MONEDA_CUERPO, horizontalAlignment: 'RIGHT' })
  }
  for (const f of g.totales ?? []) {
    for (const c of [2, 3, 4, 5]) fmt(r(f - 1, f, c, c + 1), 'userEnteredFormat.numberFormat', { numberFormat: MONEDA_TOTAL })
  }
  // LA COLUMNA "MONEDA" ES TEXTO: con el formato moneda de la columna entera, "ARS" quedaba en una
  // celda que dice ser plata. Y la de la derecha es el VEREDICTO: texto, siempre.
  fmt(r(0, n, 1, 2), 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment,userEnteredFormat.textFormat',
    { numberFormat: { type: 'TEXT' }, horizontalAlignment: 'CENTER', textFormat: { fontSize: E.TAM.nota, fontFamily: E.FUENTE } })
  fmt(r(0, n, 6, 7), 'userEnteredFormat',
    { numberFormat: { type: 'TEXT' }, horizontalAlignment: 'LEFT', wrapStrategy: 'CLIP', textFormat: { fontSize: E.TAM.nota, fontFamily: E.FUENTE, foregroundColor: MUTED } })

  // ── EL BLOQUE DE CUENTAS: la D es tipo de cambio y la F es fecha. SÓLO ACÁ ────────────────────────
  //
  // El resto de la pestaña usa esas mismas columnas para plata (el calendario) y para texto (los
  // veredictos). Formatearlas a lo largo de toda la hoja es lo que hacía que la posición acumulada del
  // calendario se dibujara "14/12/15787" —el número de serie de una fecha— y que "Esta semana" saliera
  // con formato de moneda. Los dos defectos que el auditor de pantalla marcaba como `texto_en_numero`.
  fmt(r(g.d0 - 1, g.d1, 3, 4), 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment',
    { numberFormat: { type: 'NUMBER', pattern: '#,##0.00;;""' }, horizontalAlignment: 'CENTER' })
  fmt(r(g.d0 - 1, g.fTotal, 5, 6), 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment',
    { numberFormat: { type: 'DATE', pattern: 'dd/mm/yyyy' }, horizontalAlignment: 'CENTER' })
  fmt(r(g.d0 - 1, g.d1, 6, 7), 'userEnteredFormat.horizontalAlignment', { horizontalAlignment: 'CENTER' })
  // LOS IMPORTES EN DÓLARES, con su propio símbolo: sin esto, U$S 581,39 se dibuja "$581" y se lee como
  // 581 pesos — un error de lectura de tres órdenes de magnitud que sólo se ve mirando la pantalla.
  for (const f of g.usd) {
    fmt(r(f - 1, f, 2, 3), 'userEnteredFormat.numberFormat',
      { numberFormat: { type: 'CURRENCY', pattern: '"U$S "#,##0.00;("U$S "#,##0.00);"—"' } })
  }
  // LAS CELDAS DE CARGA EN AMARILLO. Es la diferencia más importante de la pestaña: lo que una persona
  // escribe tiene que verse distinto de lo que el sistema calcula, o nadie sabe qué puede tocar.
  for (const f of [...g.amarillas, g.fArqArs, g.fArqUsd]) {
    for (const c of [2, 5]) fmt(r(f - 1, f, c, c + 1), 'userEnteredFormat.backgroundColor', { backgroundColor: AMARILLO })
  }

  // ── EL PANEL DE TITULARES ────────────────────────────────────────────────────────────────────────
  // Grande, con aire, y con la definición al lado del rótulo: es lo primero que se ve al abrir.
  fmt(r(0, 1), 'userEnteredFormat.textFormat', { textFormat: { bold: true, fontSize: E.TAM.titulo, foregroundColor: INK } })
  fmt(r(g.fTitulos - 1, g.fTitulos), 'userEnteredFormat',
    { numberFormat: { type: 'TEXT' }, textFormat: { bold: true, fontSize: E.TAM.nota, foregroundColor: MUTED }, horizontalAlignment: 'LEFT', wrapStrategy: 'WRAP', verticalAlignment: 'BOTTOM' })
  fmt(r(g.fCifras - 1, g.fCifras), 'userEnteredFormat',
    { numberFormat: E.NUM.moneda, textFormat: { bold: true, fontSize: E.TAM.titular, fontFamily: E.FUENTE_NUM, foregroundColor: INK }, horizontalAlignment: 'LEFT', verticalAlignment: 'MIDDLE' })
  // EL ACENTO VA EN EL NÚMERO QUE HABILITA UNA ACCIÓN, no en el más grande. Los tres primeros
  // titulares describen la posición; lo colocable es el único sobre el que se puede hacer algo hoy.
  fmt(r(g.fCifras - 1, g.fCifras, 6, 7), 'userEnteredFormat.textFormat',
    { textFormat: { bold: true, fontSize: E.TAM.titular, fontFamily: E.FUENTE_NUM, foregroundColor: ACENTO } })
  for (const c of [0, 2, 4, 6]) {
    req.push({ mergeCells: { range: r(g.fTitulos - 1, g.fTitulos, c, c + 2), mergeType: 'MERGE_ROWS' } })
    req.push({ mergeCells: { range: r(g.fCifras - 1, g.fCifras, c, c + 2), mergeType: 'MERGE_ROWS' } })
  }
  req.push({ updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: g.fTitulos - 1, endIndex: g.fTitulos }, properties: { pixelSize: 32 }, fields: 'pixelSize' } })
  req.push({ updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: g.fCifras - 1, endIndex: g.fCifras }, properties: { pixelSize: 38 }, fields: 'pixelSize' } })

  // ── LOS NÚMEROS QUE NO SON PLATA ────────────────────────────────────────────────────────────────
  // UNA COBERTURA NO ES UN IMPORTE: es cuántas veces alcanza. Con el formato de la columna, 1,83 se
  // dibujaba "$2" — el número que decide si hay que salir a buscar plata, redondeado a dos pesos.
  fmt(r(g.fCobDesde - 1, g.fCobHasta, 6, 7), 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment',
    { numberFormat: VECES, horizontalAlignment: 'CENTER' })
  fmt(r(g.fCobDesde - 1, g.fCobHasta, 5, 6), 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment',
    { numberFormat: { type: 'DATE', pattern: 'dd/mm/yyyy' }, horizontalAlignment: 'CENTER' })
  // El acumulado de la concentración es una proporción, no plata.
  fmt(r(g.fCli0 - 1, g.fCli1, 6, 7), 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment',
    { numberFormat: PORCENTAJE, horizontalAlignment: 'CENTER' })

  // ── ENCABEZADOS Y TÍTULOS DE BLOQUE ─────────────────────────────────────────────────────────────
  const cabCal = g.filas.findIndex((f) => String(f?.[0] ?? '').trim() === 'Tramo') + 1
  const cabCob = g.filas.findIndex((f) => String(f?.[0] ?? '').trim() === 'Horizonte') + 1
  for (const c of [g.cab1, cabCal, cabCob, g.cabCli].filter((x) => x > 0)) {
    // UN ENCABEZADO ES TEXTO, NUNCA PLATA NI FECHA: se le devuelve el formato de número junto con la
    // tipografía, o gana el que se aplicó a la columna entera más arriba.
    fmt(r(c - 1, c), 'userEnteredFormat.numberFormat', { numberFormat: { type: 'TEXT' } })
    fmt(r(c - 1, c), 'userEnteredFormat',
      { textFormat: { bold: true, foregroundColor: MUTED, fontSize: E.TAM.nota }, horizontalAlignment: 'LEFT', wrapStrategy: 'CLIP' })
    for (const col of [2, 3, 4, 5]) fmt(r(c - 1, c, col, col + 1), 'userEnteredFormat.horizontalAlignment', { horizontalAlignment: 'RIGHT' })
    borde(r(c - 1, c))
  }
  g.filas.forEach((f, i) => {
    const t = String(f[0] ?? '')
    // EL RÓTULO DE UN BLOQUE SE VE COMO UN BLOQUE, con el estilo del archivo y no con una negrita
    // suelta. Ocupa la fila entera: no compite con ninguna columna.
    if (/^\d+ · /.test(t)) {
      fmt(r(i, i + 1), 'userEnteredFormat.numberFormat', { numberFormat: { type: 'TEXT' } })
      fmt(r(i, i + 1, 0, 6), 'userEnteredFormat', { textFormat: { bold: true, fontFamily: E.FUENTE, fontSize: E.TAM.cuerpo, foregroundColor: INK }, horizontalAlignment: 'LEFT' })
      borde(r(i, i + 1))
    }
    if (/^⇒/.test(t)) fmt(r(i, i + 1, 0, 1), 'userEnteredFormat.textFormat', { textFormat: { bold: true, fontFamily: E.FUENTE, fontSize: E.TAM.cuerpo } })
    // Las líneas anotadas ("· el piso…", "· plata que no cierra…") son lectura de segundo nivel: más
    // chicas y en gris, para que el ojo distinga un renglón de tabla de una conclusión sobre la tabla.
    if (/^· /.test(t)) fmt(r(i, i + 1, 0, 1), 'userEnteredFormat.textFormat', { textFormat: { italic: true, fontSize: E.TAM.nota, foregroundColor: MUTED } })
  })

  // ── EL CALENDARIO ES PLATA EN CUATRO COLUMNAS ───────────────────────────────────────────────────
  // Comparte la grilla con el bloque de cuentas, donde la D es "Tipo de cambio" y la F "Fecha". Sin
  // decirlo explícitamente heredaba esos formatos y un saldo se dibujaba como una fecha: un cuadro así
  // no se puede revisar, el ojo no suma lo que ve.
  fmt(r(g.cal0 - 1, g.calFin, 2, 6), 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment',
    { numberFormat: E.NUM.moneda, horizontalAlignment: 'RIGHT' })
  // Y la columna "Hasta" del calendario es TEXTO ("12/08" lo produce un TEXT), nunca una fecha serial.
  fmt(r(g.cal0 - 1, g.calFin, 6, 7), 'userEnteredFormat.numberFormat', { numberFormat: { type: 'TEXT' } })

  // Totales RULADOS, no rellenos de color: la línea de total lleva una hairline arriba y la cifra que
  // se decide va en acento. Es como un estado financiero cierra un total, no como una planilla lo pinta.
  fmt(r(g.fTotal - 1, g.fTotal), 'userEnteredFormat.textFormat,userEnteredFormat.backgroundColor',
    { textFormat: { bold: true, foregroundColor: ACENTO }, backgroundColor: { red: 1, green: 1, blue: 1 } })
  borde(r(g.fTotal - 1, g.fTotal), { top: true, bottom: true })

  // ═══ NINGUNA FILA OCULTA. NUNCA. ═══
  //
  // El dueño, dos veces: *"no veo lo solicitado en caja, si se encuentra en filas ocultas, mostrar"*.
  // Medido entonces: 115 filas ocultas, y el calendario que él había pedido estaba entre ellas. Una
  // fila que existe y no se ve es peor que una fila fea: no se puede auditar lo que no se sabe que está.
  req.push({ updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 0, endIndex: Math.max(n + 40, 200) }, properties: { hiddenByUser: false }, fields: 'hiddenByUser' } })
  // ═══ NI UNA NOTA, EN NINGUNA COLUMNA ═══
  //
  // Una nota vive FUERA del valor de la celda: reescribir la pestaña no la toca, así que la única forma
  // de que un borrado del dueño dure es borrarlas explícitamente y no volver a escribir ninguna.
  req.push({
    updateCells: {
      range: { sheetId, startRowIndex: 0, endRowIndex: n, startColumnIndex: 0, endColumnIndex: ANCHO },
      rows: Array.from({ length: n }, () => ({ values: Array.from({ length: ANCHO }, () => ({ note: '' })) })),
      fields: 'note',
    },
  })
  ANCHOS.forEach((px, i) => req.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: i, endIndex: i + 1 }, properties: { pixelSize: px }, fields: 'pixelSize' } }))
  // Un texto se dibuja como texto, decidido por CONTENIDO y no por rangos que hay que mantener.
  const { requests: rTxt, celdas } = requestsTextoPorContenido(sheetId, g.filas || [])
  req.push(...rTxt)
  if (celdas) console.log(`  ${celdas} celda(s) de TEXTO con su formato de texto (no de plata)`)
  await google.spreadsheetBatchUpdate(ID, req)

  // LOS GRÁFICOS VAN EN SU PROPIO LOTE, Y DESPUÉS. Un `addChart` que falla —porque la API cambió el
  // nombre de un tipo, porque un rango quedó corto— haría fallar el batch ENTERO y la pestaña se
  // quedaría sin formato. Un gráfico es un resumen de la tabla: si no se puede dibujar, la tabla tiene
  // que quedar igual de bien. Ver lib/caja-graficos.mjs.
  const charts = await requestsDeGraficos(google, ID, sheetId, g)
  if (charts.length) {
    await google.spreadsheetBatchUpdate(ID, charts)
      .then(() => console.log(`  📊 ${charts.filter((c) => c.addChart).length} gráfico(s) dibujados`))
      .catch((e) => console.warn(`  ⚠ no pude dibujar los gráficos (${e.message}). La tabla quedó bien: el gráfico la resume, no la reemplaza.`))
  }
}

// ═══ SÓLO ESCRIBE SI SE LO CORRE A PROPÓSITO ═══
//
// Antes `main()` se ejecutaba con el solo hecho de IMPORTAR el archivo: cualquier test que importara
// `grilla` habría reescrito la pestaña real. En un proyecto que ya perdió trabajo del dueño seis veces
// eso no es un detalle de estilo.
if (import.meta.url === `file://${process.argv[1]}`) {
  main()
    .catch((e) => { console.error('ERROR:', e.message); process.exitCode = 1 })
    .finally(async () => { await import('../lib/db.mjs').then((m) => m.closePool()).catch(() => {}) })
}
