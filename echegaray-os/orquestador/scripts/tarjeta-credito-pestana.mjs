#!/usr/bin/env node
// Rehace la pestaña "Tarjeta de Credito" al estándar minimalista/clase-mundial del resto del archivo,
// PRESERVANDO el ledger de cuotas cargadas que el dueño mantiene a mano.
//
// QUÉ CONTESTA. Arriba, el resumen: cuánto se puede gastar hoy con la Visa …3319, cuánto está
// consumido, qué línea de cuotas queda, cuánto adelanto por cajero hay disponible y qué consumos
// entraron últimos. Abajo, la sección 6: el DETALLE DE CUOTAS CARGADAS —el registro que el dueño lleva
// compra por compra, cuota por cuota, con lo ya debitado—. Ese ledger es la fuente de qué está
// financiado en la tarjeta y NO se toca su contenido: se re-emite tal cual.
//
// DE DÓNDE SALE CADA NÚMERO DEL RESUMEN. Todo sale del "Detalle de Tarjeta" del Santander al
// 29/07/2026: es la fuente primaria, y por eso los importes se cargan como VALORES con su origen
// declarado en la columna "De dónde sale" —no son un cálculo del OS—. La regla de oro se cumple igual:
// un número con origen trazable es tan válido como una fórmula. Lo único que SÍ es fórmula son los
// TOTALES y las VERIFICACIONES (disponible del hero, control de límite de cuotas, control de adelanto,
// total de consumos): referencian las celdas oficiales de abajo, así el propio Sheet chequea que la
// carga cierre. Ni un número derivado se pega: o es oficial, o es una referencia.
//
// EL LEDGER (SECCIÓN 6) SE PRESERVA "TAL CUAL". Se LEE de la pestaña —incluidas las fórmulas que el
// dueño usa (col "fecha gral" =A{fila}, col "fecha pago" =fecha de pago, montos financiados =x/3)— y se
// re-emite. Como el bloque baja de lugar (el resumen va arriba), las referencias RELATIVAS de fila se
// corren por el mismo delta (reubicarFormula): una fórmula "=A3" en la fila 3 vieja pasa a "=A{fila
// nueva}", así apunta a la misma columna de su propia fila. Los valores literales (fechas, importes,
// cuotas, textos) se re-emiten idénticos. Después de escribir, se VERIFICA celda por celda que el
// ledger quedó íntegro contra lo que se leyó; si algo no coincide, hay snapshot para restaurar.
//
// POR QUÉ NO SE RECONCILIA "disponible para compras" A MANO. El banco informa $8.693.073,70 y no es
// límite − consumido − pendiente: la línea tiene bloqueos que el Detalle no desglosa. Inventar la
// resta daría un número distinto del oficial. Se respeta el dato del banco y punto.
//
//   node orquestador/scripts/tarjeta-credito-pestana.mjs [--dry] [--force]
//
// --force: regeneración intencional. Salta las guardas de skip (candado/firma/reescritura) para la
// aplicación controlada —con snapshot de respaldo tomado antes—. Sin --force el worker respeta la
// pestaña como cualquier otra y no la pisa.

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import * as E from '../lib/estilo-pestana.mjs'
import { skinRequests } from '../lib/estilo-statement.mjs'
import { escribirPreservando, VACIO, limpiarCentinela, fusionar } from '../lib/preservar-anotaciones.mjs'
import { seccion, sub as subItem, total as rotuloTotal, auditarPatron } from '../lib/patron-pestana.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
export const PESTAÑA = 'Tarjeta de Credito'
// Se localiza por gid además de por nombre: el título puede llevar o no la tilde ("Crédito"), pero el
// gid no se mueve. Así el generador encuentra la pestaña correcta aunque alguien la renombre.
export const GID = 1053281239
const DRY = process.argv.includes('--dry')
const FORCE = process.argv.includes('--force') || process.env.ORQ_TARJETA_FORCE === '1'

// A el concepto, B el importe (o el dato), C el estado/aclaración corta, D de dónde sale (última).
// Un solo ancho de grilla para el RESUMEN: es lo que evita que un bloque se vea corrido. El ledger de
// la sección 6 es el único bloque más ancho, y el auditor de patrón lo admite como registro al final.
export const ANCHO = 4
export const C_CONCEPTO = 0, C_MONTO = 1, C_DET = 2, C_ORIGEN = 3

/** La fuente única de todos los números del RESUMEN. */
const ORIGEN = 'Detalle de Tarjeta · Santander · 29/07/2026'

/** El encabezado exacto del ledger de cuotas: por su primera celda se lo localiza en la pestaña. */
export const LEDGER_HEADER = [
  'Fecha de Compra', 'fecha gral', 'Proveedor', 'Cuota', 'Monto',
  'Tipo comp', 'Nro comp', 'fecha de pago', 'fecha pago', 'DEBITADO',
]

const letra = (i) => { let s = ''; for (let n = i; n >= 0; n = Math.floor(n / 26) - 1) s = String.fromCharCode(65 + (n % 26)) + s; return s }

/**
 * NÚCLEO PURO: corre las referencias de FILA relativas de una fórmula por `delta`, para reubicar un
 * bloque que se mueve verticalmente sin romper sus fórmulas de misma-fila (=A3, =H8).
 *
 * - No toca las columnas (la letra queda igual), sólo el número de fila.
 * - Respeta las filas ANCLADAS con "$" (no las corre).
 * - No confunde una referencia con un literal ni con un nombre de función: exige que la referencia no
 *   esté pegada a otro identificador ni seguida de "(" —así "=791441,74/3" (constante) y "LOG10(" no
 *   se tocan, y "=A3" o "=H8" sí—.
 *
 * @param {string} formula  la fórmula tal como la devuelve el Sheet (localizada, ej. "=791441,74/3")
 * @param {number} delta    cuántas filas se movió el bloque (fila nueva − fila vieja)
 * @returns {string} la fórmula con las filas relativas corridas
 */
export function reubicarFormula(formula, delta) {
  if (typeof formula !== 'string' || !formula.startsWith('=') || !delta) return formula
  return formula.replace(/(?<![A-Za-z0-9_$.])(\$?)([A-Za-z]{1,3})(\$?)(\d+)(?![\w(])/g, (m, cAbs, col, rAbs, row) => {
    if (rAbs === '$') return m // fila anclada: no se mueve
    return `${cAbs}${col}${rAbs}${Number(row) + delta}`
  })
}

/**
 * ¿Qué formato de número lleva una columna del ledger, por el nombre de su encabezado? PURA.
 *
 * Devuelve SIEMPRE un formato (nunca null): al bajar de lugar, el ledger cae sobre celdas que traían
 * el formato de la conciliación vieja, y una celda sin formato propio lo hereda —así la "Cuota" (un
 * 6, un 7) salía como "$6,00"—. Fijar el formato de cada columna vuelve la re-emisión determinística.
 */
export function formatoLedger(encabezado) {
  const h = String(encabezado || '').trim().toLowerCase()
  if (h === 'fecha de compra' || h === 'fecha de pago') return { type: 'DATE', pattern: 'd/m/yyyy' }
  if (h === 'fecha gral' || h === 'fecha pago') return { type: 'DATE', pattern: 'mmmm yy' }
  if (h === 'monto') return { type: 'CURRENCY', pattern: '"$"#,##0.00' }
  if (h === 'cuota') return { type: 'NUMBER', pattern: '0' }
  return { type: 'TEXT' } // proveedor, tipo/nro comp, debitado, y las anotaciones del dueño (área, estado)
}

/**
 * NÚCLEO PURO: arma la pestaña entera. No toca red ni base — por eso se puede testear sola.
 *
 * @param {null | {header:string[], filas:Array<Array<{f?:string|null, v?:any, n?:number|null}>>, oldStart:number}} ledger
 *        el ledger leído de la pestaña. `filas` son las filas de datos (cada celda como fue leída:
 *        fórmula, valor o número). `oldStart` es la fila (1-based) donde arrancaban los datos en la
 *        pestaña vieja, para poder correr las fórmulas relativas al lugar nuevo. Si es null, no se
 *        emite la sección 6 (útil para el test de la estructura del resumen).
 *
 * Devuelve { filas, titular, textos, controles, resumenFin, ledgerInfo }.
 */
export function grilla(ledger = null) {
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
  const resumenFin = d1 // última fila del resumen: los formatos del resumen no bajan más allá de acá.

  // ── 6 · DETALLE DE CUOTAS CARGADAS (el ledger del dueño, re-emitido tal cual) ────────────────────
  let ledgerInfo = null
  if (ledger && Array.isArray(ledger.filas) && ledger.filas.length) {
    // El ancho REAL del ledger: el dueño le agregó columnas de anotación a la derecha del encabezado
    // (K = área "Financiero/Civil/Estructura", L = estado de la factura en Compras). Se preservan.
    const cols = ledger.anchoLedger || ledger.header.length
    // El ledger es más ancho que el resumen: sus filas se empujan con su ancho real (no se recortan a
    // ANCHO). El auditor de patrón admite exactamente UN bloque así al final.
    const pushAncho = (arr) => { const r = [...arr]; while (r.length < cols) r.push(VACIO); filas.push(r); return filas.length }

    push()
    push([seccion(6, 'Detalle de cuotas cargadas')])
    push(['Registro que llevás vos, compra por compra y cuota por cuota. El OS lo preserva tal cual; no lo calcula.'])
    const headerRow = pushAncho(ledger.header)         // el encabezado del ledger, tal cual
    const dataStart = filas.length + 1                 // 1-based, primera fila de datos ya reubicada
    const delta = dataStart - ledger.oldStart          // constante: todo el bloque bajó lo mismo

    for (const filaCeldas of ledger.filas) {
      const out = filaCeldas.map((celda) => {
        if (!celda) return VACIO
        if (typeof celda.f === 'string' && celda.f.startsWith('=')) return reubicarFormula(celda.f, delta)
        if (celda.n !== null && celda.n !== undefined) return celda.n
        return celda.v !== null && celda.v !== undefined && String(celda.v) !== '' ? celda.v : VACIO
      })
      pushAncho(out)
    }
    const dataEnd = filas.length
    ledgerInfo = {
      headerRow, dataStart, dataEnd, cols, delta,
      patrones: Array.from({ length: cols }, (_, j) => formatoLedger(ledger.header[j])),
    }
  }

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
    resumenFin,
    ledgerInfo,
  }
}

/**
 * Lee el ledger de cuotas de la pestaña. Devuelve la estructura que consume `grilla()`, o null si no
 * lo encuentra (en cuyo caso NO se re-emite ninguna sección 6 y se aborta: nunca escribir el resumen
 * perdiendo el ledger).
 */
async function leerLedger(google, ref, cols) {
  const grid = await google.readSheetGrid(ID, `${ref}!A1:${letra(cols - 1)}400`)
  const filas = grid.filas || []
  const headerIdx = filas.findIndex((f) => String(f?.[0]?.valor ?? '').trim().toLowerCase() === 'fecha de compra')
  if (headerIdx < 0) return null
  const oldStart = headerIdx + 2 // 1-based fila de la primera fila de datos

  // ── DÓNDE TERMINA EL LEDGER ──
  // Debajo de las cuotas hay filas "vacías" que igual traen fórmulas plantilla en las columnas
  // derivadas (=IF(A..="";"";TEXT(...)) en "fecha gral"/"fecha pago"), que evalúan a "". Si se
  // contara la fórmula como contenido, el ledger "no terminaría nunca". Una fila es de DATOS sólo si
  // tiene valor efectivo en "Fecha de Compra" (col A) O en "Monto" (col E) — las columnas ancla.
  const tieneDato = (c) => !!c && ((c.valor !== null && c.valor !== undefined && String(c.valor) !== '') || (c.numero !== null && c.numero !== undefined))
  const conContenido = (c) => tieneDato(c) || (typeof c?.formula === 'string' && c.formula.startsWith('='))

  const rows = []
  for (let i = headerIdx + 1; i < filas.length; i++) {
    const f = filas[i] || []
    if (!tieneDato(f[0]) && !tieneDato(f[4])) break // ni fecha de compra ni monto: fin del ledger
    rows.push(f)
  }
  if (!rows.length) return null

  // El ancho REAL: hasta la última columna con contenido en el encabezado o en cualquier fila de datos.
  // El dueño agregó anotaciones a la derecha (área en K, estado de la factura en L): entran enteras.
  const anchoDe = (f) => { let n = 0; for (let j = 0; j < f.length; j++) if (conContenido(f[j])) n = j + 1; return n }
  const anchoLedger = Math.max(LEDGER_HEADER.length, anchoDe(filas[headerIdx] || []), ...rows.map(anchoDe))

  const header = Array.from({ length: anchoLedger }, (_, j) => String(filas[headerIdx]?.[j]?.valor ?? LEDGER_HEADER[j] ?? ''))
  const datos = rows.map((f) => Array.from({ length: anchoLedger }, (_, j) => {
    const c = f[j] || {}
    return { f: c.formula ?? null, v: c.valor ?? null, n: c.numero ?? null }
  }))
  return { header, filas: datos, oldStart, anchoLedger }
}

async function main() {
  if (DRY) {
    // En seco no se toca la red: se muestra el resumen con un ledger de muestra para ver la estructura.
    const muestra = {
      header: [...LEDGER_HEADER, '', ''],
      anchoLedger: 12,
      oldStart: 3,
      filas: [
        [{ v: '16/1/2026', n: 46038 }, { f: '=A3' }, { v: 'Modica SA' }, { v: '', n: null }, { n: 355413.39 }, { v: 'FA' }, { v: '00045-00000009' }, { v: '2/2/2026', n: 46055 }, { f: '=H3' }, { v: 'SI' }, { v: 'Financiero' }, { v: '✓ su factura está en Compras' }],
      ],
    }
    const g = grilla(muestra)
    console.log(`${PESTAÑA} (dry): ${g.filas.length} filas · titular en la fila ${g.titular} · ledger en ${g.ledgerInfo?.dataStart}`)
    const defectos = auditarPatron(limpiarCentinela(g.filas), { ancho: ANCHO })
    console.log(defectos.length ? `⚠ ${defectos.length} defecto(s) de patrón:` : '✓ cumple el patrón de diseño')
    for (const d of defectos.slice(0, 10)) console.log(`   fila ${d.fila} · ${d.regla} · ${d.detalle}`)
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
  const anchoHoja = hoja.cols ?? 12

  // ── LEER EL LEDGER ANTES DE TOCAR NADA ──────────────────────────────────────────────────────────
  // Si no está, NO se escribe: el resumen sin el ledger sería una pérdida de la data del dueño.
  const ledger = await leerLedger(google, hoja.title, anchoHoja)
  if (!ledger) throw new Error('no encontré el ledger de cuotas (encabezado "Fecha de Compra"): no escribo para no perderlo.')
  console.log(`  ledger leído: ${ledger.filas.length} filas de cuotas (arrancaban en la fila ${ledger.oldStart}).`)

  const g = grilla(ledger)
  const anchoTotal = Math.max(ANCHO, ledger.anchoLedger)
  console.log(`${PESTAÑA}: ${g.filas.length} filas · titular en la fila ${g.titular} · sección 6 (ledger) en las filas ${g.ledgerInfo.dataStart}–${g.ledgerInfo.dataEnd}`)

  const defectos = auditarPatron(limpiarCentinela(g.filas), { ancho: ANCHO })
  console.log(defectos.length ? `⚠ ${defectos.length} defecto(s) de patrón:` : '✓ cumple el patrón de diseño')
  for (const d of defectos.slice(0, 10)) console.log(`   fila ${d.fila} · ${d.regla} · ${d.detalle}`)
  if (defectos.length) { process.exitCode = 1; return }

  if ((hoja.cols ?? 0) < anchoTotal) {
    await google.spreadsheetBatchUpdate(ID, [{ appendDimension: { sheetId, dimension: 'COLUMNS', length: anchoTotal - (hoja.cols ?? 0) } }])
  }
  // Esta pestaña no usa notas: la procedencia vive en la columna "De dónde sale". Se limpian las notas
  // viejas del generador en su propia grilla.
  await google.spreadsheetBatchUpdate(ID, [{ updateCells: { range: { sheetId, startRowIndex: 0, endRowIndex: g.filas.length, startColumnIndex: 0, endColumnIndex: anchoTotal }, fields: 'note' } }]).catch(() => {})

  // ═══ LA COLA DE LA VERSIÓN ANTERIOR ═══
  // El diseño nuevo puede ser más corto que lo que había abajo (la conciliación vieja). VACIO limpia lo
  // que dejó el generador y conserva cualquier anotación de una persona.
  //
  // La cola se mide por lo que SE VE, no por las fórmulas. Debajo del ledger viejo hay filas plantilla
  // con =IF(A..="";"";TEXT(...)) que evalúan a "" en toda la columna: contarlas como contenido hacía
  // que "la cola" llegara hasta el fondo de la hoja (fila 330) y el formateo se saliera de la grilla.
  const previo = await google.readSheetValues(ID, `${hoja.title}!A1:${letra(anchoTotal - 1)}400`, { render: 'FORMULA' })
  // MISMO CRITERIO QUE EN PROVEEDORES Y CAJA (31/07): esta lectura decide hasta qué fila hay contenido
  // del dueño y alimenta la Regla 0. Caer al render FORMULA cuando la API falla cambia la SEMÁNTICA del
  // dato (compara "=IF(…)" contra el texto que se ve) y la pestaña sale mezclada. Falla cerrado.
  const previoVis = await google.readSheetValues(ID, `${hoja.title}!A1:${letra(anchoTotal - 1)}400`).catch((e) => {
    throw new Error(`no pude leer el texto visible de "${hoja.title}" (${e.message}). NO escribo: sin esa lectura la Regla 0 decide a ciegas.`)
  })
  let ultimaFila = 0
  previoVis.forEach((f, i) => { if ((f || []).some((c) => String(c ?? '').trim())) ultimaFila = i + 1 })
  if (ultimaFila > g.filas.length) {
    console.log(`  cola de la versión anterior: limpio las filas ${g.filas.length + 1}–${ultimaFila}`)
    for (let i = g.filas.length; i < ultimaFila; i++) g.filas.push(Array(anchoTotal).fill(VACIO))
  }

  // ── LIMPIAR LAS COLUMNAS DE LA DERECHA EN TODA FILA DEL RESUMEN ──
  // El resumen usa 4 columnas; el ledger, 12. Sin esto, las filas del resumen se escriben con 4 celdas
  // y la FUSIÓN preserva lo que la versión vieja tenía en las columnas E–L de esas filas (fórmulas
  // plantilla, restos de la conciliación) → aparecen #VALUE! y anchos mezclados. Cada fila se lleva a
  // `anchoTotal` con VACIO ("mi celda, va vacía"): así la fusión limpia esas columnas sin tocar una
  // anotación de una persona que estuviera fuera de la grilla.
  g.filas = g.filas.map((f) => { const r = [...f]; while (r.length < anchoTotal) r.push(VACIO); return r })

  if (FORCE) {
    // REGENERACIÓN INTENCIONAL (aplicación controlada, con snapshot previo). Se salta las guardas de
    // skip —candado/firma/reescritura— pero se FUSIONA con lo que hay para no borrar una anotación de
    // una persona, y el ledger va incluido (preservación real). El write pasa el portón (yaGuardado).
    console.log('  ⚡ --force: regeneración intencional (guardas de skip omitidas; se fusiona y se preserva el ledger).')
    const fusion = fusionar(g.filas, previo)
    await google.batchUpdateValues(ID, [{ range: `${hoja.title}!A1`, values: fusion }], { yaGuardado: true })
  } else {
    // Camino normal (worker): NO se escribe si la pestaña está candada o la editaste. Ver preservar.
    const { bloqueada, editadaPorHumano, reescrita, conservadas } = await escribirPreservando(google, ID, hoja.title, g.filas, { anchoHoja: Math.max(anchoTotal, hoja.cols ?? anchoTotal) })
    if (bloqueada || editadaPorHumano || reescrita) { console.log('  no escribí (pestaña protegida o editada por una persona). Usá --force para la regeneración intencional.'); return }
    if (conservadas?.length) console.log(`  ✋ ${conservadas.length} celda(s) de una persona — CONSERVADAS`)
  }

  await formatear(google, sheetId, g, hoja.rows ?? 0, anchoTotal)
  await verificar(google, hoja.title, g, ledger, anchoTotal)
}

/** El formato: la piel de statement compartida más lo propio del resumen y del ledger. */
async function formatear(google, sheetId, g, filasHoja = 0, cols = ANCHO) {
  const n = g.filas.length
  const fin = g.resumenFin // el resumen no baja más allá de acá; el ledger lleva su propio formato.
  const r = (r0, r1, c0 = 0, c1 = ANCHO) => ({ sheetId, startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1 })
  const fmt = (rg, fields, format) => ({ repeatCell: { range: rg, cell: { userEnteredFormat: format }, fields } })
  const req = [{ unmergeCells: { range: r(0, n, 0, cols) } }]

  // ── EL RESUMEN (columnas A–D, sólo hasta `fin`) ──
  req.push(fmt(r(3, fin, C_MONTO, C_MONTO + 1), 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment',
    { numberFormat: { type: 'CURRENCY', pattern: '"$"#,##0.00;[Red]-"$"#,##0.00;"—"' }, horizontalAlignment: 'RIGHT' }))
  req.push(fmt(r(3, fin, C_DET, C_DET + 1), 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment',
    { numberFormat: { type: 'TEXT' }, horizontalAlignment: 'LEFT' }))
  req.push(fmt(r(3, fin, C_ORIGEN, C_ORIGEN + 1), 'userEnteredFormat(textFormat,horizontalAlignment,wrapStrategy)',
    { textFormat: E.conFuente({ textFormat: { italic: true, fontSize: E.TAM.nota, foregroundColor: E.COLOR.nota } }).textFormat, horizontalAlignment: 'LEFT', wrapStrategy: 'WRAP' }))
  // La columna A del resumen derrama sobre las vacías de su derecha: un título de sección no se parte.
  req.push(fmt(r(0, fin, 0, 1), 'userEnteredFormat.wrapStrategy', { wrapStrategy: 'OVERFLOW_CELL' }))

  // Los datos de la ficha (sección 5): B es TEXTO, no moneda.
  for (const f of g.textos ?? []) req.push(fmt(r(f - 1, f, C_MONTO, C_MONTO + 1), 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment', { numberFormat: { type: 'TEXT' }, horizontalAlignment: 'LEFT' }))

  // Los encabezados de mes/tabla del resumen no son importes: sin formato de moneda encima.
  g.filas.slice(0, fin).forEach((f, i) => {
    if (/^(concepto|fecha)/i.test(String(f?.[0] ?? ''))) req.push(fmt(r(i, i + 1, C_MONTO, C_MONTO + 1), 'userEnteredFormat.numberFormat', { numberFormat: { type: 'TEXT' } }))
  })

  // ── EL LEDGER (sección 6): cada columna con SU formato de número original ──
  const L = g.ledgerInfo
  if (L) {
    const r0 = L.dataStart - 1, r1 = L.dataEnd
    L.patrones.forEach((p, j) => {
      if (!p) return
      req.push({ repeatCell: { range: { sheetId, startRowIndex: r0, endRowIndex: r1, startColumnIndex: j, endColumnIndex: j + 1 }, cell: { userEnteredFormat: { numberFormat: p } }, fields: 'userEnteredFormat.numberFormat' } })
    })
    // El importe del ledger, a la derecha; el resto a la izquierda por defecto de la piel.
    const eMonto = L.patrones.findIndex((p) => p && p.type === 'CURRENCY')
    if (eMonto >= 0) req.push({ repeatCell: { range: { sheetId, startRowIndex: r0, endRowIndex: r1, startColumnIndex: eMonto, endColumnIndex: eMonto + 1 }, cell: { userEnteredFormat: { horizontalAlignment: 'RIGHT' } }, fields: 'userEnteredFormat.horizontalAlignment' } })
  }

  // Anchos y alturas del resumen (A–D).
  req.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: C_CONCEPTO, endIndex: C_CONCEPTO + 1 }, properties: { pixelSize: 300 }, fields: 'pixelSize' } })
  req.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: C_MONTO, endIndex: C_MONTO + 1 }, properties: { pixelSize: 150 }, fields: 'pixelSize' } })
  req.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: C_DET, endIndex: C_DET + 1 }, properties: { pixelSize: 150 }, fields: 'pixelSize' } })
  req.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: C_ORIGEN, endIndex: C_ORIGEN + 1 }, properties: { pixelSize: 330 }, fields: 'pixelSize' } })
  req.push({ updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 0, endIndex: n }, properties: { pixelSize: 21 }, fields: 'pixelSize' } })
  await google.spreadsheetBatchUpdate(ID, req)

  // PIEL DE STATEMENT: sin reja, secciones y encabezados por tipografía + hairline, totales rulados.
  // Cubre todo el ancho (incluido el ledger); las reglas se dibujan del ancho de cada bloque.
  await google.spreadsheetBatchUpdate(ID, skinRequests({ sheetId, filas: limpiarCentinela(g.filas), cols, congeladas: 2, titular: g.titular, filasHoja }))
  await google.spreadsheetBatchUpdate(ID, [{ updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 0, endIndex: n + 5 }, properties: { hiddenByUser: false }, fields: 'hiddenByUser' } }]).catch(() => {})
}

/**
 * VERIFICA MIRANDO LA PESTAÑA. Tres cosas: ninguna celda en error, el patrón cumple, y —lo crítico—
 * el ledger quedó ÍNTEGRO: cada celda re-emitida tiene el mismo valor efectivo (número o texto) que la
 * que se leyó. Si algo no coincide, se avisa fuerte y se marca la corrida como fallida (hay snapshot).
 */
async function verificar(google, ref, g, ledger, cols) {
  const v = await google.readSheetValues(ID, `${ref}!A1:${letra(cols - 1)}${g.filas.length}`)
  const err = []
  v.forEach((f, i) => (f || []).forEach((c, j) => { if (/^#(REF|ERROR|N\/A|VALUE|VALOR|¡|¿|DIV|NAME|NUM|NULL)/i.test(String(c ?? ''))) err.push(`${letra(j)}${i + 1}=${c}`) }))
  console.log(err.length ? `⚠ ${err.length} celdas en error: ${err.slice(0, 6).join(' ')}` : '✓ ninguna celda en error')
  const post = auditarPatron(v, { ancho: ANCHO })
  console.log(post.length ? `⚠ ${post.length} defecto(s) de patrón tras escribir:` : '✓ la pestaña cumple el patrón de diseño')
  for (const d of post.slice(0, 10)) console.log(`   fila ${d.fila} · ${d.regla} · ${d.detalle}`)

  // ── INTEGRIDAD DEL LEDGER: valor efectivo re-leído vs. valor leído original ──
  const grid = await google.readSheetGrid(ID, `${ref}!A1:${letra(cols - 1)}${g.filas.length}`)
  const L = g.ledgerInfo
  const efectivo = (c) => (c && c.numero !== null && c.numero !== undefined) ? Math.round(c.numero * 100) / 100 : String(c?.valor ?? '')
  const efectivoLeido = (c) => (c && c.n !== null && c.n !== undefined) ? Math.round(c.n * 100) / 100 : String(c?.v ?? '')
  let intactas = 0
  const rotas = []
  ledger.filas.forEach((filaOrig, i) => {
    const filaNueva = grid.filas[L.dataStart - 1 + i] || []
    filaOrig.forEach((celda, j) => {
      const a = efectivoLeido(celda)
      const b = efectivo(filaNueva[j])
      if (String(a) === String(b)) intactas++
      else rotas.push(`${letra(j)}${L.dataStart + i}: esperaba ${JSON.stringify(a)} y hay ${JSON.stringify(b)}`)
    })
  })
  const totalCeldas = ledger.filas.reduce((m, f) => m + f.length, 0)
  if (rotas.length) {
    console.log(`⚠ LEDGER NO ÍNTEGRO: ${rotas.length}/${totalCeldas} celdas no coinciden. RESTAURÁ DEL SNAPSHOT.`)
    for (const x of rotas.slice(0, 12)) console.log(`   ${x}`)
    process.exitCode = 1
  } else {
    console.log(`✓ ledger íntegro: ${intactas}/${totalCeldas} celdas de cuotas coinciden con lo leído (${ledger.filas.length} filas).`)
  }
  for (const f of v) if (/^(⇒|LA POSICIÓN)/.test(String(f?.[0] ?? ''))) console.log(`  ${String(f[0]).slice(0, 44).padEnd(46)}${String(f[1] ?? '').padStart(16)}`)
  if (err.length || post.length) process.exitCode = 1
}

// Sólo corre main() si se invoca como script (no al importarlo desde el test).
if (import.meta.url === `file://${process.argv[1]}`) {
  main().then(() => process.exit(process.exitCode ?? 0)).catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
}
