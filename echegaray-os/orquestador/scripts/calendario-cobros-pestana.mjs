#!/usr/bin/env node
// `Calendario de Cobros` — EL ESCRITOR.
//
// Publica en el Sheet 'Flujo de Caja - Cash Flow' el cuadro de CUÁNDO entra cada peso: una fila por
// cliente con su plata repartida por mes, y debajo cada hito de Cobranzas con su fecha. El porqué del
// diseño vive en `lib/calendario-cobros.mjs`; acá viven las guardas y la verificación contra el
// archivo vivo.
//
// EL DEFECTO ES NO ESCRIBIR. Sin `--escribir` la corrida es un ensayo: resuelve las columnas reales
// por rótulo, lee Cobranzas, arma la grilla y muestra el resumen — y no toca el archivo. Este repo ya
// pagó seis pérdidas del trabajo del dueño por escrituras que "sólo probaban".
//
//   node orquestador/scripts/calendario-cobros-pestana.mjs --dry       # en seco, offline
//   node orquestador/scripts/calendario-cobros-pestana.mjs             # ensayo contra el archivo
//   node orquestador/scripts/calendario-cobros-pestana.mjs --escribir  # publica

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import * as E from '../lib/estilo-pestana.mjs'
import { MONEDA_CUERPO, MONEDA_TOTAL } from '../lib/formato-statement.mjs'
import { hallarPestana } from '../lib/sheet-pestanas.mjs'
import { escribirPreservando, VACIO } from '../lib/preservar-anotaciones.mjs'
import { conEdicionesRespetadas, guardarRegistro } from '../lib/respetar-ediciones.mjs'
import { celdasEnError, problemaDeSintaxis, clientesDeCobranzas, anchoColumnaA, ANO } from '../lib/obras-grilla.mjs'
import {
  grillaCalendario, ventanaDeMeses, inicioDeVentana, conColaLimpiable, columnasProyectadas,
  formatoDeEncabezado, ANCHO_HISTORICO, ALTO_HISTORICO, PESTANA_CALENDARIO, REFS_CALENDARIO,
} from '../lib/calendario-cobros.mjs'
import { ALERTA } from '../lib/glifos.mjs'
import { hitosPendientes, finDeObraPorFila } from '../lib/calendario-hitos.mjs'
import { monedasDesconocidas } from '../lib/cobranzas-contrato.mjs'
import { leerTipoCambio, RANGO_TC } from '../lib/tipo-cambio.mjs'
import { evaluarFormula, hojaDeGrilla } from '../lib/evaluar-formula-sheet.mjs'
import { OBRAS_FUTURAS } from '../lib/obras-datos.mjs'
import { resolverColumnas, letra, indiceDeLetra, ROTULOS_COBRANZAS } from './obras-pestana.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const ESCRIBIR = process.argv.includes('--escribir')
const DRY = process.argv.includes('--dry')

/** Los rótulos de Cobranzas: los mismos que OBRAS más "Notas", que acá identifica el cheque endosado.
 *  Se resuelven por RÓTULO y la corrida ROMPE si falta alguno — nunca por letra fija. */
export const ROTULOS_CAL = { ...ROTULOS_COBRANZAS, notas: /^Notas$/i }

/** La fecha de corrida, en ISO. Inyectable por env para poder probar el borde del año sin esperarlo. */
export const hoyISO = () => process.env.ORQ_HOY || new Date().toISOString().slice(0, 10)

/**
 * LO QUE SE IMPRIME EN EL ENSAYO: la grilla celda por celda y las fórmulas completas.
 *
 * Las fórmulas van COMPLETAS y no recortadas: lo que hay que revisar es justamente lo que se cortaría
 * —el separador `;`, el rango, el cliente por el que filtra—.
 */
export function render(g, valores = null) {
  const L = []
  const anchoCol = 15
  const $ = (v) => (Number.isFinite(v) && v !== 0 ? Math.round(v).toLocaleString('es-AR') : (v === 0 ? '—' : 'ƒ'))
  L.push(`${PESTANA_CALENDARIO} · ${g.filas.length} filas × ${g.ancho} columnas · ${g.meses.length} mes(es): `
    + g.meses.map((m) => m.rotulo).join(' '))
  L.push(`protagonistas (clientes): ${g.protagonistas.join(', ')} · detalles (hitos): ${g.detalles.length} · total: fila ${g.fTotal}`)
  L.push('')
  const visible = new Map(g.rotulos.map((r) => [r.fila, r.texto]))
  // EL ENSAYO MUESTRA EL MES, NO SU SERIAL. El encabezado se escribe como fecha (ver
  // `formatoDeEncabezado`); imprimir "46235" obligaría a hacer la cuenta a mano para saber qué mes es
  // esa columna — y el ensayo existe justamente para poder juzgar sin abrir la pestaña.
  const rotuloDeMes = new Map((g.meses ?? []).map((m) => [m.desde, m.rotulo]))
  const formulas = []
  for (const [i, fila] of g.filas.entries()) {
    const n = i + 1
    const celdas = fila.map((v, c) => {
      if (v === VACIO || v === '' || v === undefined || v === null) return ''.padStart(c === 0 ? 0 : anchoCol)
      if (typeof v === 'string' && v.startsWith('=')) {
        formulas.push(`${letra(c)}${n}  ${v}`)
        if (c === 0) return visible.get(n) ?? 'ƒ'
        return (valores ? $(valores[n - 1]?.[c]) : 'ƒ').padStart(anchoCol)
      }
      if (rotuloDeMes.has(v)) return String(rotuloDeMes.get(v)).padStart(anchoCol)
      return c === 0 ? String(v) : String(v).padStart(anchoCol)
    })
    L.push(`${String(n).padStart(3)} │ ${celdas[0].padEnd(56)}│${celdas.slice(1).join('│')}`)
  }
  L.push('')
  L.push(`── LAS ${formulas.length} FÓRMULAS ──`)
  L.push(...formulas)
  return L.join('\n')
}

/**
 * LOS NÚMEROS QUE VA A PUBLICAR, CALCULADOS EN FRÍO — sin escribir una celda.
 *
 * POR QUÉ EXISTE (13/08). La regla de la casa es MIRAR la pestaña antes de darla por buena, y
 * `ver-pestana.mjs` exporta el PDF de una pestaña que ya existe. Con una pestaña NUEVA eso es
 * circular: habría que escribirla en el archivo del dueño para poder juzgar si conviene escribirla.
 *
 * `evaluar-formula-sheet.mjs` corre las mismas fórmulas sobre los datos REALES ya leídos, así que el
 * ensayo muestra los importes de verdad. No reemplaza al PDF —no dice nada del formato, ni de si un
 * texto se corta— y por eso el ensayo lo declara: prueba los NÚMEROS, no la pantalla.
 */
export function valoresEnFrio(g, filasCobranzas, refs, tc, hoy) {
  const hoja = {}
  for (const [i, fila] of (filasCobranzas ?? []).entries()) {
    const n = refs.cob.desde + i
    for (const [campo, col] of Object.entries(refs.cob)) {
      if (['hoja', 'desde'].includes(campo)) continue
      const v = fila?.[indiceDeLetra(col)]
      if (v !== '' && v !== undefined && v !== null) hoja[`${col}${n}`] = v
    }
  }
  const ctx = { hoja: hojaDeGrilla(g.filas), hojas: { [refs.cob.hoja]: hoja }, nombres: { [RANGO_TC]: tc }, hoy }
  return g.filas.map((fila) => fila.map((v) => {
    if (typeof v !== 'string' || !v.startsWith('=')) return null
    try { return Number(evaluarFormula(v, ctx)) } catch { return NaN }
  }))
}

/**
 * EL CUADRE CONTRA `Resta` DE OBRAS — el control que prueba que el calendario no perdió plata.
 *
 * QUÉ COMPARA: el total del calendario (vencido + los meses) contra lo que OBRAS publica como Resta
 * del año. Son dos caminos al mismo hecho —"lo que falta cobrar"— y por eso el control vale: OBRAS lo
 * calcula como `todo lo no cancelado − lo cobrado`, y el calendario como `la suma de cada mes`. Si
 * difieren, un cobro se cayó de la ventana o se contó dos veces.
 *
 * ⚠ Se compara contra la Sección 1 (el total del AÑO) y no contra el cierre de la Sección 2: la
 * Sección 2 sólo suma las 7 obras declaradas y deja afuera $54,6M de trabajos que no son obra. Ese
 * es, justamente, uno de los motivos por los que este calendario existe.
 *
 * @returns {string|null} el motivo, o null si cierra.
 */
export function cuadraContraResta(totalCalendario, restaObras, tolerancia = 1) {
  const dif = Math.round((Number(totalCalendario) - Number(restaObras)) * 100) / 100
  if (Math.abs(dif) <= tolerancia) return null
  const $ = (n) => `$${Math.round(n).toLocaleString('es-AR')}`
  return `el calendario suma ${$(totalCalendario)} por cobrar y OBRAS publica ${$(restaObras)} de Resta: `
    + `difieren ${$(dif)}. O un cobro quedó fuera de la ventana de meses, o se está contando dos veces. NO publico un calendario que no cierra.`
}

/**
 * LA COLUMNA MÁS A LA DERECHA DE TODAS LAS QUE ESTE CUADRO CITA.
 *
 * Es el tope de la lectura de Cobranzas, y se DERIVA de las columnas ya resueltas en vez de
 * escribirse a mano. Una letra elegida a mano queda vieja en silencio la próxima vez que el cuadro
 * cite una columna más a la derecha — y el modo de falla no es un error: es una guarda que deja de
 * ver lo que tenía que vigilar. Ver el comentario del rango en `main`.
 */
export function topeDeLectura(cob = {}) {
  const cols = Object.entries(cob).filter(([k]) => !['hoja', 'desde'].includes(k)).map(([, v]) => v)
  if (!cols.length) throw new Error('calendario-cobros: no hay ni una columna resuelta para calcular el tope de lectura')
  return cols.reduce((a, b) => (indiceDeLetra(b) > indiceDeLetra(a) ? b : a))
}

/** Las columnas resueltas contra los encabezados VIVOS de Cobranzas. */
async function refsReales(google) {
  const cab = await google.readSheetValues(ID, `${REFS_CALENDARIO.hoja}!A1:AB8`)
  return { cob: { hoja: REFS_CALENDARIO.hoja, ...resolverColumnas(cab, ROTULOS_CAL) } }
}

async function main() {
  if (DRY && ESCRIBIR) throw new Error('--dry y --escribir son incompatibles: elegí uno.')
  const hoy = hoyISO()
  const meses = ventanaDeMeses(hoy)
  if (!meses.length) {
    throw new Error(`hoy es ${hoy} y la pestaña declara el año ${ANO}: no queda ni un mes por delante. `
      + 'Publicar un calendario vacío con cara de vigente es peor que no publicarlo — subí ANO.')
  }

  if (DRY) {
    // EN SECO NO SE ABRE CLIENTE NI SE LEE NADA. Un ensayo en seco que toca el archivo no sirve para
    // decidir si tocar el archivo: este repo ya llevó dos pestañas reales a otro tamaño desde un
    // worktree por un `--dry` que cortaba tarde.
    const g = grillaCalendario({ clientes: ['(cliente de muestra)'], hitos: [], meses })
    return console.log(render(g))
  }

  const google = ESCRIBIR ? makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES }) : makeGoogleClient({})
  const refs = await refsReales(google)
  console.log(`columnas resueltas por rótulo · ${refs.cob.hoja}: `
    + Object.entries(refs.cob).filter(([k]) => !['hoja', 'desde'].includes(k)).map(([k, v]) => `${k}=${v}`).join(' ')
    + ` (desde ${refs.cob.desde})`)

  // ═══ SE LEE HASTA LA COLUMNA MÁS A LA DERECHA QUE SE CITA, Y SE CALCULA — NO SE ELIGE A MANO ═══
  //
  // ACÁ HUBO UN DEFECTO Y VALE DEJARLO ESCRITO. El rango decía `A5:${refs.cob.notas}`, o sea hasta la
  // W, porque "Notas" era la columna nueva de este cuadro. Pero la MONEDA vive en la AA, cuatro
  // columnas más a la derecha: la lectura la cortaba y `monedasDesconocidas` recorría una columna que
  // siempre llegaba vacía. La guarda que existe para que un "EUR" no se sume como pesos quedaba
  // ciega, y no daba error: devolvía cero problemas, que es exactamente lo que devuelve cuando todo
  // está bien. Lo destapó el cálculo en frío, donde Quattropani publicaba $72,8M cobrados contra los
  // $95,8M de OBRAS — los $22,9M del anticipo en dólares.
  //
  // El tope se DERIVA de las columnas resueltas. Elegir una a mano es volver a olvidarse la próxima
  // vez que este cuadro cite una columna nueva.
  const tope = topeDeLectura(refs.cob)
  const datos = await google.readSheetValues(ID, `${refs.cob.hoja}!A${refs.cob.desde}:${tope}`,
    { render: 'UNFORMATTED_VALUE' }) ?? []
  const cols = Object.fromEntries(Object.entries(refs.cob)
    .filter(([k]) => !['hoja', 'desde'].includes(k)).map(([k, v]) => [k, indiceDeLetra(v)]))

  // ═══ LAS MISMAS DOS GUARDAS DE MONEDA QUE OBRAS, Y POR EL MISMO MOTIVO: la pestaña suma pesos ═══
  const raras = monedasDesconocidas(datos, cols.moneda, refs.cob.desde)
  if (raras.length) {
    throw new Error(`${raras.length} fila(s) de ${refs.cob.hoja} declaran una moneda que no entiendo: `
      + `${raras.slice(0, 6).map((m) => `fila ${m.fila}="${m.valor}"`).join(' · ')}. Se sumarían como PESOS sin dar error. NO escribo.`)
  }
  const { tc } = await leerTipoCambio(google, ID)
  if (tc === null) {
    throw new Error(`el rango con nombre ${RANGO_TC} no trae un tipo de cambio. TODA suma de esta pestaña lo cita: `
      + 'sin él las celdas de plata quedarían en #NAME?/#VALUE!. NO escribo.')
  }

  const clientes = clientesDeCobranzas(datos.map((f) => f?.[cols.cliente]))
  if (!clientes.length) throw new Error(`no leí un solo cliente en ${refs.cob.hoja}: NO escribo un calendario vacío.`)

  const finPorFila = finDeObraPorFila(datos, cols, OBRAS_FUTURAS)
  const { hitos, problemas } = hitosPendientes(datos, cols, {
    desde: refs.cob.desde, meses, inicioVentana: inicioDeVentana(meses), finPorFila, ano: ANO,
  })
  // FAIL-CLOSED. Un hito sin columna donde caer no se publica "igual": se detiene la corrida. Publicar
  // el resto dejaría un calendario que no cuadra contra OBRAS y nadie sabría por cuál fila.
  if (problemas.length) {
    throw new Error(`${problemas.length} cobranza(s) pendiente(s) no tienen dónde caer en el calendario:\n`
      + problemas.map((p) => `  · ${p}`).join('\n') + '\nNO escribo: corregilas en Cobranzas y volvé a correr.')
  }
  if (!hitos.length) throw new Error('no hay una sola cobranza pendiente: NO escribo un calendario sin nada que anunciar.')

  const marcadas = hitos.filter((h) => h.finObra && h.textoVisible.includes(`${ALERTA} fin`))
  console.log(`${hitos.length} hitos pendientes · ${clientes.length} clientes · ventana ${meses[0].rotulo}…${meses.at(-1).rotulo}`
    + ` · ${hitos.filter((h) => h.vencido).length} vencido(s) · ${marcadas.length} con cobro posterior al fin de su obra`)
  for (const h of marcadas) console.log(`  ⚠ fila ${h.fila} · ${h.cliente} · ${h.concepto} — cobro después del fin de obra (${h.finObra})`)

  const g = grillaCalendario({ clientes, hitos, meses, refs })
  const rotas = g.filas.flatMap((fila, i) => fila
    .map((v, c) => (typeof v === 'string' && v.startsWith('=') ? [`${letra(c)}${i + 1}`, problemaDeSintaxis(v)] : null))
    .filter((x) => x && x[1]))
  if (rotas.length) {
    throw new Error(`${rotas.length} fórmula(s) no parsean y Sheets las publicaría como #ERROR!: `
      + `${rotas.slice(0, 5).map(([ref, why]) => `${ref} (${why})`).join(' · ')}. NO escribo.`)
  }
  // LOS NÚMEROS DE VERDAD, ANTES DE ESCRIBIR NADA. Ver `valoresEnFrio`: prueban los importes, no la
  // pantalla — el formato sólo lo desmiente el PDF, y ése sólo existe una vez publicada la pestaña.
  const valores = valoresEnFrio(g, datos, refs, tc, new Date(`${hoy}T12:00:00Z`))
  console.log(render(g, valores))
  const totalCal = valores[g.fTotal - 1]?.[g.iTotal]
  console.log(`\n⇒ por cobrar, calculado en frío: $${Math.round(totalCal).toLocaleString('es-AR')}`
    + ` · ya cobrado ${ANO}: $${Math.round(valores[g.fTotal - 1]?.[1]).toLocaleString('es-AR')}`
    + ` · de eso, endosado: $${Math.round(valores[g.fTotal - 1]?.[2]).toLocaleString('es-AR')}`)
  if (!ESCRIBIR) return console.log('ENSAYO (sin --escribir): no escribí nada.')

  await publicar(google, g)
}

/** LA ESCRITURA, con las mismas defensas que el resto del archivo: preservar lo editado, limpiar la
 *  cola en los dos ejes, releer lo que Sheets EVALUÓ y cuadrar contra OBRAS antes de dar por buena. */
async function publicar(google, g) {
  const hojas = await google.getSheetMeta(ID)
  let hoja = hojas.find((h) => h.title === PESTANA_CALENDARIO)
  if (!hoja) {
    await google.spreadsheetBatchUpdate(ID, [{
      addSheet: { properties: { title: PESTANA_CALENDARIO, gridProperties: { rowCount: ALTO_HISTORICO + 20, columnCount: ANCHO_HISTORICO, frozenRowCount: 4 } } },
    }])
    hoja = hallarPestana(await google.getSheetMeta(ID), PESTANA_CALENDARIO)
    console.log(`  ✚ creé la pestaña ${PESTANA_CALENDARIO}`)
  }
  const alto = Math.max(ALTO_HISTORICO + 20, hoja.rows ?? 0)
  if ((hoja.rows ?? 0) < alto) {
    await google.spreadsheetBatchUpdate(ID, [{
      updateSheetProperties: { properties: { sheetId: hoja.sheetId, gridProperties: { rowCount: alto } }, fields: 'gridProperties.rowCount' },
    }])
  }
  const actual = await google.readSheetValues(ID, `${PESTANA_CALENDARIO}!A1:${letra(ANCHO_HISTORICO - 1)}`).catch((e) => {
    throw new Error(`no pude leer "${PESTANA_CALENDARIO}" (${e.message}). NO escribo.`)
  })
  const { grid, respetadas, ediciones, candidatos } = await conEdicionesRespetadas(ID, PESTANA_CALENDARIO, g.filas, actual)
  g.filas = grid
  for (const r of respetadas) console.log(`  ✋ respeto tu texto ("${r.suyo.slice(0, 44)}")`)
  const filasEmitidas = g.filas.length
  g.filas = conColaLimpiable(g.filas, ANCHO_HISTORICO, ALTO_HISTORICO)
  const escritura = await escribirPreservando(google, ID, PESTANA_CALENDARIO, g.filas,
    { anchoHoja: Math.max(ANCHO_HISTORICO, hoja.cols ?? ANCHO_HISTORICO) })
  if (escritura?.bloqueada || escritura?.editadaPorHumano) {
    return console.log(`  🔒 "${PESTANA_CALENDARIO}" bajo tu control: no escribí, NO le toco el formato.`)
  }
  await formatear(google, hoja.sheetId, g)

  const quedo = await google.readSheetValues(ID, `${PESTANA_CALENDARIO}!A1:${letra(ANCHO_HISTORICO - 1)}${g.filas.length}`).catch(() => [])
  await guardarRegistro(ID, PESTANA_CALENDARIO, g.filas, ediciones, quedo, candidatos)
    .catch((e) => console.warn(`  ⚠ no pude guardar el registro de rótulos: ${e.message}`))
  if (!quedo.length) throw new Error('escribí pero no pude releer la pestaña: no puedo afirmar que quedó sana.')
  const enError = celdasEnError(quedo)
  if (enError.length) {
    throw new Error(`QUEDÓ PUBLICADO CON ${enError.length} CELDA(S) EN ERROR: `
      + `${enError.slice(0, 8).map((x) => `${x.ref}=${x.valor}`).join(' · ')}.\n`
      + `Volvé atrás con Archivo → Historial de versiones y corregí antes de creerle a la pestaña.`)
  }

  // ═══ EL CUADRE, CONTRA LO PUBLICADO Y NO CONTRA LO QUE YO CREO HABER ESCRITO ═══
  const num = (v) => Number(String(v ?? '').replace(/[^\d,-]/g, '').replace(/\./g, '').replace(',', '.')) || 0
  const totalCal = num(quedo[g.fTotal - 1]?.[g.iTotal])
  const obras = await google.readSheetValues(ID, 'OBRAS!A1:I70').catch(() => [])
  const filaTot = obras.findIndex((f) => String(f?.[0] ?? '').startsWith('⇒ TOTAL'))
  if (filaTot < 0) {
    console.warn('  ⚠ no encontré la fila "⇒ TOTAL" de OBRAS: publiqué el calendario pero NO pude cuadrarlo contra su Resta.')
  } else {
    const problema = cuadraContraResta(totalCal, num(obras[filaTot]?.[4]))
    if (problema) throw new Error(`EL CALENDARIO NO CUADRA: ${problema}`)
    console.log(`  ✓ cuadra: $${Math.round(totalCal).toLocaleString('es-AR')} por cobrar, el mismo número que la Resta de OBRAS`)
  }
  console.log(`QUEDÓ ESCRITO — releí ${quedo.length} filas (${filasEmitidas} con contenido): sin celdas en error y cuadrado.`)
}

/** EL FORMATO. Mismo lenguaje que OBRAS y CAJA, y una sola cosa propia: lo REAL en negrita tinta
 *  plena y lo PROYECTADO en itálica apagada, por COLUMNA — la notación de "Jornales por Quincena". */
async function formatear(google, sheetId, g) {
  const n = g.filas.length
  const r = (r0, r1, c0 = 0, c1 = g.ancho) => ({ sheetId, startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1 })
  const req = [
    { unmergeCells: { range: r(0, Math.max(n, 40)) } },
    E.reset(sheetId, Math.max(n + 20, 120), ANCHO_HISTORICO),
    { updateSheetProperties: { properties: { sheetId, gridProperties: { hideGridlines: true, frozenRowCount: 4, frozenColumnCount: 1 } }, fields: 'gridProperties.hideGridlines,gridProperties.frozenRowCount,gridProperties.frozenColumnCount' } },
  ]
  const INK = { red: 0.10, green: 0.13, blue: 0.20 }
  const MUTED = { red: 0.53, green: 0.52, blue: 0.49 }
  const HAIR = { red: 0.82, green: 0.80, blue: 0.76 }
  const fmt = (rg, fields, format) => req.push({ repeatCell: { range: rg, cell: { userEnteredFormat: E.conFuente(format) }, fields } })

  for (let c = 1; c < g.ancho; c++) {
    fmt(r(0, n, c, c + 1), 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment',
      { numberFormat: MONEDA_CUERPO, horizontalAlignment: 'RIGHT' })
  }
  for (const f of [...g.totales, ...g.protagonistas]) {
    for (let c = 1; c < g.ancho; c++) fmt(r(f - 1, f, c, c + 1), 'userEnteredFormat.numberFormat', { numberFormat: MONEDA_TOTAL })
  }
  fmt(r(0, 1), 'userEnteredFormat.textFormat', { textFormat: { bold: true, fontSize: E.TAM.titulo } })
  fmt(r(1, 2), 'userEnteredFormat.textFormat,userEnteredFormat.wrapStrategy',
    { textFormat: { italic: true, fontSize: E.TAM.nota, foregroundColor: E.COLOR.nota }, wrapStrategy: 'WRAP' })
  // EL ENCABEZADO: nunca plata, alineado del lado de sus cifras, y CADA CELDA CON SU FORMATO.
  //
  // Antes iba un solo `TEXT` para la fila entera y ahí estaba el defecto: los meses son un serial, y
  // un serial con formato de texto se dibuja como el número pelado (46260 en vez de ago-26). El plan
  // sale de `formatoDeEncabezado` —la misma función que el test verifica— y no de esta línea.
  const fe = g.fEncabezado
  formatoDeEncabezado(g).forEach((f, c) => fmt(r(fe - 1, fe, c, c + 1), 'userEnteredFormat.numberFormat', f))
  fmt(r(fe - 1, fe), 'userEnteredFormat.textFormat,userEnteredFormat.horizontalAlignment',
    { textFormat: { bold: true, foregroundColor: MUTED, fontSize: E.TAM.nota }, horizontalAlignment: 'RIGHT' })
  fmt(r(fe - 1, fe, 0, 1), 'userEnteredFormat.horizontalAlignment', { horizontalAlignment: 'LEFT' })
  req.push({ updateBorders: { range: r(fe - 1, fe), bottom: { style: 'SOLID', color: HAIR } } })
  for (const f of g.protagonistas) {
    fmt(r(f - 1, f, 0, 1), 'userEnteredFormat.textFormat', { textFormat: { bold: true, fontFamily: E.FUENTE, fontSize: E.TAM.cuerpo, foregroundColor: INK } })
  }
  for (const f of g.detalles) {
    fmt(r(f - 1, f, 0, 1), 'userEnteredFormat.textFormat,userEnteredFormat.numberFormat',
      { textFormat: { fontFamily: E.FUENTE, fontSize: E.TAM.nota, foregroundColor: MUTED }, numberFormat: { type: 'TEXT' } })
  }
  for (const f of g.totales) {
    fmt(r(f - 1, f, 0, 1), 'userEnteredFormat.textFormat', { textFormat: { bold: true, fontFamily: E.FUENTE, fontSize: E.TAM.cuerpo } })
    req.push({ updateBorders: { range: r(f - 1, f), top: { style: 'SOLID', color: HAIR } } })
  }
  // ═══ LO PROYECTADO EN ITÁLICA — la notación de "Jornales por Quincena", no una inventada ═══
  //
  // Va DESPUÉS de todo lo demás y toca SÓLO el campo `italic`: un textFormat completo borraría la
  // negrita que acaban de recibir los clientes y el total. Es la misma trampa de la API que ya dejó
  // 31 celdas en otra tipografía, y la misma solución que usa cash-flow-piel.
  for (const c of columnasProyectadas(g.ancho)) {
    req.push({
      repeatCell: {
        range: r(g.fEncabezado, n, c, c + 1),
        cell: { userEnteredFormat: { textFormat: { italic: true, foregroundColor: MUTED } } },
        fields: 'userEnteredFormat.textFormat.italic,userEnteredFormat.textFormat.foregroundColor',
      },
    })
  }
  const anchoA = anchoColumnaA(g, { minimo: 320 })
  req.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: anchoA }, fields: 'pixelSize' } })
  req.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 1, endIndex: g.ancho }, properties: { pixelSize: 124 }, fields: 'pixelSize' } })
  req.push({ updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 0, endIndex: Math.max(n + 40, 120) }, properties: { hiddenByUser: false }, fields: 'hiddenByUser' } })
  await google.spreadsheetBatchUpdate(ID, req)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main()
    .catch((e) => { console.error('ERROR:', e.message); process.exitCode = 1 })
    .finally(async () => { await import('../lib/db.mjs').then((m) => m.closePool()).catch(() => {}) })
}
