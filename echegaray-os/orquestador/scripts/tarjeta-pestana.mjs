#!/usr/bin/env node
// "Tarjeta de Credito" — LA PESTAÑA CONTESTA LAS CINCO PREGUNTAS DEL DUEÑO Y NADA MÁS:
//
//   ¿CUÁNTO HAY QUE PAGAR (ARS y USD)? · ¿YA SE PAGÓ? · ¿QUÉ ME ESTÁN COBRANDO?
//   · ¿CUÁNTO PUEDE VENIR LA PRÓXIMA? · ¿CÓMO VIENE VINIENDO, RESUMEN POR RESUMEN?
//
// El QUÉ se arma en `lib/tarjeta-banda.mjs`, que es puro y tiene los tests. Acá vive sólo el CÓMO:
// leer la base, leer la pestaña, ajustar el alto, escribir y formatear.
//
// ═══ POR QUÉ SE REHIZO (28/08/2026) ═══
//
// Textual: «no me sirve la pestaña, nada de la información que expresa es lo que necesito».
// La versión anterior contestaba cuánto se puede gastar (el disponible), cuánto vence, cuánto costó
// y si la tarjeta se usa como financiamiento. Ninguna de esas es una de las cinco. Y su titular —el
// disponible— salía de una captura de homebanking hecha a mano: se publicaba con el aviso «foto de
// hace 30 días».
//
// ═══ REGLAS QUE ESTE SCRIPT NO PUEDE ROMPER ═══
//
//   · NO TOCA EL REGISTRO (el detalle de compras y cuotas, columnas A–L de la fila 54 para abajo).
//     Lo carga el dueño y es el hecho primario. El generador escribe SÓLO la banda de arriba.
//   · NUNCA ESCRIBE EN LA COLUMNA E NI "SI" EN LA J. CAJA suma
//        SUMPRODUCT((UPPER('Tarjeta de Credito'!$J$3:$J$400)<>"SI")*IF(ISNUMBER($E$3:$E$400);…))
//     sobre el rango de columna ENTERO: cualquier importe que la banda pusiera en E se sumaría al
//     consumo de tarjeta de CAJA como si fuera una compra más. Hay test.
//   · El registro se ubica por el DATO (fecha en A + importe en E), no por el rótulo "Fecha de
//     Compra": un rótulo lo puede borrar una persona y el generador insertaría filas a ciegas.
//   · SIN RESUMEN EN LA BASE NO ESCRIBE NADA. Antes los números vivían en una constante del código y
//     "siempre había". Ahora, si nadie cargó un resumen, la pestaña no se dibuja con ceros: aborta y
//     dice con qué comando se carga.
//
//   node orquestador/scripts/tarjeta-pestana.mjs [--dry] [--rediseniar]

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { skinRequests, MUTED, HAIR, ACENTO, INK } from '../lib/estilo-statement.mjs'
import { conEdicionesRespetadas, guardarRegistro, autoRespetarReescritura, leerRegistro } from '../lib/respetar-ediciones.mjs'
import { VACIO } from '../lib/preservar-anotaciones.mjs'
import { RETIRADOS } from '../lib/tarjeta-banda.mjs'
import { firmaGuardia, sellarFirma } from '../lib/firma-tab.mjs'
// La huella por celda. Este generador escribe con `batchUpdateValues` y no pasa por el portón de
// lib/preservar-anotaciones.mjs, así que la engancha él mismo: lo que el dueño vacía no vuelve.
import { conHuellaFueraDelPorton } from '../lib/huella-celda.mjs'
import { bandaFilas, datosDeLaBanda, COLS, TITULAR } from '../lib/tarjeta-banda.mjs'
import { BANDA, FILA_HDR } from '../lib/tarjeta-geometria.mjs'
import { leerResumenes, leerMovimientosBanco } from '../lib/tarjeta-datos.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const PESTANA = 'Tarjeta de Credito'
const DRY = process.argv.includes('--dry')

/** Una fecha dd/m/aaaa como la muestra el Sheet en es-AR. */
const ES_FECHA = /^\s*\d{1,2}\/\d{1,2}\/\d{2,4}\s*$/
const esImporte = (v) => /\d/.test(String(v ?? '')) && !/^[A-Za-zÁÉÍÓÚÑ]/.test(String(v ?? '').trim())

/**
 * NÚCLEO PURO: dónde arranca el registro, por el DATO y no por el rótulo.
 *
 * Una fila del registro tiene fecha de compra en A e importe en E. El rótulo "Fecha de Compra" lo
 * puede borrar una persona; el dato, no. Si no hay registro devuelve null y el script aborta: sin
 * ancla, ajustar el alto de la banda a ciegas deja la pestaña con dos bandas superpuestas.
 *
 * @param {any[][]} filas la grilla leída (valores, no fórmulas)
 * @returns {{primera:number, hdr:number}|null} filas 1-based
 */
export function ubicarRegistro(filas = []) {
  for (let i = 0; i < filas.length; i++) {
    const f = filas[i] || []
    if (ES_FECHA.test(String(f[0] ?? '')) && esImporte(f[4])) return { primera: i + 1, hdr: i }
  }
  return null
}

/**
 * NÚCLEO PURO: dónde vive el bloque que dejó un generador anterior DEBAJO del registro.
 *
 * Se reconoce por lo que DICE, con o sin su número: la numeración es lo que más cambia cuando se
 * reordena una pestaña. Devuelve la primera fila 1-based a limpiar, o null si no hay nada.
 * Sólo se busca DESPUÉS del registro: un rótulo parecido dentro de la banda nueva no es residuo.
 */
export const ES_BLOQUE_VIEJO = /^\s*(?:\d+\s*·\s*)?(?:CONTROL\s*—\s*la tarjeta|LA TARJETA COMO DISPONIBILIDAD)/i
export function ubicarBloqueViejo(filas = [], desde = 0) {
  for (let i = desde; i < filas.length; i++) {
    if (ES_BLOQUE_VIEJO.test(String((filas[i] || [])[0] ?? ''))) return i + 1
  }
  return null
}

/** Lo que el registro ya tiene cargado para el mes del vencimiento. Es lo que la fórmula de la
 *  brecha va a calcular sola en el Sheet: acá se recalcula igual, en frío, para la previsualización.
 *  PURA. */
export function cargadoEnElRegistro(filas = [], hdr = 0, mes = '') {
  const [a, m] = mes.split('-').map(Number)
  let total = 0
  for (let i = hdr; i < filas.length; i++) {
    const f = filas[i] || []
    const fe = String(f[7] ?? '').trim()          // columna H: fecha de pago
    const mm = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(fe)
    if (!mm) continue
    const anio = Number(mm[3]) < 100 ? 2000 + Number(mm[3]) : Number(mm[3])
    if (anio !== a || Number(mm[2]) !== m) continue
    const n = Number(String(f[4] ?? '').replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.'))
    if (Number.isFinite(n)) total += n
  }
  return Math.round(total * 100) / 100
}

const $ = (n) => `$${Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

async function main() {
  const hoy = new Date().toISOString().slice(0, 10)
  const resumenes = await leerResumenes()
  if (!resumenes.length) {
    console.error('ABORTA: no hay ningún resumen de tarjeta en la base.')
    console.error('  Cargá el PDF con:  node orquestador/scripts/importar-tarjeta.mjs <resumen.pdf>')
    console.error('  (dibujar la pestaña con ceros sería peor que no dibujarla: los ceros se leen como datos).')
    process.exit(1)
  }
  const movimientos = await leerMovimientosBanco()
  const datos = datosDeLaBanda(resumenes, movimientos, { hoy })

  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  const hojas = await google.getSheetMeta(ID)
  const hoja = hojas.find((s) => s.title === PESTANA)
  if (!hoja) throw new Error(`no encontré la pestaña "${PESTANA}"`)
  const sheetId = hoja.sheetId

  // UNA LECTURA QUE FALLA NO ES UNA PESTAÑA VACÍA. Con un `.catch(() => [])` un 429 se convierte en
  // "no hay registro" y el generador escribiría la banda encima de las cuotas del dueño. Falla
  // cerrado: la corrida siguiente lo hace bien.
  const previo = await google.readSheetValues(ID, `'${PESTANA}'!A1:L`).catch((e) => {
    throw new Error(`no pude leer "${PESTANA}" (${e.message}). NO escribo: sin leer no sé dónde está tu registro.`)
  })
  const ubic = ubicarRegistro(previo)
  if (!ubic) {
    console.error(`ABORTA: no encuentro el registro en "${PESTANA}" (ninguna fila con fecha en A e importe en E).`)
    console.error('Sin ancla, ajustar el alto de la banda dejaría la pestaña con dos bandas superpuestas.')
    process.exit(1)
  }
  const bandaActual = ubic.hdr - 1
  const g = bandaFilas(FILA_HDR, datos)

  if (DRY) {
    previsualizar(g, datos, previo, ubic, bandaActual)
    return
  }

  // ── La firma y el respeto por lo que editó una persona, ANTES de tocar nada ──────────────────────
  if ((await firmaGuardia(google, ID, PESTANA, `'${PESTANA}'`)).editada) return

  // La puerta del rediseño autorizado: `autoRespetarReescritura` compara los rótulos que este
  // generador quiere escribir contra los que hay, y si sobreviven pocos concluye —bien— que la
  // reescribió una persona. Cuando el dueño PIDE el rediseño esa señal se da vuelta: un rediseño
  // cambia casi todos los rótulos a propósito. La bandera hay que tipearla: un timer no la escribe.
  const REDISENAR = process.argv.includes('--rediseniar') || process.argv.includes('--rediseñar')
  if (REDISENAR) {
    console.log('  ⚠ --rediseniar: el dueño pidió reemplazar el layout, así que NO se compara contra los rótulos viejos.')
    console.log('    La firma y el candado siguen activos. Verificá el resultado con ver-pestana.mjs.')
  } else if ((await autoRespetarReescritura(ID, PESTANA, g.filas, previo)).reescrita) {
    console.log('    Si el rediseño es a pedido tuyo, volvé a correrlo con --rediseniar.')
    return
  }

  // ═══ EL ALTO SE AJUSTA POR ABAJO, NO POR ARRIBA (28/08) ═══
  //
  // Acá se insertaban o borraban filas al PRINCIPIO de la pestaña (startIndex 0). Funcionaba para
  // dejarle lugar al registro, y rompía todo lo demás: cada celda de la banda se corría 21 filas, y
  // con ella la coordenada donde el OS había sellado su huella. `huella-celda.mjs` tolera un
  // desplazamiento de ±5 filas; con 21 el mapa NO ALINEA, no hay veredicto, y cada celda que el
  // layout nuevo deja vacía queda blindada con el mismo blindaje que protege el trabajo del dueño.
  //
  // Es exactamente cómo sobrevivieron 29 celdas del layout anterior adentro del nuevo.
  //
  // Las filas que sobran (o que faltan) están al FINAL de la banda, que es donde vive el relleno:
  // sacarlas de ahí deja intactas las coordenadas de las filas 1..min(alto viejo, alto nuevo), el
  // mapa alinea con desplazamiento cero y la huella puede probar celda por celda. El registro se
  // corre igual —es lo que había que lograr— y CAJA lo lee por rango de columna ($E$3:$E$400), así
  // que correrlo no rompe la referencia mientras siga por debajo de la fila 3.
  if (bandaActual !== BANDA) {
    await google.spreadsheetBatchUpdate(ID, [bandaActual < BANDA
      ? { insertDimension: { range: { sheetId, dimension: 'ROWS', startIndex: bandaActual, endIndex: BANDA }, inheritFromBefore: false } }
      : { deleteDimension: { range: { sheetId, dimension: 'ROWS', startIndex: BANDA, endIndex: bandaActual } } }])
    console.log(`  · la banda pasa de ${bandaActual} a ${BANDA} filas: ${bandaActual < BANDA ? 'inserto' : 'borro'} ${Math.abs(BANDA - bandaActual)} fila(s) al final de la banda, no al principio`)
  }
  // Una celda COMBINADA sólo acepta escritura en su ancla: en cualquier otra celda del merge la
  // escritura se ignora EN SILENCIO. Se desarma la banda antes de escribirla.
  await google.spreadsheetBatchUpdate(ID, [{
    unmergeCells: { range: { sheetId, startRowIndex: 0, endRowIndex: BANDA, startColumnIndex: 0, endColumnIndex: COLS } },
  }]).catch(() => {})

  const { grid, respetadas, ediciones, candidatos } = await conEdicionesRespetadas(ID, PESTANA, g.filas, previo)
  for (const r of respetadas) console.log(`  ✋ respeto tu texto ("${String(r.suyo).slice(0, 44)}")`)

  // ═══ LA BANDA ES DUEÑA DE TODO SU RECTÁNGULO, Y LO DECLARA CELDA POR CELDA (28/08) ═══
  //
  // EL DEFECTO, medido sobre la pestaña escrita: SOBREVIVIERON 29 CELDAS DEL LAYOUT ANTERIOR
  // intercaladas en el nuevo —encabezados sueltos en A33/A40/A47, un título muerto en A25 y la
  // sección entera "3 · CONTROL — LA PESTAÑA CONTRA EL RESUMEN DEL BANCO" publicando $5.749.674 con
  // "▲ revisar la carga"—. Un número muerto que grita, que es exactamente lo que el dueño dijo que
  // no le servía.
  //
  // LA CAUSA no fue un descuido de la grilla: la grilla mandaba "" en esas celdas. Es que un ""
  // significa "no es mi celda" y `no-borrar.mjs` —bien— conserva lo que no puede probar de quién es.
  // El generador tiene que DECLARAR "esta celda es mía y va vacía", que es el centinela `VACIO`.
  //
  // Se aplica ACÁ y no en el núcleo puro por dos razones: `conEdicionesRespetadas` compara rótulos y
  // un centinela no es un rótulo, y la grilla que devuelve `bandaFilas` tiene que poder auditarse
  // como texto (los tests miden lo que se ve, no la plomería).
  const conCentinelas = grid.map((f) => Array.from({ length: COLS }, (_, j) => {
    const c = f[j]
    return (c === '' || c === undefined || c === null) ? VACIO : c
  }))

  // LA HUELLA POR CELDA: LO QUE VOS BORRASTE EN LA BANDA NO VUELVE. Se RELEE acá y no se reusa
  // `previo`: esa lectura es anterior al ajuste de alto, y comparar contra ella haría que la huella
  // juzgue la fila equivocada. Y se lee la FÓRMULA, no el texto: una `=SI(…;"";…)` se ve vacía y
  // tiene contenido. Si la relectura falla, la huella no decide y se escribe como siempre.
  const enFormula = await google.readSheetValues(ID, `'${PESTANA}'!A1:L${BANDA}`, { render: 'FORMULA' }).catch(() => null)
  let aEscribir = conCentinelas
  let huella = null
  if (enFormula) {
    huella = await conHuellaFueraDelPorton(ID, PESTANA, conCentinelas, enFormula, { fila0: 1, col0: 0 })
    aEscribir = huella.grid
  } else {
    console.warn(`  ⚠ no pude releer las fórmulas de "${PESTANA}": la huella no decide en esta corrida y un borrado tuyo podría volver.`)
  }

  // ═══ Y LOS RÓTULOS QUE ESCRIBIÓ LA VERSIÓN ANTERIOR DE ESTE MISMO GENERADOR ═══
  //
  // `vaciarPropio` NO es un permiso para borrar: es el insumo con el que `no-borrar` decide, sobre el
  // destino que ella misma relee, qué celda puede probar del OS (`residuo-propio.mjs`: la fila tiene
  // que estar anclada por un rótulo propio y la celda tiene que tener forma de generador). Lo que no
  // se pruebe vuelve intacto aunque esté nombrado acá.
  //
  // Al registro vivo de `sheet_rotulos` se le suman los rótulos RETIRADOS en este rediseño: el
  // registro guarda lo que la pestaña tiene HOY, así que en cuanto el layout cambia, la prueba de
  // que esos textos los escribió el OS se pierde — y el residuo queda blindado con el mismo blindaje
  // que protege el trabajo del dueño. La lista está en `tarjeta-banda.mjs`, con su commit.
  const { mios } = await leerRegistro(ID, PESTANA).catch(() => ({ mios: [] }))
  const propios = [...new Set([...mios, ...RETIRADOS])]

  await google.batchUpdateValues(ID, [{ range: `${PESTANA}!A1`, values: aEscribir }], { vaciarPropio: { mios: propios } })
  // Después de escribir, nunca antes: la huella es evidencia del efecto, no de la intención.
  await huella?.guardar?.(aEscribir)
  await sellarFirma(google, ID, PESTANA, `'${PESTANA}'`)
  await guardarRegistro(ID, PESTANA, aEscribir, ediciones, previo, candidatos)
    .catch((e) => console.warn(`  ⚠ no pude guardar el registro de rótulos: ${e.message}`))

  await limpiarBloqueViejo(google, sheetId, BANDA - bandaActual)
  await formatear(google, sheetId, grid, g)

  // ── VERIFICACIÓN: releer y probar que la banda quedó sin errores ────────────────────────────────
  const chk = await google.readSheetValues(ID, `'${PESTANA}'!A1:C${BANDA}`)
  const errores = (chk || []).flat().filter((c) => /^#(REF|N\/A|VALUE|ERROR|NAME|¿|DIV)/i.test(String(c ?? ''))).length
  console.log(`✔ ${PESTANA}`)
  console.log(`  a pagar ${chk?.[g.fArs - 1]?.[1]} · ${chk?.[g.fDif - 1]?.[2]}`)
  console.log(`  brecha contra el registro: ${chk?.[g.fBrecha - 1]?.[1]} → ${chk?.[g.fBrecha - 1]?.[2]}`)
  console.log(`  ${errores} celda(s) en error`)
  if (errores) process.exitCode = 1
}

/**
 * LA PREVISUALIZACIÓN EN FRÍO: cómo va a quedar, sin tocar el Sheet.
 *
 * Las fórmulas no se pueden evaluar fuera del Sheet, así que las tres que deciden algo se recalculan
 * ACÁ con los mismos datos —el extracto de la base y el registro leído de la pestaña— y se muestran
 * al lado. Es lo más cerca del efecto que se puede llegar sin escribir.
 */
function previsualizar(g, datos, previo, ubic, bandaActual) {
  const r = datos.resumen
  console.log(`(--dry) banda ${bandaActual} → ${BANDA} filas · encabezado del registro: ${ubic.hdr} → ${FILA_HDR}`)
  const viejo = ubicarBloqueViejo(previo, ubic.primera)
  console.log(viejo ? `  bloque viejo debajo del registro: desde la fila ${viejo} — se limpia` : '  sin bloque viejo debajo del registro')
  console.log('')
  // LAS DOS PISTAS SE MUESTRAN COMO SE VAN A VER: la izquierda en A-B-C y la derecha en F-G-H. Una
  // previsualización de una sola columna no deja ver lo único que hay que revisar acá, que es si el
  // ojo puede comparar los dos bloques de un lado al otro.
  const plata = (x, fila, col) => {
    const s = String(x ?? '')
    if (s.startsWith('=')) return '⟨fórmula⟩'
    const n = s === '' ? null : Number(s)
    if (n === null || !Number.isFinite(n)) return s
    const enDolares = (col === 1 ? g.usd : g.usdDer).includes(fila)
    return enDolares ? `U$S ${n.toLocaleString('es-AR', { minimumFractionDigits: 2 })}` : $(n)
  }
  for (const [i, f] of g.filas.entries()) {
    // La cifra de la tarjeta vive en la columna A (es un titular, no una fila de tabla), así que la
    // columna A también puede traer un número y hay que mostrarlo como plata.
    const a = typeof f[0] === 'number' ? $(f[0]) : String(f[0] ?? '')
    const c = typeof f[2] === 'number' ? `U$S ${f[2].toLocaleString('es-AR', { minimumFractionDigits: 2 })}` : String(f[2] ?? '')
    const izq = [a.padEnd(44), plata(f[1], i + 1, 1).padStart(15), c.startsWith('=') ? '⟨fórmula⟩' : c]
    const der = [(String(f[5] ?? '').startsWith('=') ? '⟨fórmula⟩' : String(f[5] ?? '')).padEnd(36), plata(f[6], i + 1, 6).padStart(15), String(f[7] ?? '').startsWith('=') ? '⟨fórmula⟩' : String(f[7] ?? '')]
    const linea = `${String(i + 1).padStart(3)}  ${izq[0]}${izq[1]}  ${izq[2].padEnd(34)}│ ${der[0]}${der[1]}  ${der[2]}`
    console.log(linea.replace(/\s+$/, ''))
  }
  const e = datos.estado
  const cargado = cargadoEnElRegistro(previo, ubic.hdr, r.vencimiento.slice(0, 7))
  console.log('\nLO QUE VAN A DAR LAS FÓRMULAS (recalculado en frío con los mismos datos):')
  console.log(`  fila ${g.fCif} (F) · estado: ${e.estado}${e.hallazgo ? ` — ${e.hallazgo}` : ''}`)
  console.log(`  fila ${g.fCif + 1} (F) · débito en el extracto entre ${e.ventana.desde} y ${e.ventana.hasta}: ${e.debitos.length ? $(e.pagado) : 'todavía no aparece'}`)
  console.log(`  fila ${g.fCargado} · cargado en el registro para ${r.vencimiento.slice(0, 7)}: ${$(cargado)}`)
  console.log(`  fila ${g.fBrecha} · brecha sin proyectar: ${$(r.aDebitarPesos - cargado)}${r.aDebitarDolares ? ` + U$S ${r.aDebitarDolares.toLocaleString('es-AR', { minimumFractionDigits: 2 })}` : ''}`)
}

/**
 * Borra el bloque que dejó el generador anterior DEBAJO del registro.
 *
 * Sólo borra lo que RECONOCE: si su firma no aparece, no toca nada. Rehacer una pestaña con datos
 * borrando "de la fila X para abajo" ya destruyó trabajo del dueño en este archivo.
 */
async function limpiarBloqueViejo(google, sheetId, corrimiento) {
  const ahora = await google.readSheetValues(ID, `'${PESTANA}'!A1:L`).catch(() => null)
  if (!ahora) return
  const reg = ubicarRegistro(ahora)
  const desde = ubicarBloqueViejo(ahora, reg ? reg.primera : BANDA)
  if (!desde) return
  const hasta = ahora.length
  await google.clearValues(ID, `'${PESTANA}'!A${desde}:L${hasta}`)
  await google.spreadsheetBatchUpdate(ID, [{
    updateCells: { range: { sheetId, startRowIndex: desde - 1, endRowIndex: hasta, startColumnIndex: 0, endColumnIndex: COLS }, fields: 'userEnteredFormat' },
  }])
  console.log(`  ✓ bloque viejo limpiado: filas ${desde}–${hasta}${corrimiento ? ` (la banda corrió ${corrimiento} fila(s))` : ''}`)
}

/**
 * EL FORMATO DE LA BANDA. Todo lo que la piel común no sabe: las tres tarjetas de arriba, la moneda
 * de cada columna y los anchos.
 *
 * LA PIEL RECONOCE LA ESTRUCTURA POR LA COLUMNA A (`estilo-statement.mjs`), así que la pista DERECHA
 * —que vive en F— es invisible para ella: su título y su encabezado los formatea este generador con
 * los mismos valores, o la segunda columna se leería como texto suelto.
 */
async function formatear(google, sheetId, grid, g) {
  const txt = (color, { bold = false, size = 10 } = {}) => ({ foregroundColor: color, bold, fontSize: size, fontFamily: 'Arial' })
  // Negativos entre paréntesis y el cero como raya: un "$0" se lee como un dato medido, y casi
  // siempre es "acá no hay nada". El patrón va en formato US aunque el archivo sea es-AR.
  const money = { type: 'NUMBER', pattern: '$#,##0;($#,##0);"—"' }
  const dolar = { type: 'CURRENCY', pattern: '"U$S" #,##0.00' }
  const rg = (r0, r1, c0, c1) => ({ sheetId, startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1 })
  const fmt = (r0, r1, c0, c1, cell, fields) => ({ repeatCell: { range: rg(r0, r1, c0, c1), cell: { userEnteredFormat: cell }, fields } })
  const TODO = 'userEnteredFormat(numberFormat,horizontalAlignment,textFormat,wrapStrategy)'
  const tabla0 = g.fCif + 2                     // primera fila de bloques, 0-based

  const reqs = [
    ...skinRequests({ sheetId, filas: grid, cols: COLS, congeladas: 2, titular: TITULAR }),
    // La banda desborda sobre las columnas vacías de la derecha en vez de cortarse: un título partido
    // al medio no es un rótulo, es un error de imprenta.
    fmt(0, BANDA, 0, COLS, { wrapStrategy: 'OVERFLOW_CELL' }, 'userEnteredFormat.wrapStrategy'),
    fmt(1, 2, 0, COLS, { textFormat: txt(MUTED, { size: 9 }), wrapStrategy: 'OVERFLOW_CELL' }, 'userEnteredFormat(textFormat,wrapStrategy)'),

    // ── LAS COLUMNAS DE PLATA: B (pista izquierda) y G (pista derecha) ──────────────────────────
    // Sin esto los importes pegados heredan formato de FECHA y se leen "24/1/29279" en vez de
    // "$10.000.000" — ya pasó en esta pestaña.
    fmt(tabla0, BANDA, 1, 2, { numberFormat: money, horizontalAlignment: 'RIGHT' }, 'userEnteredFormat(numberFormat,horizontalAlignment)'),
    fmt(tabla0, BANDA, 6, 7, { numberFormat: money, horizontalAlignment: 'RIGHT' }, 'userEnteredFormat(numberFormat,horizontalAlignment)'),
    // Las columnas de contexto (C y H): TEXTO, gris y chico. Si quedaran en formato de número,
    // "vence el 05/10/2026" se convertiría en una fecha.
    fmt(tabla0, BANDA, 2, 3, { numberFormat: { type: 'TEXT' }, horizontalAlignment: 'LEFT', textFormat: txt(MUTED, { size: 9 }), wrapStrategy: 'OVERFLOW_CELL' }, TODO),
    fmt(tabla0, BANDA, 7, 8, { numberFormat: { type: 'TEXT' }, horizontalAlignment: 'LEFT', textFormat: txt(MUTED, { size: 9 }), wrapStrategy: 'OVERFLOW_CELL' }, TODO),

    // ── LAS TRES TARJETAS. Rótulo chico y apagado · cifra grande en el acento · pie chico ────────
    // La jerarquía es la del repo (`slides/marca.mjs`: kpiRotulo 9 · kpiValor 30 · kpiNota 9,5), a
    // escala de planilla. Con el rótulo y la cifra del mismo cuerpo, la pestaña no tiene titular.
    fmt(g.fRot - 1, g.fRot, 0, COLS, { textFormat: txt(MUTED, { bold: true, size: 9 }), horizontalAlignment: 'LEFT' }, 'userEnteredFormat(textFormat,horizontalAlignment)'),
    fmt(g.fCif - 1, g.fCif, 0, 1, { numberFormat: money, horizontalAlignment: 'LEFT', textFormat: txt(ACENTO, { bold: true, size: 20 }) }, 'userEnteredFormat(numberFormat,horizontalAlignment,textFormat)'),
    fmt(g.fCif - 1, g.fCif, 2, 3, { numberFormat: dolar, horizontalAlignment: 'LEFT', textFormat: txt(ACENTO, { bold: true, size: 20 }) }, 'userEnteredFormat(numberFormat,horizontalAlignment,textFormat)'),
    // El estado es TEXTO y va un cuerpo abajo de las dos cifras: es la respuesta a una pregunta, no
    // un importe, y con el mismo tamaño competiría con lo que hay que pagar.
    fmt(g.fCif - 1, g.fCif, 5, 6, { numberFormat: { type: 'TEXT' }, horizontalAlignment: 'LEFT', textFormat: txt(ACENTO, { bold: true, size: 14 }), wrapStrategy: 'OVERFLOW_CELL' }, TODO),
    fmt(g.fCif, g.fCif + 1, 0, COLS, { numberFormat: { type: 'TEXT' }, textFormat: txt(MUTED, { size: 9 }), horizontalAlignment: 'LEFT', wrapStrategy: 'OVERFLOW_CELL' }, TODO),

    // ── LA PISTA DERECHA, que la piel no ve porque mira la columna A ────────────────────────────
    ...g.titulosDer.map((f) => fmt(f - 1, f, 5, 6, { textFormat: txt(INK, { bold: true, size: 10 }) }, 'userEnteredFormat.textFormat')),
    ...g.encabezadosDer.map((f) => fmt(f - 1, f, 5, 8, { textFormat: txt(MUTED, { bold: true, size: 9 }) }, 'userEnteredFormat.textFormat')),
    ...g.encabezadosDer.map((f) => ({ updateBorders: { range: rg(f - 1, f, 5, 8), bottom: { style: 'SOLID', width: 1, color: HAIR } } })),

    // ── LOS DÓLARES, EN DÓLARES. Con el formato de pesos, U$S 544,99 se lee "$545": el mismo símbolo
    //    para dos monedas invita a sumarlas, y son obligaciones que se cancelan por separado. ──────
    ...g.usd.map((f) => fmt(f - 1, f, 1, 2, { numberFormat: dolar, horizontalAlignment: 'RIGHT' }, 'userEnteredFormat(numberFormat,horizontalAlignment)')),
    ...g.usdDer.map((f) => fmt(f - 1, f, 6, 7, { numberFormat: dolar, horizontalAlignment: 'RIGHT' }, 'userEnteredFormat(numberFormat,horizontalAlignment)')),

    // ── Anchos. La banda y el registro comparten las columnas, así que cada ancho sirve a los dos:
    //    A rótulo / fecha de compra · B monto · C contexto / proveedor · E monto del registro ──────
    ...[[0, 300], [1, 120], [2, 150], [3, 70], [4, 110], [5, 240], [6, 120], [7, 175]]
      .map(([i, px]) => ({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: i, endIndex: i + 1 }, properties: { pixelSize: px }, fields: 'pixelSize' } })),

    // El encabezado del registro, con la misma versalita apagada que los de la banda.
    fmt(FILA_HDR - 1, FILA_HDR, 0, COLS, { backgroundColor: { red: 1, green: 1, blue: 1 }, textFormat: txt(MUTED, { bold: true, size: 9 }), horizontalAlignment: 'LEFT' }, 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)'),
    { updateBorders: { range: rg(FILA_HDR - 1, FILA_HDR, 0, COLS), bottom: { style: 'SOLID', width: 1, color: HAIR } } },
    fmt(FILA_HDR, FILA_HDR + 400, 0, 1, { textFormat: txt(INK, { size: 10 }) }, 'userEnteredFormat.textFormat'),
  ]
  await google.spreadsheetBatchUpdate(ID, reqs)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(e); process.exitCode = 1 })
}
