#!/usr/bin/env node
// `OBRAS` — TODAS LAS OBRAS DEL AÑO EN UNA PESTAÑA. EL ESCRITOR.
//
// QUÉ HACE (07/08/2026). Publica la grilla de lib/obras-grilla.mjs en el Sheet 'Flujo de Caja - Cash
// Flow': la Sección 1 (venta/cobrado/pendiente/materiales por cliente, todo fórmula viva) y la
// Sección 2 (las obras de lib/obras-datos.mjs, con los proyectados del dueño como únicos números
// tipeados).
//
// EL DEFECTO ES NO ESCRIBIR. Sin `--escribir`, la corrida es un ensayo: resuelve las columnas reales
// por rótulo, construye la grilla y muestra el resumen — y no toca el archivo. Es la dirección segura
// para equivocarse: este repo ya pagó seis pérdidas del trabajo del dueño por escrituras que
// "solo probaban".
//
// LAS COLUMNAS SE RESUELVEN POR RÓTULO, NUNCA POR LETRA FIJA. Si "Obra / Cliente" se muda de la G a
// la H, la fórmula tiene que mudarse sola; y si un rótulo no está, el script ROMPE en vez de escribir
// fórmulas que suman la columna equivocada sin un solo error.
//
// LOS TRES MODOS, DE MÁS SEGURO A MENOS:
//
//   --dry       EN SECO. No abre cliente de Google, no lee, no escribe: arma la grilla con las
//               columnas por DEFECTO (REFS_OBRAS) y la imprime entera. Sirve para juzgar la FORMA de
//               la pestaña —filas, bloques, fórmulas— sin el archivo delante. Lo que NO prueba: que
//               los rótulos sigan donde estaban. Eso sólo lo dice el ensayo.
//   (sin flags) ENSAYO. Resuelve las columnas contra los encabezados VIVOS y muestra el resumen. Lee,
//               no escribe.
//   --escribir  PUBLICA en el Sheet real.
//
// Por qué `--dry` no toca ni una lectura: este repo ya pagó el caso contrario. Un `--dry` que cortaba
// antes de la grilla pero no antes de agrandar la hoja llevó dos pestañas reales a otro tamaño desde
// un worktree (ver scripts/cash-flow-vistas.test.mjs). Un ensayo en seco que toca el archivo no sirve
// para decidir si tocar el archivo.
//
//   node orquestador/scripts/obras-pestana.mjs --dry      # en seco, imprime la grilla (offline)
//   node orquestador/scripts/obras-pestana.mjs            # ensayo contra el archivo (no escribe)
//   node orquestador/scripts/obras-pestana.mjs --escribir # publica en el Sheet real

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import * as E from '../lib/estilo-pestana.mjs'
import { MONEDA_CUERPO, MONEDA_TOTAL } from '../lib/formato-statement.mjs'
import { hallarPestana } from '../lib/sheet-pestanas.mjs'
import { escribirPreservando, VACIO } from '../lib/preservar-anotaciones.mjs'
import { conEdicionesRespetadas, guardarRegistro } from '../lib/respetar-ediciones.mjs'
import { requestsTextoPorContenido } from '../lib/formato-texto-por-contenido.mjs'
import { grillaObras, anchoColumnaA, ANCHO_OBRAS, ANCHOS_OBRAS, PESTANA_OBRAS, REFS_OBRAS } from '../lib/obras-grilla.mjs'
import { OBRAS_FUTURAS, totalEgresos } from '../lib/obras-datos.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const ESCRIBIR = process.argv.includes('--escribir')
const DRY = process.argv.includes('--dry')

/** La letra de una columna 0-based, tolerante a más de 26 (26 → 'AA'). */
export const letra = (i) => (i < 26 ? '' : String.fromCharCode(64 + Math.floor(i / 26))) + String.fromCharCode(65 + (i % 26))

/**
 * Resuelve las columnas de una pestaña buscando cada RÓTULO en sus primeras filas.
 *
 * `rotulos` mapea campo → criterio: un string exige igualdad exacta (trim), una RegExp prueba.
 * La fila de encabezado es la primera que contiene el rótulo ANCLA (el primero de la lista), y todos
 * los demás se exigen EN ESA MISMA FILA: un "Estado" suelto de otra fila no es el Estado del registro.
 * ROMPE si falta alguno — mejor no escribir que sumar la columna equivocada en silencio.
 */
export function resolverColumnas(filas, rotulos) {
  const entradas = Object.entries(rotulos)
  const matchea = (celda, crit) => {
    const t = String(celda ?? '').trim()
    return crit instanceof RegExp ? crit.test(t) : t === crit
  }
  const [, ancla] = entradas[0]
  const iFila = (filas ?? []).findIndex((f) => (f ?? []).some((c) => matchea(c, ancla)))
  if (iFila < 0) throw new Error(`no encontré el rótulo ancla ${ancla} en las primeras filas`)
  const fila = filas[iFila]
  const res = { desde: iFila + 2 }
  for (const [campo, crit] of entradas) {
    const iCol = fila.findIndex((c) => matchea(c, crit))
    if (iCol < 0) throw new Error(`el rótulo ${crit} (campo "${campo}") no está en la fila de encabezado ${iFila + 1}`)
    res[campo] = letra(iCol)
  }
  return res
}

const COLS = 'ABCDEFGHI'
const cortar = (s, n) => (s.length <= n ? s : `${s.slice(0, n - 1)}…`)
const izq = (s, n) => cortar(s, n).padEnd(n)
const der = (s, n) => cortar(s, n).padStart(n)

/**
 * Lo que una celda MUESTRA en el ensayo.
 *
 * El centinela `VACIO` se dibuja vacío a propósito: significa "esta celda es mía y va vacía", no es un
 * dato — mostrarlo como texto haría leer la grilla como si tuviera contenido donde no lo tiene.
 */
export function celdaTexto(v) {
  if (v === VACIO || v === undefined || v === null || v === '') return ''
  if (typeof v === 'number') return v.toLocaleString('es-AR')
  return String(v)
}

/**
 * LA GRILLA IMPRESA, PARA JUZGARLA SIN ABRIR EL SHEET.
 *
 * Tres partes: el resumen, la anatomía de cada obra (dónde está la protagonista, qué filas suma y
 * cuál queda AFUERA por ser máquina propia) y la grilla celda por celda. Las fórmulas van marcadas
 * con `ƒ` en la grilla y COMPLETAS al final, con su referencia: recortarlas en la tabla escondería
 * justo lo que hay que revisar (el separador `;`, el rango, el cliente por el que filtra).
 */
export function render(g, obras = []) {
  const L = []
  const proyectado = obras.reduce((s, o) => s + totalEgresos(o), 0)
  L.push(`${PESTANA_OBRAS} — ENSAYO EN SECO. Columnas por DEFECTO (REFS_OBRAS), no las del archivo vivo:`)
  L.push('esto verifica la FORMA de la grilla; que los rótulos sigan en su lugar lo dice el ensayo sin --dry.')
  L.push('')
  L.push(`${g.filas.length} filas × ${ANCHO_OBRAS} columnas · ${obras.length} obras · ${g.tipeadas.length} celdas tipeadas`
    + ` · $${Math.round(proyectado).toLocaleString('es-AR')} proyectados de caja`)
  L.push('')
  L.push('LAS OBRAS QUE SALEN')
  // El ancho sale de los rótulos, no de un número elegido a ojo: con 50 fijos "Quattropani - Melisa
  // García SAS — SALÓN COMERCIAL" se cortaba, y ésta es justo la lista que existe para decir QUÉ obras
  // salen. Una evidencia que recorta el nombre de la obra no es evidencia de esa obra.
  const anchoRotulo = Math.max(0, ...(g.bloques ?? []).map((b) => String(g.filas[b.fProt - 1]?.[0] ?? '').length))
  for (const b of g.bloques ?? []) {
    L.push(`  fila ${String(b.fProt).padStart(3)}  ${izq(String(g.filas[b.fProt - 1]?.[0] ?? ''), anchoRotulo)}`
      + `  detalle ${b.fDetalle[0]}–${b.fDetalle[1]} · MO ${b.fMO}`
      + `${b.fNoCaja ? ` · no-caja ${b.fNoCaja} (FUERA de las sumas)` : ''}`
      + `${b.proyectable ? '' : ' · ⚠ sin fechas, no se proyecta'}`)
  }
  L.push('')
  L.push('GRILLA  (ƒ = fórmula, texto completo abajo)')
  const anchos = [44, 3, 11, 11, 11, 11, 11, 7]
  L.push(`fila │ ${anchos.map((n, i) => izq(COLS[i], n)).join(' │ ')} │ I (prosa)`)
  const formulas = []
  g.filas.forEach((fila, i) => {
    const celdas = fila.map((v, c) => {
      const t = celdaTexto(v)
      if (!t.startsWith('=')) return t
      formulas.push([`${COLS[c]}${i + 1}`, t])
      return 'ƒ'
    })
    const cuerpo = anchos.map((n, c) => (c === 0 || c === 1 ? izq(celdas[c], n) : der(celdas[c], n))).join(' │ ')
    L.push(`${String(i + 1).padStart(4)} │ ${cuerpo} │ ${cortar(celdas[8] ?? '', 78)}`)
  })
  L.push('')
  L.push(`FÓRMULAS (${formulas.length})`)
  for (const [ref, f] of formulas) L.push(`  ${ref.padEnd(5)} ${f}`)
  return L.join('\n')
}

/** Las referencias REALES del archivo, resueltas por rótulo contra los encabezados vivos. */
async function refsReales(google) {
  const [cob, cmp, matColA] = await Promise.all([
    google.readSheetValues(ID, `${REFS_OBRAS.cob.hoja}!A1:AB8`),
    google.readSheetValues(ID, `${REFS_OBRAS.cmp.hoja}!A1:AJ8`),
    google.readSheetValues(ID, `${REFS_OBRAS.mat.hoja}!A1:A100`),
  ])
  const refs = {
    cob: {
      hoja: REFS_OBRAS.cob.hoja,
      // `neto` es la columna del IVA hacia abajo: la venta y el margen se miden ahí, no en el total.
      // `forma` y `fechaCobro` son lo que el dueño pidió ver por obra (a quién reclamarle y cuándo).
      ...resolverColumnas(cob, {
        cliente: 'Obra / Cliente', concepto: 'Concepto', neto: /^Monto neto/i,
        total: /^TOTAL a cobrar/, forma: /^Forma de [Cc]obro/, estado: 'Estado', fechaCobro: /^Fecha de cobro|^Fecha cobro/i,
      }),
    },
    cmp: {
      hoja: REFS_OBRAS.cmp.hoja,
      ...resolverColumnas(cmp, { proveedor: 'Proveedor', cliente: 'Cliente / Asignación', fecha: 'Fecha factura', total: 'Total' }),
    },
    mat: REFS_OBRAS.mat,
  }
  // Los anclajes de Materiales se verifican por TEXTO: la fórmula INDEX/MATCH que la grilla escribe
  // depende de que existan, y un MATCH que no encuentra deja "—" en seis celdas sin gritar.
  const colA = (matColA ?? []).map((f) => String(f?.[0] ?? '').trim())
  for (const r of [REFS_OBRAS.mat.filaTotal, REFS_OBRAS.mat.filaCabecera]) {
    if (!colA.includes(r)) throw new Error(`la pestaña ${REFS_OBRAS.mat.hoja} no tiene el rótulo "${r}": la columna de materiales quedaría muda`)
  }
  return refs
}

async function main() {
  // LOS DOS MODOS JUNTOS NO SIGNIFICAN NADA, así que no se elige por mí: aborta. Adivinar cuál gana es
  // exactamente cómo un "sólo estaba probando" termina escribiendo.
  if (DRY && ESCRIBIR) throw new Error('--dry y --escribir son incompatibles: elegí uno.')
  if (DRY) {
    const seco = grillaObras({ obras: OBRAS_FUTURAS })
    if (!seco.filas.length) throw new Error('la grilla salió vacía: no hay nada que mostrar ni que escribir.')
    return console.log(render(seco, OBRAS_FUTURAS))
  }

  const google = ESCRIBIR
    ? makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
    : makeGoogleClient({})
  const refs = await refsReales(google)
  console.log(`columnas resueltas por rótulo · Cobranzas: cliente=${refs.cob.cliente} concepto=${refs.cob.concepto} total=${refs.cob.total} estado=${refs.cob.estado} (desde ${refs.cob.desde})`)
  console.log(`                              · Compras: proveedor=${refs.cmp.proveedor} cliente=${refs.cmp.cliente} fecha=${refs.cmp.fecha} total=${refs.cmp.total} (desde ${refs.cmp.desde})`)

  const g = grillaObras({ obras: OBRAS_FUTURAS, refs })
  // GUARDA FAIL-CLOSED. Una grilla sin obras no es "una pestaña con poco": es el insumo que no cargó.
  // Escribirla dejaría la pestaña en blanco, que es la forma que tomaron las pérdidas de este repo.
  if (!g.bloques.length) throw new Error('la grilla no trajo ni una obra: NO escribo una pestaña vacía.')
  const proyectado = OBRAS_FUTURAS.reduce((s, o) => s + totalEgresos(o), 0)
  console.log(`${PESTANA_OBRAS}: ${g.filas.length} filas · ${OBRAS_FUTURAS.length} obras · ${g.tipeadas.length} celdas tipeadas (los proyectados del dueño) · $${Math.round(proyectado).toLocaleString('es-AR')} proyectados`)
  if (!ESCRIBIR) return console.log('ENSAYO (sin --escribir): no escribí nada.')

  const hojas = await google.getSheetMeta(ID)
  let hoja = hojas.find((h) => h.title === PESTANA_OBRAS)
  // LA PESTAÑA SE CREA CON ALTO DE SOBRA: un batch que apunta más allá del alto real aborta ENTERO.
  if (!hoja) {
    await google.spreadsheetBatchUpdate(ID, [{
      addSheet: { properties: { title: PESTANA_OBRAS, gridProperties: { rowCount: g.filas.length + 40, columnCount: ANCHO_OBRAS, frozenRowCount: 2 } } },
    }])
    hoja = hallarPestana(await google.getSheetMeta(ID), PESTANA_OBRAS)
    console.log(`  ✚ creé la pestaña ${PESTANA_OBRAS}`)
  }
  const alto = Math.max(g.filas.length + 20, hoja.rows ?? 0)
  if ((hoja.rows ?? 0) < alto) {
    await google.spreadsheetBatchUpdate(ID, [{
      updateSheetProperties: { properties: { sheetId: hoja.sheetId, gridProperties: { rowCount: alto } }, fields: 'gridProperties.rowCount' },
    }])
  }

  // Una fila más ancha que la tabla hace que la API rechace el batch ENTERO. Se verifica ANTES.
  const malas = g.filas.map((f, i) => (f.length > ANCHO_OBRAS ? i + 1 : 0)).filter(Boolean)
  if (malas.length) throw new Error(`${malas.length} fila(s) más anchas que ${ANCHO_OBRAS} columnas: ${malas.slice(0, 5).join(', ')}. NO escribo.`)

  // UNA LECTURA QUE FALLA NO ES UNA PESTAÑA VACÍA: sin esta lectura la Regla 0 decide a ciegas.
  const actual = await google.readSheetValues(ID, `${PESTANA_OBRAS}!A1:${letra(ANCHO_OBRAS - 1)}`).catch((e) => {
    throw new Error(`no pude leer "${PESTANA_OBRAS}" (${e.message}). NO escribo.`)
  })
  const { grid, respetadas, ediciones, candidatos } = await conEdicionesRespetadas(ID, PESTANA_OBRAS, g.filas, actual)
  g.filas = grid
  for (const r of respetadas) console.log(`  ✋ respeto tu texto ("${r.suyo.slice(0, 44)}")`)
  const escritura = await escribirPreservando(google, ID, PESTANA_OBRAS, g.filas, { respetar: false, anchoHoja: Math.max(ANCHO_OBRAS, hoja.cols ?? ANCHO_OBRAS) })
  // UNA PESTAÑA QUE NO SE ESCRIBIÓ NO CAMBIÓ DE FORMA: si el candado la retuvo, tampoco se formatea.
  if (escritura?.bloqueada || escritura?.editadaPorHumano) {
    console.log(`  🔒 "${PESTANA_OBRAS}" bajo tu control: no escribí, NO le toco el formato.`)
    return
  }

  await formatear(google, hoja.sheetId, g)
  const quedo = await google.readSheetValues(ID, `${PESTANA_OBRAS}!A1:${letra(ANCHO_OBRAS - 1)}${g.filas.length}`).catch(() => [])
  await guardarRegistro(ID, PESTANA_OBRAS, g.filas, ediciones, quedo, candidatos)
    .catch((e) => console.warn(`  ⚠ no pude guardar el registro de rótulos: ${e.message}`))
  console.log('QUEDÓ ESCRITO.')
}

/**
 * EL FORMATO — el mismo lenguaje que CAJA y su anexo: encabezado chico, importes protagonistas, el
 * "$" sólo en las filas de cierre, la prosa gris y al final. SE RESETEA TODO AL ESTÁNDAR y recién
 * después se pintan las excepciones: un formateador que sólo aplica apila corridas.
 */
async function formatear(google, sheetId, g) {
  const n = g.filas.length
  const r = (r0, r1, c0 = 0, c1 = ANCHO_OBRAS) => ({ sheetId, startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1 })
  const req = [
    { unmergeCells: { range: r(0, Math.max(n, 40)) } },
    E.reset(sheetId, Math.max(n + 20, 120), ANCHO_OBRAS),
    { updateSheetProperties: { properties: { sheetId, gridProperties: { hideGridlines: true, frozenRowCount: 2 } }, fields: 'gridProperties.hideGridlines,gridProperties.frozenRowCount' } },
  ]
  const INK = { red: 0.10, green: 0.13, blue: 0.20 }
  const MUTED = { red: 0.53, green: 0.52, blue: 0.49 }
  const HAIR = { red: 0.82, green: 0.80, blue: 0.76 }
  const fmt = (rg, fields, format) => req.push({ repeatCell: { range: rg, cell: { userEnteredFormat: E.conFuente(format) }, fields } })
  const borde = (rg) => req.push({ updateBorders: { range: rg, bottom: { style: 'SOLID', color: HAIR } } })

  // Los importes: C..G, a la derecha, sin "$" en el cuerpo. El "$" es del cierre, no de cada celda.
  for (const c of [2, 3, 4, 5, 6]) {
    fmt(r(0, n, c, c + 1), 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment',
      { numberFormat: MONEDA_CUERPO, horizontalAlignment: 'RIGHT' })
  }
  for (const f of [...(g.totales ?? []), ...(g.protagonistas ?? [])]) {
    for (const c of [2, 3, 4, 5, 6]) fmt(r(f - 1, f, c, c + 1), 'userEnteredFormat.numberFormat', { numberFormat: MONEDA_TOTAL })
  }
  fmt(r(0, n, 1, 2), 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment',
    { numberFormat: { type: 'TEXT' }, horizontalAlignment: 'CENTER' })
  fmt(r(0, n, 7, 8), 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment',
    { numberFormat: { type: 'DATE', pattern: 'dd/mm/yyyy' }, horizontalAlignment: 'CENTER' })
  // La última columna es PROSA: texto, gris, con ajuste. Nunca plata.
  fmt(r(0, n, ANCHO_OBRAS - 1, ANCHO_OBRAS), 'userEnteredFormat',
    { ...E.nota(), numberFormat: { type: 'TEXT' }, wrapStrategy: 'WRAP', verticalAlignment: 'MIDDLE' })

  fmt(r(0, 1), 'userEnteredFormat.textFormat', { textFormat: { bold: true, fontSize: E.TAM.titulo } })
  fmt(r(1, 2), 'userEnteredFormat.textFormat,userEnteredFormat.wrapStrategy',
    { textFormat: { italic: true, fontSize: E.TAM.nota, foregroundColor: E.COLOR.nota }, wrapStrategy: 'WRAP' })

  g.filas.forEach((fila, i) => {
    const t = String(fila[0] ?? '')
    if (/^\d · /.test(t)) { // '1 · OBRAS DEL AÑO'
      fmt(r(i, i + 1), 'userEnteredFormat', { textFormat: { bold: true, fontFamily: E.FUENTE, fontSize: E.TAM.cuerpo, foregroundColor: INK }, horizontalAlignment: 'LEFT' })
      borde(r(i, i + 1))
    }
    if (/^(Cliente|Obra)$/.test(t.trim())) { // los encabezados de sección: texto, nunca plata
      fmt(r(i, i + 1), 'userEnteredFormat.numberFormat', { numberFormat: { type: 'TEXT' } })
      fmt(r(i, i + 1), 'userEnteredFormat.textFormat,userEnteredFormat.horizontalAlignment',
        { textFormat: { bold: true, foregroundColor: MUTED, fontSize: E.TAM.nota }, horizontalAlignment: 'LEFT' })
      borde(r(i, i + 1))
    }
    if (/^⇒/.test(t)) fmt(r(i, i + 1, 0, 1), 'userEnteredFormat.textFormat', { textFormat: { bold: true, fontFamily: E.FUENTE, fontSize: E.TAM.cuerpo } })
  })
  // La fila protagonista de cada obra, en negrita; su detalle, chico y gris — jerarquía, no ruido.
  for (const f of g.protagonistas ?? []) {
    fmt(r(f - 1, f, 0, 2), 'userEnteredFormat.textFormat', { textFormat: { bold: true, fontFamily: E.FUENTE, fontSize: E.TAM.cuerpo, foregroundColor: INK } })
    borde(r(f - 1, f))
  }
  for (const f of g.detalles ?? []) {
    fmt(r(f - 1, f, 0, 1), 'userEnteredFormat.textFormat', { textFormat: { fontFamily: E.FUENTE, fontSize: E.TAM.nota, foregroundColor: MUTED } })
  }

  // NINGUNA FILA OCULTA Y NI UNA NOTA: lo que existe se ve, y una nota sobrevive a la reescritura
  // salvo que se borre explícitamente.
  req.push({ updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 0, endIndex: Math.max(n + 40, 120) }, properties: { hiddenByUser: false }, fields: 'hiddenByUser' } })
  req.push({
    updateCells: {
      range: { sheetId, startRowIndex: 0, endRowIndex: n, startColumnIndex: 0, endColumnIndex: ANCHO_OBRAS },
      rows: Array.from({ length: n }, () => ({ values: Array.from({ length: ANCHO_OBRAS }, () => ({ note: '' })) })),
      fields: 'note',
    },
  })
  // La columna A se dimensiona con los rótulos REALES de esta corrida: el estilo de la casa pone CLIP
  // en toda la hoja, así que un rótulo más largo que su columna no se derrama — desaparece.
  const anchos = ANCHOS_OBRAS.map((px, i) => (i === 0 ? anchoColumnaA(g) : px))
  anchos.forEach((px, i) => req.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: i, endIndex: i + 1 }, properties: { pixelSize: px }, fields: 'pixelSize' } }))
  const { requests: rTxt } = requestsTextoPorContenido(sheetId, g.filas || [])
  req.push(...rTxt)
  await google.spreadsheetBatchUpdate(ID, req)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main()
    .catch((e) => { console.error('ERROR:', e.message); process.exitCode = 1 })
    .finally(async () => { await import('../lib/db.mjs').then((m) => m.closePool()).catch(() => {}) })
}
