#!/usr/bin/env node
// LA PESTAÑA CAJA — LA PORTADA EJECUTIVA DE TESORERÍA.
//
// POR QUÉ EXISTE. Era la única pestaña vacía del archivo, y por eso el número más grande del cuadro no
// significaba nada: "flujo acumulado −$433.811.452" es un DELTA, no un saldo. Sin saldo inicial, un
// cash flow dice cuánto se mueve pero no puede contestar la única pregunta que se le hace: qué día te
// quedás sin plata.
//
// LO QUE ESTA PESTAÑA NO HACE, A PROPÓSITO: no lleva movimientos. Cada movimiento vive en el libro
// canónico `_MOVIMIENTOS`, y esta pestaña lo consulta. Un libro acá sería la segunda copia de la misma
// plata, y el día que no coincidan nadie sabría cuál tiene razón.
//
// ═══ EL REDISEÑO DEL 05/08/2026 — LA PORTADA ═══
//
// El dueño: *"no quiero que parezca una planilla… un producto de Treasury… Dirección debe entender la
// situación en menos de cinco segundos"*. La grilla vive entera en lib/caja-grilla.mjs (se construye y
// se verifica en frío, sin red y sin escribir una celda) y este archivo hace lo único que sólo se
// puede hacer contra Google: leer, fusionar, escribir, formatear, publicar los nombres y dibujar.
//
// EL MECANISMO DE ESCRITURA NO CAMBIÓ y no se toca: desarmar combinaciones → leer → Regla 0 →
// escribir preservando → si no se escribió, CORTAR → formatear → publicar → verificar. Lo que cambió
// es la GRILLA y el FORMATO.
//
// IDEMPOTENCIA CON DATO HUMANO ADENTRO: es la ÚNICA pestaña del archivo donde se carga un número a
// mano (el arqueo). Antes de reescribirla se leen los valores cargados y se vuelven a poner en su
// lugar, buscándolos POR EL NOMBRE DE LA CUENTA y no por número de fila.
//
//   node orquestador/scripts/caja-pestana.mjs [--dry]

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import * as E from '../lib/estilo-pestana.mjs'
import { MONEDA_TOTAL, MONEDA_CUERPO } from '../lib/formato-statement.mjs'
import { hallarPestana } from '../lib/sheet-pestanas.mjs'
import { escribirPreservando, rellenoDeCola } from '../lib/preservar-anotaciones.mjs'
import { requestsTextoPorContenido } from '../lib/formato-texto-por-contenido.mjs'
import { conEdicionesRespetadas, guardarRegistro, leerRegistro } from '../lib/respetar-ediciones.mjs'
import { CAJA as N_CAJA, publicar } from '../lib/rangos-nombrados.mjs'
import { filaDeCuenta } from '../lib/caja-disponibilidades.mjs'
import { DESDE_CAJA, PESTANA_ANEXO } from '../lib/caja-anexo-nombres.mjs'
import { refsDelArchivo, rescatar } from '../lib/caja-refs.mjs'
import {
  grilla, ANCHO, ANCHOS, FILAS_MAXIMAS, esTituloDeBloque, COLS_PLATA, COLS_FECHA, COLS_TARJETA,
} from '../lib/caja-grilla.mjs'
import { requestsDeGraficos, FILA_ANCLA } from '../lib/caja-graficos.mjs'
import { ubicarSeries } from '../lib/caja-anexo-series.mjs'
import { MARCA_ALERTA, MARCA_OK } from '../lib/caja-avisos.mjs'

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
 * Los cuatro del arqueo se habían creado UNA vez y nadie los volvía a apuntar. La primera vez que el
 * generador rehízo la pestaña, el bloque bajó diez filas y los cuatro nombres quedaron apuntando a la
 * fila del tipo de cambio: "Caja en dólares" pasó a leerse a sí misma y toda la columna dio #REF!.
 *
 * LAS COLUMNAS CAMBIARON CON LA PORTADA (05/08) y por eso están declaradas acá y en un solo lugar: el
 * importe de cada cuenta vive ahora en la B ("Importe en origen") y la fecha en la D. Un nombre que
 * se quedó apuntando a la columna vieja no da error: devuelve otra cosa.
 */
export const RANGOS_DE_CAJA = [
  { nombre: DESDE_CAJA.arqueoArs, fila: (g) => g.fArqArs, col: 1 },
  { nombre: DESDE_CAJA.arqueoArsFecha, fila: (g) => g.fArqArs, col: 3 },
  { nombre: DESDE_CAJA.arqueoUsd, fila: (g) => g.fArqUsd, col: 1 },
  { nombre: DESDE_CAJA.arqueoUsdFecha, fila: (g) => g.fArqUsd, col: 3 },
  { nombre: DESDE_CAJA.bancoSaldo, fila: (g) => g.fBancoPesos, col: 2 },
  { nombre: DESDE_CAJA.bancoCorte, fila: (g) => g.fBancoPesos, col: 3 },
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
 * $80,91M **sin un solo #REF! y sin una sola celda de contenido modificada**.
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

  const anexo = hojas.find((h) => h.title === PESTANA_ANEXO)
  if (!anexo) {
    // NO SE ESCRIBE UNA CAJA QUE VA A MOSTRAR #NAME? EN SUS ALERTAS. El anexo publica once nombres que
    // esta pestaña cita; sin él, las alertas y las acciones quedan en error y el dueño abre una
    // pestaña rota. Correr el paso que falta es una línea; escribir esto igual es media pantalla en rojo.
    throw new Error(`falta la pestaña "${PESTANA_ANEXO}". Corré primero: node orquestador/scripts/caja-anexo-pestana.mjs`)
  }

  // ═══ LA LECTURA NO LLEVA TECHO DE FILAS ═══
  //
  // Era `A1:I80` y el bloque donde el dueño tipea el ARQUEO vivía en la fila 148: el rescate NUNCA veía
  // el conteo ni su fecha. Mientras el bloque no se movía no se notaba, porque la fusión preservaba esas
  // celdas POR POSICIÓN. Una lectura con techo no devuelve "no hay dato", devuelve "no miré".
  const previo = await google.readSheetGrid(ID, `${tab}!A1:J`).catch(() => ({ filas: [] }))
  const cargado = rescatar(previo.filas ?? [])
  const refs = await refsDelArchivo(google, ID, hojas)

  const g = grilla(cargado, refs)
  console.log(`${tab}: ${g.filas.length} filas (tope ${FILAS_MAXIMAS}) · ${cargado.size} celda(s) con dato ya cargado`)
  if (g.filas.length > FILAS_MAXIMAS) {
    throw new Error(`CAJA quedó en ${g.filas.length} filas y el objetivo es ${FILAS_MAXIMAS}: no entra en una pantalla. Antes de escribir hay que decidir QUÉ SALE al anexo.`)
  }
  if (DRY) return console.log('--dry: no escribí nada.')

  // GARANTIZAR EL ALTO Y EL ANCHO ANTES DE TODO: si el batch apunta más allá del alto real, la API
  // ABORTA el write entero y CAJA queda con lo de la corrida anterior. Y los gráficos flotan pero su
  // ANCLA es una celda real: si la hoja no llega a esa fila, `addChart` devuelve 400 y el lote se cae.
  const hasta = Math.max(g.filas.length + 20, FILA_ANCLA + 4, hoja.rows ?? 0)
  const anchoHoja = Math.max(ANCHO, hoja.cols ?? 0)
  if ((hoja.rows ?? 0) < hasta || (hoja.cols ?? 0) < anchoHoja) {
    await google.spreadsheetBatchUpdate(ID, [{
      updateSheetProperties: {
        properties: { sheetId: hoja.sheetId, gridProperties: { rowCount: hasta, columnCount: anchoHoja } },
        fields: 'gridProperties.rowCount,gridProperties.columnCount',
      },
    }])
    console.log(`  ↔ la hoja queda en ${hasta} filas × ${anchoHoja} columnas (los gráficos anclan en la fila ${FILA_ANCLA + 1})`)
  }
  const creados = await rangoConNombre(google, hoja.sheetId, g, { soloFaltantes: true })
  if (creados) console.log(`  🔖 ${creados} rango(s) con nombre CREADOS (no existían): arranque en frío`)

  // ═══ NO SE BORRA HASTA SABER QUE LO NUEVO SE PUEDE ESCRIBIR ═══
  //
  // Una corrida falló DESPUÉS del clear —filas más anchas que la grilla, y la API rechaza el batch
  // entero— y la pestaña quedó vacía. En la corrida siguiente el rescate leyó una pestaña ya limpia y
  // los $1.725.000 que alguien había tipeado se perdieron. El error no fue el ancho: fue el ORDEN.
  const malas = g.filas.map((f, i) => (f.length > ANCHO ? i + 1 : 0)).filter(Boolean)
  if (malas.length) throw new Error(`${malas.length} fila(s) más anchas que la tabla (${ANCHO} columnas): ${malas.slice(0, 5).join(', ')}. NO borro nada.`)
  if (!g.filas.length) throw new Error('la grilla salió vacía: no escribo la pestaña')

  // DESARMAR LAS COMBINACIONES ANTES DE ESCRIBIR, NO DESPUÉS: en la corrida en que existe una celda
  // combinada, la escritura se pierde EN SILENCIO —ni error ni valor— y recién la corrida siguiente
  // deja el dato. La portada combina diez celdas (las cinco tarjetas × tres filas), así que esto pasó
  // de ser una precaución a ser obligatorio en cada corrida.
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
  // fecha de corte en cero, TODO cheque y TODA quincena pasan el filtro ">=fecha de saldo" y la
  // escalera infla sus tramos. Sin un solo #ERROR y sin un aviso.
  // `noVerificable` TAMBIÉN corta (condición D4 del auditor): si la firma no pudo releer la pestaña
  // (un 429, un corte), la escritura no ocurrió — y reapuntar los rangos con nombre o pintar la
  // geometría nueva sobre el layout viejo es el incidente del 03/08 ($123,79M → $80,91M) de nuevo.
  if (escritura?.bloqueada || escritura?.editadaPorHumano || escritura?.noVerificable) {
    console.log(`  🔒 "${PESTAÑA}" bajo tu control: no escribí, y por lo tanto NO le toco el formato, NI muevo sus rangos con nombre, NI reescribo su registro de rótulos.`)
    return
  }
  const { conservadas } = escritura
  if (conservadas.length) console.log(`  ✋ ${conservadas.length} celda(s) escritas por una persona — CONSERVADAS`)

  // ═══ LA COLA DEL DISEÑO VIEJO SE BARRE, NO SE DESTAPA (condición D3 del auditor) ═══
  //
  // La portada nueva son 20 filas y la pestaña traía 37: sin esto, debajo del diseño nuevo quedaba la
  // ESCALERA VIEJA — dos calendarios de la misma plata con números distintos, y `formatear` encima los
  // destapa. Sólo se limpian las filas cuyo contenido es del generador (el registro de rótulos es la
  // prueba de propiedad); una fila con algo del dueño se conserva y se GRITA, no se pisa.
  {
    const finViejo = Math.max(hoja.rows ?? 0, 0)
    const cola = finViejo > g.filas.length
      ? await google.readSheetValues(ID, `${tab}!A${g.filas.length + 1}:${letra(ANCHO - 1)}${Math.min(finViejo, g.filas.length + 60)}`).catch(() => null)
      : []
    if (cola === null) {
      console.log('  ⚠ no pude releer la cola del diseño viejo: la dejo como está (se barre en la próxima corrida)')
    } else if (cola.length) {
      // leerRegistro devuelve `mios` como ARRAY de rótulos; rellenoDeCola espera un Set.
      const reg = await leerRegistro(ID, PESTAÑA).catch(() => null)
      const mios = new Set(Array.isArray(reg?.mios) ? reg.mios : [])
      const { filas: relleno, preservar } = rellenoDeCola(cola, mios, ANCHO)
      for (const pz of preservar) console.log(`  ✋ fila ${g.filas.length + 1 + pz.i} de la cola tiene texto que no es del generador — CONSERVADA: ${pz.celdas[0]?.slice(0, 40)}`)
      let barridas = 0
      for (let i = 0; i < relleno.length; i++) {
        if (!relleno[i]) continue
        let j = i; while (j + 1 < relleno.length && relleno[j + 1]) j++
        await google.escribirValoresPorCeldas(ID, hoja.sheetId, relleno.slice(i, j + 1), { fila0: g.filas.length + i })
        barridas += j - i + 1; i = j
      }
      if (barridas) console.log(`  🧹 ${barridas} fila(s) del diseño viejo barridas debajo de la portada`)
    }
  }

  const publicados = await rangoConNombre(google, hoja.sheetId, g)
  console.log(`  🔖 ${publicados} rango(s) reapuntados a la grilla RECIÉN ESCRITA: ${RANGOS_DE_CAJA.map((r) => r.nombre).join(' · ')}`)
  await formatear(google, hoja.sheetId, g, anexo)

  const quedo = await google.readSheetValues(ID, `${tab}!A1:${letra(ANCHO - 1)}${g.filas.length}`).catch(() => [])
  await guardarRegistro(ID, PESTAÑA, g.filas, ediciones, quedo, candidatos).catch((e) => console.warn(`  ⚠ no pude guardar el registro de rótulos: ${e.message}`))

  // LOS DOS NOMBRES EN LA MISMA FILA. El Cash Flow Mensual ancla su saldo inicial en ellos: con
  // referencias por celda, insertar un bloque acá arriba dejaba sus dos filas de efectivo vacías y sin
  // avisar. La C es la columna del saldo en pesos y la D la de su fecha.
  const { malApuntados } = await publicar(google, ID, hoja.sheetId, [
    { name: N_CAJA.total, fila: g.fCierre, col: 2 },
    { name: N_CAJA.fecha, fila: g.fCierre, col: 3 },
  ], { titulo: tab })
  for (const m of malApuntados) console.warn(`  ⚠ ${m.name} promete ${m.espera} y encontró ${m.encontro}`)

  const v = await google.readSheetValues(ID, `${tab}!A1:${letra(ANCHO - 1)}${g.filas.length}`)
  const sinCargar = v.filter((f) => filaDeCuenta(String(f?.[0] ?? '').trim()) && !String(f?.[1] ?? '').trim())
  console.log(`\nQUEDÓ ESCRITO en ${g.filas.length} filas.`)
  // LAS CINCO TARJETAS, LEÍDAS DE LA PESTAÑA Y NO DE LA GRILLA: lo que se informa es el EFECTO, no lo
  // que el generador pensaba escribir. Un resumen que sale del objeto en memoria no prueba nada.
  g.tarjetas.forEach((t, i) => console.log(`  ${t.rotulo}: ${v[g.fCifras - 1]?.[COLS_TARJETA[i]] || '—'}`))
  for (let f = g.fAviso0; f <= g.fAviso1; f++) {
    for (const c of [0, 5]) if (String(v[f - 1]?.[c] ?? '').trim()) console.log(`  ${v[f - 1][c]}`)
  }
  if (sinCargar.length) console.log(`  ⚠ ${sinCargar.length} fila(s) sin dato cargado: ${sinCargar.map((f) => f[0]).join(' · ')}`)
}

/**
 * EL FORMATO — UN PRODUCTO, NO UNA PLANILLA.
 *
 * SE RESETEA TODO AL ESTÁNDAR Y RECIÉN DESPUÉS SE PINTAN LAS EXCEPCIONES. El formateador viejo sólo
 * APLICABA formato, nunca lo sacaba, así que cada corrida dejaba lo suyo encima y debajo quedaba lo
 * viejo: dos tipografías, seis tamaños, nueve colores de texto y nueve fondos. No era un estándar, era
 * sedimento.
 *
 * ═══ LAS TRES REGLAS DEL DISEÑO, Y SON TRES ═══
 *
 * 1. UNA TIPOGRAFÍA (Arial) y DOS tamaños de número: el de las tarjetas y el del cuerpo. Cada tamaño
 *    de más es una jerarquía que el lector tiene que decodificar y que no significa nada.
 * 2. UN SOLO COLOR DE ACENTO —el azul tinta del archivo— reservado para lo que decide, y ROJO SÓLO
 *    para riesgo real. Un rojo que aparece en cualquier negativo deja de avisar.
 * 3. SIN CUADRÍCULA, SIN BARRAS DE COLOR, SIN BORDES DE CAJA. La jerarquía la dan la tipografía y una
 *    hairline. Lo que se resta se distingue por el signo y por la palabra.
 */
async function formatear(google, sheetId, g, anexo) {
  const AMARILLO = { red: 1, green: 0.98, blue: 0.86 }
  const INK = { red: 0.10, green: 0.13, blue: 0.20 }
  const MUTED = { red: 0.53, green: 0.52, blue: 0.49 }
  const HAIR = { red: 0.82, green: 0.80, blue: 0.76 }
  const ACENTO = { red: 0.11, green: 0.23, blue: 0.37 }
  const ROJO = { red: 0.61, green: 0.18, blue: 0.11 }
  const VERDE = { red: 0.11, green: 0.42, blue: 0.24 }
  const n = g.filas.length
  const r = (r0, r1, c0 = 0, c1 = ANCHO) => ({ sheetId, startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1 })
  const req = [
    { unmergeCells: { range: r(0, Math.max(n, 200)) } },
    E.reset(sheetId, Math.max(n + 20, 200), ANCHO),
    // SE CONGELAN LAS CUATRO PRIMERAS FILAS: el titular y las cinco tarjetas. Es lo que hace que el
    // número que decide siga a la vista si alguien baja a mirar los gráficos.
    { updateSheetProperties: { properties: { sheetId, gridProperties: { hideGridlines: true, frozenRowCount: 4 } }, fields: 'gridProperties.hideGridlines,gridProperties.frozenRowCount' } },
  ]
  const borde = (rg, lados = { bottom: true }) => req.push({ updateBorders: { range: rg, ...(lados.bottom ? { bottom: { style: 'SOLID', color: HAIR } } : {}), ...(lados.top ? { top: { style: 'SOLID', color: HAIR } } : {}) } })
  // TODO FORMATO PASA POR conFuente: si define textFormat sin nombrar la tipografía, Sheets la
  // reemplaza por la de la hoja y la celda queda en otra fuente.
  const fmt = (rg, fields, format) => req.push({ repeatCell: { range: rg, cell: { userEnteredFormat: E.conFuente(format) }, fields } })

  // Los grupos viejos se borran ANTES: la API los apila y el margen izquierdo termina con una escalera
  // de +/- que crece cada dos horas. Y esta pestaña ya no pliega nada: entra entera en la pantalla.
  const grupos = (await google.getRowGroups(ID).catch(() => [])).find((s) => s.sheetId === sheetId)?.grupos ?? []
  for (const gr of grupos) req.push({ deleteDimensionGroup: { range: { sheetId, dimension: 'ROWS', startIndex: gr.startIndex, endIndex: gr.endIndex } } })

  // ── EL CONTRATO DE COLUMNAS, APLICADO DE UNA VEZ ────────────────────────────────────────────────
  //
  // La plata es plata en toda la pestaña y la fecha es fecha en toda la pestaña. El diseño anterior
  // formateaba por bloque y cada bloque nuevo tenía que "acordarse": así fue como la posición
  // acumulada se dibujó "14/12/15787" —el serial de una fecha— y "Esta semana" salió con signo pesos.
  for (const c of COLS_PLATA) {
    fmt(r(0, n, c, c + 1), 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment',
      { numberFormat: MONEDA_CUERPO, horizontalAlignment: 'RIGHT' })
  }
  for (const c of COLS_FECHA) {
    fmt(r(0, n, c, c + 1), 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment',
      { numberFormat: { type: 'DATE', pattern: 'dd/mm/yyyy' }, horizontalAlignment: 'CENTER' })
  }
  // El "$" es de la fila de cierre, no de cada celda: un símbolo repetido cincuenta veces no distingue.
  for (const f of g.totales ?? []) {
    for (const c of COLS_PLATA) fmt(r(f - 1, f, c, c + 1), 'userEnteredFormat.numberFormat', { numberFormat: MONEDA_TOTAL })
  }
  // LAS COLUMNAS DE TEXTO SON TEXTO: los rótulos, el aire del medio y el margen. Sin esto el aire
  // hereda el formato de la columna de al lado y una celda vacía se dibuja como "—".
  for (const c of [0, 4, 5, ANCHO - 1]) {
    fmt(r(0, n, c, c + 1), 'userEnteredFormat.numberFormat,userEnteredFormat.wrapStrategy',
      { numberFormat: { type: 'TEXT' }, wrapStrategy: 'CLIP' })
  }
  // LOS IMPORTES EN DÓLARES, con su propio símbolo: sin esto, U$S 581,39 se dibuja "$581" y se lee como
  // 581 pesos — un error de lectura de tres órdenes de magnitud que sólo se ve mirando la pantalla.
  for (const f of g.usd) {
    fmt(r(f - 1, f, 1, 2), 'userEnteredFormat.numberFormat',
      { numberFormat: { type: 'CURRENCY', pattern: '"U$S "#,##0.00;("U$S "#,##0.00);"—"' } })
  }
  // LAS CELDAS DE CARGA EN AMARILLO — y SÓLO ésas. Es la diferencia más importante de la pestaña: lo
  // que una persona escribe tiene que verse distinto de lo que el sistema calcula. El diseño anterior
  // pintaba de amarillo dos celdas CALCULADAS: un color que miente sobre quién es dueño de la celda
  // invita a escribir encima de una fórmula.
  for (const f of g.amarillas) {
    for (const c of [1, 3]) fmt(r(f - 1, f, c, c + 1), 'userEnteredFormat.backgroundColor', { backgroundColor: AMARILLO })
  }

  // ── EL TITULAR Y LAS CINCO TARJETAS ─────────────────────────────────────────────────────────────
  fmt(r(g.fTitulo - 1, g.fTitulo), 'userEnteredFormat.numberFormat', { numberFormat: { type: 'TEXT' } })
  fmt(r(g.fTitulo - 1, g.fTitulo, 0, 1), 'userEnteredFormat.textFormat', { textFormat: { bold: true, fontSize: E.TAM.titulo, foregroundColor: INK } })
  fmt(r(g.fTitulo - 1, g.fTitulo, 5, 6), 'userEnteredFormat.textFormat,userEnteredFormat.horizontalAlignment',
    { textFormat: { fontSize: E.TAM.nota, foregroundColor: MUTED }, horizontalAlignment: 'LEFT' })
  // EL RÓTULO: chico, gris, arriba. LA CIFRA: grande, tinta, abajo. EL CONTEXTO: chico, gris, debajo.
  // Es la forma de una tarjeta en cualquier producto de tesorería, y repetirla cinco veces idénticas
  // es lo que hace que se lean las cinco de un vistazo en vez de leerse de a una.
  fmt(r(g.fRotulos - 1, g.fRotulos), 'userEnteredFormat',
    { numberFormat: { type: 'TEXT' }, textFormat: { bold: true, fontSize: E.TAM.nota, foregroundColor: MUTED }, horizontalAlignment: 'LEFT', verticalAlignment: 'BOTTOM', wrapStrategy: 'CLIP' })
  fmt(r(g.fCifras - 1, g.fCifras), 'userEnteredFormat',
    { numberFormat: E.NUM.moneda, textFormat: { bold: true, fontSize: E.TAM.titular, fontFamily: E.FUENTE_NUM, foregroundColor: INK }, horizontalAlignment: 'LEFT', verticalAlignment: 'MIDDLE', wrapStrategy: 'CLIP' })
  fmt(r(g.fContexto - 1, g.fContexto), 'userEnteredFormat',
    { numberFormat: { type: 'TEXT' }, textFormat: { fontSize: E.TAM.nota, foregroundColor: MUTED }, horizontalAlignment: 'LEFT', verticalAlignment: 'TOP', wrapStrategy: 'CLIP' })
  // EL ACENTO VA EN EL RIESGO DE LIQUIDEZ, que es el número con el que se decide cuánta plata se
  // inmoviliza. "Disponible" y "proyectada" describen la posición; el piso la restringe.
  const colRiesgo = COLS_TARJETA[3]
  fmt(r(g.fCifras - 1, g.fCifras, colRiesgo, colRiesgo + 1), 'userEnteredFormat.textFormat',
    { textFormat: { bold: true, fontSize: E.TAM.titular, fontFamily: E.FUENTE_NUM, foregroundColor: ACENTO } })
  // LA QUINTA TARJETA ES TEXTO ("Esta semana"), no plata: con formato de moneda queda en #VALUE! o se
  // dibuja como "—", que es exactamente el defecto `texto_en_numero` que el auditor de pantalla marca.
  const colCuello = COLS_TARJETA[4]
  fmt(r(g.fCifras - 1, g.fCifras, colCuello, colCuello + 1), 'userEnteredFormat.numberFormat', { numberFormat: { type: 'TEXT' } })
  for (const c of COLS_TARJETA) {
    for (const f of [g.fRotulos, g.fCifras, g.fContexto]) {
      req.push({ mergeCells: { range: r(f - 1, f, c, c + 2), mergeType: 'MERGE_ROWS' } })
    }
  }
  const alto = (fila, px) => req.push({ updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: fila - 1, endIndex: fila }, properties: { pixelSize: px }, fields: 'pixelSize' } })
  alto(g.fRotulos, 24)
  alto(g.fCifras, 40)
  alto(g.fContexto, 20)

  // ── TÍTULOS DE BLOQUE Y ENCABEZADOS ─────────────────────────────────────────────────────────────
  //
  // Los dos paneles viven en las mismas filas, así que el título y el encabezado se pintan por TRAMO
  // de columnas y no por fila entera: pintar la fila entera le daría al panel derecho el borde del
  // izquierdo aunque ahí no empiece nada.
  const PANELES = [[0, 4], [5, ANCHO - 1]]
  for (const f of [g.fBloques12, g.fBloques34]) {
    fmt(r(f - 1, f), 'userEnteredFormat.numberFormat', { numberFormat: { type: 'TEXT' } })
    for (const [c0, c1] of PANELES) {
      if (!esTituloDeBloque(g.filas[f - 1]?.[c0])) continue
      fmt(r(f - 1, f, c0, c1), 'userEnteredFormat',
        { textFormat: { bold: true, fontFamily: E.FUENTE, fontSize: E.TAM.cuerpo, foregroundColor: INK }, horizontalAlignment: 'LEFT', wrapStrategy: 'CLIP' })
      borde(r(f - 1, f, c0, c1))
    }
  }
  fmt(r(g.fCab - 1, g.fCab), 'userEnteredFormat.numberFormat', { numberFormat: { type: 'TEXT' } })
  fmt(r(g.fCab - 1, g.fCab), 'userEnteredFormat.textFormat,userEnteredFormat.horizontalAlignment,userEnteredFormat.wrapStrategy',
    { textFormat: { bold: true, foregroundColor: MUTED, fontSize: E.TAM.nota }, horizontalAlignment: 'LEFT', wrapStrategy: 'CLIP' })
  for (const c of [...COLS_PLATA, ...COLS_FECHA]) {
    fmt(r(g.fCab - 1, g.fCab, c, c + 1), 'userEnteredFormat.horizontalAlignment', { horizontalAlignment: 'RIGHT' })
  }
  for (const [c0, c1] of PANELES) borde(r(g.fCab - 1, g.fCab, c0, c1))

  // Las filas de cierre van RULADAS, no rellenas de color: una hairline arriba y la cifra en acento.
  // Es como un estado financiero cierra un total, no como una planilla lo pinta.
  for (const [c0, c1] of PANELES) {
    fmt(r(g.fCierre - 1, g.fCierre, c0, c1), 'userEnteredFormat.textFormat,userEnteredFormat.backgroundColor',
      { textFormat: { bold: true, foregroundColor: ACENTO }, backgroundColor: { red: 1, green: 1, blue: 1 } })
    borde(r(g.fCierre - 1, g.fCierre, c0, c1), { top: true, bottom: true })
  }

  // ── LAS REGLAS CONDICIONALES ────────────────────────────────────────────────────────────────────
  //
  // `addConditionalFormatRule` se comporta igual que `addChart`: SIEMPRE agrega. Con el timer cada dos
  // horas eso son doce reglas por día sobre el mismo rango, invisibles en la pestaña y acumulándose en
  // el archivo. Y la primera que coincide GANA, así que la que quedó de un diseño viejo puede seguir
  // pintando algo que ya no significa nada — que es exactamente lo que pasó: el titular del piso
  // apareció con fondo rosa de una regla de una versión anterior.
  //
  // Se borran TODAS las de CAJA y se vuelven a poner las cuatro que esta pestaña usa. Es legítimo acá
  // y no en cualquier pestaña: CAJA es íntegramente generada y sus únicas celdas de captura son las
  // dos del arqueo, que no llevan regla condicional. Se borran de atrás para adelante porque
  // `deleteConditionalFormatRule` reindexa las que quedan.
  const nReglas = (await google.getConditionalFormats(ID).catch(() => []))
    .find((h) => h.sheetId === sheetId)?.reglas ?? 0
  for (let i = nReglas - 1; i >= 0; i--) req.push({ deleteConditionalFormatRule: { sheetId, index: i } })
  if (nReglas) console.log(`  🧹 ${nReglas} regla(s) condicional(es) viejas borradas antes de poner las propias`)

  const regla = (rule) => req.push({ addConditionalFormatRule: { index: 0, rule } })
  // UN SALDO VIEJO SE VE VIEJO. El dato importa —el extracto en dólares llegó a tener catorce días—
  // pero ya está en la fecha de al lado: alcanza con que se vea distinta. No gasta ninguna columna y,
  // a diferencia de un texto, no se desactualiza si nadie corre el generador.
  regla({
    ranges: [r(g.d0 - 1, g.d1, 3, 4)],
    booleanRule: {
      condition: { type: 'DATE_BEFORE', values: [{ relativeDate: 'PAST_WEEK' }] },
      format: { textFormat: { foregroundColor: { red: 0.72, green: 0.42, blue: 0.05 }, bold: true } },
    },
  })
  // EL ROJO ES SÓLO PARA RIESGO REAL, y por eso se ata al TEXTO de la alerta y no a un rango: la
  // misma celda dice "⚠ …" o "· sin alertas" según el día, y el color tiene que seguir al contenido.
  for (const [marca, color] of [[MARCA_ALERTA, ROJO], [MARCA_OK, VERDE]]) {
    regla({
      ranges: [r(g.fAviso0 - 1, g.fAviso1, 0, 1), r(g.fAviso0 - 1, g.fAviso1, 5, 6)],
      booleanRule: {
        condition: { type: 'TEXT_STARTS_WITH', values: [{ userEnteredValue: marca }] },
        format: { textFormat: { foregroundColor: color, bold: marca === MARCA_ALERTA } },
      },
    })
  }
  // EL TRAMO DEL CUELLO DE BOTELLA, RESALTADO. Es el renglón que la tarjeta nombra: sin marcarlo hay
  // que recorrer la columna comparando seis números para encontrar cuál es el mínimo.
  regla({
    ranges: [r(g.lad0 - 1, g.lad1, 5, ANCHO - 1)],
    booleanRule: {
      condition: { type: 'CUSTOM_FORMULA', values: [{ userEnteredValue: `=$I${g.lad0}=MIN($I$${g.lad0}:$I$${g.lad1})` }] },
      format: { backgroundColor: { red: 0.94, green: 0.96, blue: 0.98 }, textFormat: { bold: true } },
    },
  })

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
  //
  // LAS SERIES SE UBICAN POR RÓTULO EN EL ANEXO, no por número de fila: el anexo crece con cada
  // control nuevo y un rango de gráfico mal apuntado dibuja una curva perfecta de datos equivocados.
  const colA = await google.readSheetValues(ID, `${PESTANA_ANEXO}!A1:A600`).catch((e) => {
    console.warn(`  ⚠ no pude leer los rótulos de ${PESTANA_ANEXO} (${e.message}): no dibujo los gráficos`)
    return null
  })
  if (!colA) return
  const charts = await requestsDeGraficos(google, ID, sheetId, anexo?.sheetId, ubicarSeries(colA))
  if (!charts.length) return
  await google.spreadsheetBatchUpdate(ID, charts)
    .then(() => console.log(`  📊 ${charts.filter((c) => c.addChart).length} gráfico(s) dibujados`))
    .catch((e) => console.warn(`  ⚠ NO pude dibujar los gráficos (${e.message}). La tabla quedó bien: el gráfico la resume, no la reemplaza.`))
}

// ═══ SÓLO ESCRIBE SI SE LO CORRE A PROPÓSITO ═══
//
// Antes `main()` se ejecutaba con el solo hecho de IMPORTAR el archivo: cualquier test que importara
// `grilla` habría reescrito la pestaña real. En un proyecto que ya perdió trabajo del dueño siete
// veces eso no es un detalle de estilo.
if (import.meta.url === `file://${process.argv[1]}`) {
  main()
    .catch((e) => { console.error('ERROR:', e.message); process.exitCode = 1 })
    .finally(async () => { await import('../lib/db.mjs').then((m) => m.closePool()).catch(() => {}) })
}
