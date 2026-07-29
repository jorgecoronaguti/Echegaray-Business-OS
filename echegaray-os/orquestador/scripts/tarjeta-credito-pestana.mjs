#!/usr/bin/env node
// Rehace la pestaña "Tarjeta de Credito" al estándar minimalista/clase-mundial del resto del archivo.
//
// QUÉ CONTESTA. Cuánto se puede gastar hoy con la Visa …3319, cuánto está consumido, qué línea de
// cuotas queda, cuánto adelanto por cajero hay disponible y qué consumos entraron últimos.
//
// DE DÓNDE SALE CADA NÚMERO. Todo sale del "Detalle de Tarjeta" del Santander al 29/07/2026: es la
// fuente primaria, y por eso los importes se cargan como VALORES con su origen declarado en la
// columna "De dónde sale" —no son un cálculo del OS—. La regla de oro se cumple igual: un número con
// origen trazable es tan válido como una fórmula. Lo único que SÍ es fórmula son los TOTALES y las
// VERIFICACIONES (disponible del hero, control de límite de cuotas, control de adelanto, total de
// consumos): referencian las celdas oficiales de abajo, así el propio Sheet chequea que la carga
// cierre (cuotas: consumido + disponible = $10.000.000; adelanto: usado + disponible = $2.000.000;
// consumos: la suma = $56.500). Ni un número derivado se pega: o es oficial, o es una referencia.
//
// POR QUÉ NO SE RECONCILIA "disponible para compras" A MANO. El banco informa $8.693.073,70 y no es
// límite − consumido − pendiente: la línea tiene bloqueos que el Detalle no desglosa. Inventar la
// resta daría un número distinto del oficial. Se respeta el dato del banco y punto.
//
//   node orquestador/scripts/tarjeta-credito-pestana.mjs [--dry]

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import * as E from '../lib/estilo-pestana.mjs'
import { skinRequests } from '../lib/estilo-statement.mjs'
import { escribirPreservando, VACIO, limpiarCentinela } from '../lib/preservar-anotaciones.mjs'
import { seccion, sub as subItem, total as rotuloTotal, auditarPatron } from '../lib/patron-pestana.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
export const PESTAÑA = 'Tarjeta de Credito'
// Se localiza por gid además de por nombre: el título puede llevar o no la tilde ("Crédito"), pero el
// gid no se mueve. Así el generador encuentra la pestaña correcta aunque alguien la renombre.
export const GID = 1053281239
const DRY = process.argv.includes('--dry')

// A el concepto, B el importe (o el dato), C el estado/aclaración corta, D de dónde sale (última).
// Un solo ancho de grilla para toda la pestaña: es lo que evita que un bloque se vea corrido.
export const ANCHO = 4
export const C_CONCEPTO = 0, C_MONTO = 1, C_DET = 2, C_ORIGEN = 3

/** La fuente única de todos los números de esta pestaña. */
const ORIGEN = 'Detalle de Tarjeta · Santander · 29/07/2026'

const letra = (i) => { let s = ''; for (let n = i; n >= 0; n = Math.floor(n / 26) - 1) s = String.fromCharCode(65 + (n % 26)) + s; return s }

/**
 * NÚCLEO PURO: arma la pestaña entera. No toca red ni base — por eso se puede testear sola.
 *
 * Devuelve { filas, titular, textos, controles } donde `textos` son las filas cuyo dato en B es texto
 * (la ficha de la tarjeta) y `controles` las filas de verificación, para que el formateador sepa
 * tratarlas distinto sin re-adivinar por el rótulo.
 */
export function grilla() {
  const filas = []
  const push = (c = []) => {
    const r = [...c].map((x) => (x === '' || x === undefined || x === null ? VACIO : x))
    while (r.length < ANCHO) r.push(VACIO)
    filas.push(r); return filas.length
  }
  const dato = (concepto, monto, { det = VACIO, origen = ORIGEN } = {}) => push([concepto, monto, det, origen])
  const encab = (a = 'Concepto', b = 'Monto') => push([a, b, VACIO, 'De dónde sale'])

  push(['Tarjeta de crédito'])
  push(['Posición de la Visa terminada en 3319 (titular Echegaray, Oviedo Ro) · Detalle de Tarjeta del Santander al 29/07/2026 · el período actual cierra el 20/08/2026 y vence el 01/09/2026'])
  push()

  // EL HERO se RESERVA acá y se llena al final, cuando ya se sabe en qué fila quedó cada dato oficial:
  // así el titular y los sub-ítems son REFERENCIAS a las secciones de abajo, no números repetidos.
  const heroBase = filas.length
  for (let k = 0; k < 6; k++) push()

  // ── 1 · LÍMITE Y DISPONIBLE PARA COMPRAS ────────────────────────────────────────────────────────
  push([seccion(1, 'Límite y disponible para comprar')])
  encab()
  const fLimite = dato('Límite de compra', 10000000)
  dato('Consumido hasta el momento', 24000, { det: 'confirmado' })
  dato('Consumos pendientes de confirmación', 32500, { det: 'pendiente' })
  const fDispCompras = push([rotuloTotal('Disponible para compras'), 8693073.70, VACIO,
    'Dato oficial del banco. No es límite − consumido: la línea tiene bloqueos que el Detalle no desglosa.'])
  push()

  // ── 2 · COMPRAS EN CUOTAS ───────────────────────────────────────────────────────────────────────
  // La línea de cuotas COMPARTE el límite de $10.000.000 con las compras: consumido + disponible = límite.
  push([seccion(2, 'Compras en cuotas — comparten el límite de $10.000.000')])
  encab()
  const fCuotasCons = dato('Total consumido en cuotas', 3554133.30)
  dato('Cuotas pendientes del próximo período', 0)
  const fCuotasDisp = dato('Disponible en cuotas', 6445866.70)
  const fCuotasCtrl = push([rotuloTotal('Límite de la línea de cuotas'), `=B${fCuotasCons}+B${fCuotasDisp}`,
    'debe dar $10.000.000', 'Consumido + disponible de la línea de cuotas. Verificación de la carga.'])
  push()

  // ── 3 · ADELANTO POR CAJERO ─────────────────────────────────────────────────────────────────────
  push([seccion(3, 'Adelanto por cajero')])
  encab()
  const fAdelUtil = dato('Utilizado (incluye ajustes y devoluciones)', 0)
  const fAdelDisp = dato('Disponible para adelanto', 2000000)
  const fAdelCtrl = push([rotuloTotal('Límite de adelanto'), `=B${fAdelUtil}+B${fAdelDisp}`,
    'debe dar $2.000.000', 'Utilizado + disponible del adelanto. Verificación de la carga.'])
  push()

  // ── 4 · ÚLTIMOS CONSUMOS ────────────────────────────────────────────────────────────────────────
  push([seccion(4, 'Últimos consumos')])
  encab('Fecha y comprobante', 'Monto')
  filas[filas.length - 1][C_DET] = 'Estado'
  const c0 = filas.length + 1
  push(['23/07 · Merpago*correoarg', 24000, 'Confirmado', ORIGEN])
  push(['28/07 · comprobante 0002906915', 32500, 'Pendiente', ORIGEN])
  push(['14/07 · comprobante 0000000000', 0, 'Pendiente · U$S 0,00', ORIGEN])
  const c1 = filas.length
  const fConsTot = push([rotuloTotal('Total últimos consumos'), `=SUM(B${c0}:B${c1})`,
    'debe dar $56.500', 'Suma de los consumos listados. Verificación de la carga.'])
  push()

  // ── 5 · DATOS DE LA TARJETA Y EL PERÍODO ────────────────────────────────────────────────────────
  // El dato de B acá es TEXTO (nombre, número, fecha), no plata: el formateador lo trata como texto
  // (ver `textos`) para que la columna de moneda no intente leer "20/08/2026" como un importe.
  push([seccion(5, 'Datos de la tarjeta y el período')])
  encab('Concepto', 'Dato')
  const d0 = filas.length + 1
  // Apóstrofo: sin él USER_ENTERED parsea las fechas como serial y el número de tarjeta como número.
  push(['Titular', "'Echegaray, Oviedo Ro", VACIO, ORIGEN])
  push(['Tarjeta', "'Visa terminada en 3319", VACIO, ORIGEN])
  push(['Cierre del período actual', "'20/08/2026", VACIO, ORIGEN])
  push(['Vencimiento', "'01/09/2026", VACIO, ORIGEN])
  const d1 = filas.length

  // ── EL HERO, RECIÉN AHORA ───────────────────────────────────────────────────────────────────────
  // La respuesta de la pestaña, referenciando los datos oficiales de las secciones. El titular es el
  // número más fuerte: cuánto se puede comprar hoy.
  const hero = [
    ['LA POSICIÓN', 'Monto', VACIO, 'De dónde sale'],
    [rotuloTotal('Disponible para comprar hoy'), `=B${fDispCompras}`, VACIO, 'Lo que el banco habilita para compras (sección 1).'],
    [subItem('límite de compra'), `=B${fLimite}`, VACIO, 'Sección 1.'],
    [subItem('disponible en la línea de cuotas'), `=B${fCuotasDisp}`, VACIO, 'Sección 2 — comparte el límite de $10.000.000.'],
    [subItem('disponible para adelanto por cajero'), `=B${fAdelDisp}`, VACIO, 'Sección 3.'],
    [],
  ]
  hero.forEach((c, k) => {
    const row = [...c].map((x) => (x === '' || x === undefined || x === null ? VACIO : x))
    while (row.length < ANCHO) row.push(VACIO)
    filas[heroBase + k] = row
  })

  return {
    filas,
    titular: heroBase + 2,
    textos: Array.from({ length: d1 - d0 + 1 }, (_, i) => d0 + i),
    controles: [fCuotasCtrl, fAdelCtrl, fConsTot],
  }
}

async function main() {
  const g = grilla()
  console.log(`${PESTAÑA}: ${g.filas.length} filas x ${ANCHO} columnas · titular en la fila ${g.titular}`)

  // La auditoría de patrón corre SIEMPRE, también en --dry: no hace falta escribir para saber si el
  // diseño cumple la gramática del archivo.
  const defectos = auditarPatron(limpiarCentinela(g.filas), { ancho: ANCHO })
  console.log(defectos.length ? `⚠ ${defectos.length} defecto(s) de patrón:` : '✓ cumple el patrón de diseño')
  for (const d of defectos.slice(0, 10)) console.log(`   fila ${d.fila} · ${d.regla} · ${d.detalle}`)

  if (DRY) {
    for (const f of limpiarCentinela(g.filas)) {
      if (!f.some((c) => String(c ?? '').trim())) { console.log(''); continue }
      console.log(`  ${String(f[C_CONCEPTO] ?? '').slice(0, 40).padEnd(42)}${String(f[C_MONTO] ?? '').padStart(16)}  ${String(f[C_DET] ?? '')}`)
    }
    return
  }

  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  const meta = await google.getSheetMeta(ID)
  const hoja = meta.find((s) => s.sheetId === GID) || meta.find((s) => s.title === PESTAÑA)
  if (!hoja) throw new Error(`no encontré la pestaña "${PESTAÑA}" (gid ${GID}) en el archivo`)
  const { sheetId } = hoja
  if ((hoja.cols ?? 0) < ANCHO) {
    await google.spreadsheetBatchUpdate(ID, [{ appendDimension: { sheetId, dimension: 'COLUMNS', length: ANCHO - (hoja.cols ?? 0) } }])
  }

  // Las notas viejas del generador se limpian SÓLO en su propia grilla (esta pestaña no usa notas: la
  // procedencia vive en la columna "De dónde sale").
  await google.spreadsheetBatchUpdate(ID, [{ updateCells: { range: { sheetId, startRowIndex: 0, endRowIndex: g.filas.length, startColumnIndex: 0, endColumnIndex: ANCHO }, fields: 'note' } }]).catch(() => {})

  // ═══ LA COLA DE LA VERSIÓN ANTERIOR ═══
  // El diseño nuevo puede ser más corto que el que había: sin esto, las filas viejas de más abajo
  // sobrevivirían. VACIO = "es mi celda y va vacía": limpia lo que dejó el generador y conserva
  // cualquier anotación de una persona.
  const previo = await google.readSheetValues(ID, `${hoja.title}!A1:${letra(ANCHO - 1)}400`)
  let ultimaFila = 0
  previo.forEach((f, i) => { if ((f || []).some((c) => String(c ?? '').trim())) ultimaFila = i + 1 })
  if (ultimaFila > g.filas.length) {
    console.log(`  cola de la versión anterior: limpio las filas ${g.filas.length + 1}–${ultimaFila}`)
    for (let i = g.filas.length; i < ultimaFila; i++) g.filas.push(Array(ANCHO).fill(VACIO))
  }

  // NO se borra nada escrito por una persona: escribirPreservando fusiona, aplica el candado, la firma
  // y la Regla 0 (todo por defecto). Ver lib/preservar-anotaciones.mjs.
  const { conservadas, bloqueada, editadaPorHumano, reescrita } = await escribirPreservando(google, ID, hoja.title, g.filas, { anchoHoja: Math.max(ANCHO, hoja.cols ?? ANCHO) })
  if (bloqueada || editadaPorHumano || reescrita) { console.log('  no escribí (pestaña protegida o editada por una persona).'); return }
  if (conservadas.length) console.log(`  ✋ ${conservadas.length} celda(s) de una persona — CONSERVADAS`)
  await formatear(google, sheetId, g, hoja.rows ?? 0)

  // VERIFICAR MIRANDO LA PESTAÑA, no confiando en que la escritura salió bien.
  const v = await google.readSheetValues(ID, `${hoja.title}!A1:${letra(ANCHO - 1)}${g.filas.length}`)
  const err = []
  v.forEach((f, i) => (f || []).forEach((c, j) => { if (/^#(REF|ERROR|N\/A|VALUE|VALOR|¡|¿|DIV|NAME|NUM|NULL)/i.test(String(c ?? ''))) err.push(`${letra(j)}${i + 1}=${c}`) }))
  console.log(err.length ? `⚠ ${err.length} celdas en error: ${err.slice(0, 6).join(' ')}` : '✓ ninguna celda en error')
  const post = auditarPatron(v, { ancho: ANCHO })
  console.log(post.length ? `⚠ ${post.length} defecto(s) de patrón tras escribir:` : '✓ la pestaña cumple el patrón de diseño')
  for (const d of post.slice(0, 10)) console.log(`   fila ${d.fila} · ${d.regla} · ${d.detalle}`)
  for (const f of v) if (/^(⇒|LA POSICIÓN)/.test(String(f?.[0] ?? ''))) console.log(`  ${String(f[0]).slice(0, 44).padEnd(46)}${String(f[1] ?? '').padStart(16)}`)
  if (err.length || post.length) process.exitCode = 1
}

/** El formato: la piel de statement compartida más lo propio de esta pestaña. */
async function formatear(google, sheetId, g, filasHoja = 0) {
  const n = g.filas.length
  const r = (r0, r1, c0 = 0, c1 = ANCHO) => ({ sheetId, startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1 })
  const fmt = (rg, fields, format) => ({ repeatCell: { range: rg, cell: { userEnteredFormat: format }, fields } })
  const req = [{ unmergeCells: { range: r(0, n) } }]

  // La columna B: moneda con centavos (una tarjeta trabaja al centavo), a la derecha.
  req.push(fmt(r(3, n, C_MONTO, C_MONTO + 1), 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment',
    { numberFormat: { type: 'CURRENCY', pattern: '"$"#,##0.00;[Red]-"$"#,##0.00;"—"' }, horizontalAlignment: 'RIGHT' }))
  // La columna C: aclaración / estado, texto a la izquierda.
  req.push(fmt(r(3, n, C_DET, C_DET + 1), 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment',
    { numberFormat: { type: 'TEXT' }, horizontalAlignment: 'LEFT' }))
  // La columna D: de dónde sale. Chica, apagada, itálica, que envuelva. Es explicación, no dato.
  req.push(fmt(r(3, n, C_ORIGEN, C_ORIGEN + 1), 'userEnteredFormat(textFormat,horizontalAlignment,wrapStrategy)',
    { textFormat: E.conFuente({ textFormat: { italic: true, fontSize: E.TAM.nota, foregroundColor: E.COLOR.nota } }).textFormat, horizontalAlignment: 'LEFT', wrapStrategy: 'WRAP' }))
  // La columna A derrama sobre las vacías de su derecha: un título de sección no se parte.
  req.push(fmt(r(0, n, 0, 1), 'userEnteredFormat.wrapStrategy', { wrapStrategy: 'OVERFLOW_CELL' }))

  // Los datos de la ficha (sección 5): B es TEXTO, no moneda.
  for (const f of g.textos ?? []) req.push(fmt(r(f - 1, f, C_MONTO, C_MONTO + 1), 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment', { numberFormat: { type: 'TEXT' }, horizontalAlignment: 'LEFT' }))

  // Los encabezados de mes/tabla no son importes: sin formato de moneda encima.
  g.filas.forEach((f, i) => {
    if (/^(concepto|fecha)/i.test(String(f?.[0] ?? ''))) req.push(fmt(r(i, i + 1, C_MONTO, C_MONTO + 1), 'userEnteredFormat.numberFormat', { numberFormat: { type: 'TEXT' } }))
  })

  // Anchos y alturas.
  req.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: C_CONCEPTO, endIndex: C_CONCEPTO + 1 }, properties: { pixelSize: 300 }, fields: 'pixelSize' } })
  req.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: C_MONTO, endIndex: C_MONTO + 1 }, properties: { pixelSize: 150 }, fields: 'pixelSize' } })
  req.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: C_DET, endIndex: C_DET + 1 }, properties: { pixelSize: 150 }, fields: 'pixelSize' } })
  req.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: C_ORIGEN, endIndex: C_ORIGEN + 1 }, properties: { pixelSize: 330 }, fields: 'pixelSize' } })
  req.push({ updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 0, endIndex: n }, properties: { pixelSize: 21 }, fields: 'pixelSize' } })
  await google.spreadsheetBatchUpdate(ID, req)

  // PIEL DE STATEMENT: sin reja, secciones y encabezados por tipografía + hairline, totales rulados.
  // La misma que CAJA, Cheques e Impuestos.
  await google.spreadsheetBatchUpdate(ID, skinRequests({ sheetId, filas: g.filas, cols: ANCHO, congeladas: 2, titular: g.titular, filasHoja }))
  await google.spreadsheetBatchUpdate(ID, [{ updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 0, endIndex: n + 5 }, properties: { hiddenByUser: false }, fields: 'hiddenByUser' } }]).catch(() => {})
}

// Sólo corre main() si se invoca como script (no al importarlo desde el test).
if (import.meta.url === `file://${process.argv[1]}`) {
  main().then(() => process.exit(process.exitCode ?? 0)).catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
}
