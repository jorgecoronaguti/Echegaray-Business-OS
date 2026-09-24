#!/usr/bin/env node
// EL CUADRO DE DEUDA POR CLIENTE, MANTENIDO POR EL OS.
//
// POR QUÉ EXISTE (21/07). El dueño: "hay montos que salen en Cobranzas que tienen fechas
// actualizadas y no se están viendo reflejados los cambios". Los dos cash flows resultaron
// impecables —se verificó mes a mes contra la pestaña, al peso, con
// scripts/auditar-cobranzas-en-cashflow.mjs—. El roto era este cuadro, y ningún script lo escribía:
// alguien lo dejó una vez y quedó fosilizado con los rangos de ese día.
//
// LOS DOS DEFECTOS, los dos silenciosos (ver lib/cobranzas-por-cliente.mjs):
//   · leía hasta la fila 58 y hay datos hasta la 60 → $4.435.450 de ARCOR fuera del cuadro;
//   · contaba como "cobrado" todo lo que tuviera fecha, y una proyección también tiene fecha → la
//     columna PENDIENTE mostraba $0 con $76.000.000 sin cobrar.
//
// LO QUE CAMBIA DE FONDO: la lista de clientes deja de estar escrita a mano. Sale de UNIQUE sobre la
// columna, así que un cliente nuevo aparece solo. Un cuadro que hay que editar a mano cada vez que
// entra un cliente es un cuadro que va a estar mal la mayor parte del tiempo.
//
// ═══ DÓNDE ESTÁ EL CUADRO Y QUÉ COLUMNAS LEE: POR RÓTULO (14/09/2026) ═══
//
// El cuadro vivía en `C0 = 28` (AC) y leía $G/$M/$O/$Q/$C. Al insertar «Obra» en H, Google corre el
// cuadro entero a AD y las columnas de Cobranzas una letra. Con la columna fija, la corrida siguiente
// habría escrito un segundo cuadro en AC —encima de la columna ya corrida del primero— con fórmulas
// que suman las retenciones. Ahora el cuadro se ubica por SU encabezado (fila 64) y las columnas de
// Cobranzas por la fila 4, las dos leídas en esta corrida.
//
//   node orquestador/scripts/cobranzas-por-cliente.mjs [--dry]

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import * as E from '../lib/estilo-pestana.mjs'
import { COLUMNAS_CUADRO, FIN, filaCliente, formulaClientes, formulaControlTotal, rangoCuadro } from '../lib/cobranzas-por-cliente.mjs'
import { escribirPreservando } from '../lib/preservar-anotaciones.mjs'
import { exigirColumnas, leerColumnasCobranzas } from '../lib/cobranzas-columnas.mjs'
import { rangoFilas } from '../lib/columnas-por-encabezado.mjs'
import { letra as L, normalizarRotulo } from '../lib/compras-columnas.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const PESTAÑA = 'Cobranzas'
const DRY = process.argv.includes('--dry')

const F_TITULO = 62, F_CAB = 64, F_0 = 65
/** Cuántos clientes entran antes de que haya que agrandar el cuadro. Hoy son 7. */
const CAPACIDAD = 25
const F_TOTAL = F_0 + CAPACIDAD
/** El encabezado del propio cuadro: es lo que lo ubica en la pestaña. */
export const ENCABEZADO_CUADRO = Object.freeze(['Cliente', 'Nombre canónico', 'Facturas', 'Facturado', 'Cobrado', 'PENDIENTE', '% del total', 'Días prom. de cobro'])

/**
 * NÚCLEO PURO: la primera columna del cuadro, buscada por su encabezado en la fila `F_CAB`.
 * Se exige el PAR «Cliente» · «Nombre canónico»: «Cliente» solo podría ser un dato de la pestaña.
 */
export function ubicarCuadro(filaCab = []) {
  const n = filaCab.map(normalizarRotulo)
  const [a, b] = ENCABEZADO_CUADRO.slice(0, 2).map(normalizarRotulo)
  const hits = n.flatMap((c, i) => (c === a && n[i + 1] === b ? [i] : []))
  if (hits.length !== 1) {
    const que = hits.length ? `aparece ${hits.length} veces` : 'no está'
    throw new Error(`${PESTAÑA}: el encabezado del cuadro por cliente («Cliente» · «Nombre canónico») ${que} en la fila ${F_CAB}. No uso una columna de respaldo.`)
  }
  return hits[0]
}

/**
 * NÚCLEO PURO: las columnas de DATOS de la pestaña (con rótulo en la fila 4) que el cuadro taparía si
 * se escribiera empezando en `c0`. Vacío = el cuadro está en tierra de nadie y se puede escribir.
 */
export function columnasDeDatosBajoElCuadro(fila4 = [], c0) {
  return fila4.slice(c0, c0 + ENCABEZADO_CUADRO.length)
    .map((t, j) => (String(t ?? '').trim() ? `${L(c0 + j)}4 «${String(t).trim()}»` : null))
    .filter(Boolean)
}

/**
 * NÚCLEO PURO: los días promedio entre la emisión y el cobro, de los cobros REALMENTE cobrados.
 * Antes se calculaba sobre "los que tienen fecha de cobro", que incluye las proyecciones: mezclaba
 * un plazo real con uno deseado.
 */
export function formulaDias(celdaCliente, cob) {
  const { cliente, estado, fechaCobro, fechaVenta } = exigirColumnas(cob, COLUMNAS_CUADRO, 'formulaDias')
  const [Q, C] = [rangoCuadro(fechaCobro), rangoCuadro(fechaVenta)]
  const cond = celdaCliente ? `(${rangoCuadro(cliente)}=${celdaCliente})*` : ''
  const est = `(${rangoCuadro(estado)}="Cobrado")`
  const num = `SUMPRODUCT(${cond}${est}*ISNUMBER(${Q})*ISNUMBER(${C})*(${Q}-${C}))`
  const den = `SUMPRODUCT(${cond}${est}*ISNUMBER(${Q})*ISNUMBER(${C}))`
  return `=IFERROR(ROUND(${num}/${den};0);"")`
}

/**
 * NÚCLEO PURO: la grilla completa del cuadro, lista para escribir.
 * @param {Record<string,{letra:string}>} cob columnas de Cobranzas resueltas por la fila 4
 * @param {number} c0 índice de la primera columna del cuadro, de `ubicarCuadro`
 */
export function grilla(cob, c0) {
  exigirColumnas(cob, COLUMNAS_CUADRO, 'grilla')
  if (!Number.isInteger(c0) || c0 < 0) throw new Error('grilla: falta la columna del cuadro ubicada por su encabezado')
  const COLS = { cliente: L(c0), facturas: L(c0 + 2), facturado: L(c0 + 3), cobrado: L(c0 + 4), pendiente: L(c0 + 5) }
  const filas = []
  filas.push(['COBRANZAS POR CLIENTE — todo fórmula sobre las filas de arriba, no una copia'])
  filas.push([`La lista de clientes sale sola de la columna "Obra / Cliente": un cliente nuevo aparece acá sin tocar nada. Se lee hasta la fila ${FIN}. "Cobrado" es lo que dice la columna Estado —no que tenga fecha—, así que PENDIENTE es deuda de verdad.`])
  filas.push([...ENCABEZADO_CUADRO])

  for (let i = 0; i < CAPACIDAD; i++) {
    const f = F_0 + i
    const cel = `$${COLS.cliente}${f}`
    const vacio = `IF(${cel}="";"";`
    // La lista entera derrama desde la primera celda. Las demás filas quedan vacías a propósito:
    // escribir algo abajo cortaría el derrame con un #REF! de "hay datos en el camino".
    filas.push([i === 0 ? formulaClientes(cob) : ''])
    const c = filaCliente(cel, `$${COLS.facturado}$${F_TOTAL}`, { facturado: `$${COLS.facturado}`, cobrado: `$${COLS.cobrado}` }, f, cob)
    const fila = filas[filas.length - 1]
    fila[1] = `=${vacio}${cel})`
    fila[2] = `=${vacio}${c.facturas.slice(1)})`
    fila[3] = `=${vacio}${c.facturado.slice(1)})`
    fila[4] = `=${vacio}${c.cobrado.slice(1)})`
    fila[5] = `=${vacio}${c.pendiente.slice(1)})`
    fila[6] = `=${vacio}${c.porcentaje.slice(1)})`
    fila[7] = `=${vacio}${formulaDias(cel, cob).slice(1)})`
  }

  filas.push(['TOTAL', '',
    `=SUM(${COLS.facturas}${F_0}:${COLS.facturas}${F_TOTAL - 1})`,
    `=SUM(${COLS.facturado}${F_0}:${COLS.facturado}${F_TOTAL - 1})`,
    `=SUM(${COLS.cobrado}${F_0}:${COLS.cobrado}${F_TOTAL - 1})`,
    `=SUM(${COLS.pendiente}${F_0}:${COLS.pendiente}${F_TOTAL - 1})`,
    '', formulaDias(null, cob)])

  // EL CONTROL: la suma del cuadro tiene que ser la suma de la pestaña. Si el rango vuelve a
  // quedarse corto —o alguien carga un cliente con el nombre en blanco— este número deja de ser $0.
  filas.push([])
  filas.push(['⇒ Control: ¿el cuadro ve TODA la pestaña?', '', '',
    formulaControlTotal(cob, `${COLS.facturado}${F_TOTAL}`), '', '', '',
    'Tiene que ser $0. Distinto de cero = hay cobros cargados que este cuadro no está mirando.'])
  return filas
}

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  const hojas = await google.getSheetMeta(ID)
  const hoja = hojas.find((h) => h.title === PESTAÑA)
  if (!hoja) throw new Error(`no encontré la pestaña ${PESTAÑA}`)

  // Las dos filas de rótulos de esta corrida: la de la pestaña y la del propio cuadro.
  const cob = await leerColumnasCobranzas(google, ID, COLUMNAS_CUADRO)
  const [filaCab = []] = await google.readSheetValues(ID, rangoFilas(PESTAÑA, F_CAB, F_CAB))
  const C0 = ubicarCuadro(filaCab)
  // ═══ EL CUADRO NO PUEDE VIVIR SOBRE UNA COLUMNA DE DATOS (24/09/2026) ═══
  //
  // Medido en vivo: el encabezado del cuadro está en AD64 y AD4 dice «Asignación» —una columna de
  // carga del dueño, con valores en las filas 20 a 47—, y el filtro básico de la pestaña (A4:AH) cubre
  // AD:AH. Ordenar o filtrar los cobros mueve y oculta pedazos del cuadro; así se perdió la fórmula de
  // AD65 y el cuadro quedó mostrando cero. Escribirlo ahí de nuevo sería pisarle la columna al dueño:
  // se niega, y dónde vive el cuadro lo decide él.
  const [fila4 = []] = await google.readSheetValues(ID, rangoFilas(PESTAÑA, 4, 4))
  const pisadas = columnasDeDatosBajoElCuadro(fila4, C0)
  if (pisadas.length) throw new Error(`el cuadro por cliente caería sobre columnas de datos de ${PESTAÑA} (${pisadas.join(', ')}): NO escribo. Hay que mudarlo fuera de la zona de carga y del filtro.`)

  const filas = grilla(cob, C0)
  const ancho = filas.reduce((m, f) => Math.max(m, f.length), 0)
  if (ancho > 8) throw new Error(`la grilla salió de ${ancho} columnas y el cuadro tiene 8: NO escribo`)
  console.log(`cuadro por cliente en ${L(C0)}: ${CAPACIDAD} filas de capacidad, total en la ${F_TOTAL}, lee Cobranzas ${cob.cliente.letra}/${cob.total.letra}/${cob.estado.letra} hasta la ${FIN}`)
  if (DRY) return console.log('--dry: no escribí nada.')

  // TÍTULO en F_TITULO, nota debajo, encabezado en F_CAB y los datos desde F_0. Las filas van
  // consecutivas: una fila en blanco de más acá desplaza TODO el cuadro y las fórmulas —que
  // referencian F_0 por número— quedan apuntando a la fila de arriba. Pasó, y el cuadro mostró la
  // deuda de cada cliente corrida un renglón.
  if (F_CAB - F_TITULO !== 2 || F_0 - F_CAB !== 1) throw new Error('las filas del cuadro no son consecutivas: revisar F_TITULO/F_CAB/F_0')
  // Se FUSIONA el bloque en vez de limpiarlo: nada escrito por una persona se borra.
  const cp = await escribirPreservando(google, ID, PESTAÑA, filas, { fila0: F_TITULO, col0: C0 })
  if (cp.conservadas.length) console.log(`  ✋ ${cp.conservadas.length} celda(s) de una persona — CONSERVADAS`)

  const rg = (r0, r1, c0, c1) => ({ sheetId: hoja.sheetId, startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1 })
  await google.spreadsheetBatchUpdate(ID, [
    { repeatCell: { range: rg(F_TITULO - 1, F_TITULO, C0, C0 + 8), cell: { userEnteredFormat: E.titulo() }, fields: 'userEnteredFormat' } },
    { repeatCell: { range: rg(F_TITULO, F_TITULO + 1, C0, C0 + 8), cell: { userEnteredFormat: E.nota() }, fields: 'userEnteredFormat' } },
    { repeatCell: { range: rg(F_CAB - 1, F_CAB, C0, C0 + 8), cell: { userEnteredFormat: E.encabezado() }, fields: 'userEnteredFormat' } },
    { repeatCell: { range: rg(F_0 - 1, F_TOTAL, C0 + 2, C0 + 3), cell: { userEnteredFormat: E.celda('cantidad') }, fields: 'userEnteredFormat(numberFormat,textFormat,horizontalAlignment)' } },
    { repeatCell: { range: rg(F_0 - 1, F_TOTAL, C0 + 3, C0 + 6), cell: { userEnteredFormat: E.celda('moneda') }, fields: 'userEnteredFormat(numberFormat,textFormat,horizontalAlignment)' } },
    { repeatCell: { range: rg(F_0 - 1, F_TOTAL, C0 + 6, C0 + 7), cell: { userEnteredFormat: E.celda('porcentaje') }, fields: 'userEnteredFormat(numberFormat,textFormat,horizontalAlignment)' } },
    { repeatCell: { range: rg(F_0 - 1, F_TOTAL, C0 + 7, C0 + 8), cell: { userEnteredFormat: E.celda('dias') }, fields: 'userEnteredFormat(numberFormat,textFormat,horizontalAlignment)' } },
    { repeatCell: { range: rg(F_TOTAL - 1, F_TOTAL, C0, C0 + 8), cell: { userEnteredFormat: E.total() }, fields: 'userEnteredFormat' } },
  ])

  // VERIFICACIÓN CONTRA EL SHEET, no contra lo que creo que escribí.
  const v = await google.readSheetValues(ID, `${PESTAÑA}!${L(C0)}${F_TOTAL}:${L(C0 + 7)}${F_TOTAL + 2}`)
  console.log(`TOTAL   facturas ${v[0]?.[2]} · facturado ${v[0]?.[3]} · cobrado ${v[0]?.[4]} · PENDIENTE ${v[0]?.[5]} · ${v[0]?.[7]} días`)
  console.log(`Control (tiene que ser $0): ${v[2]?.[3]}`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
}
