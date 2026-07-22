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
//   node orquestador/scripts/cobranzas-por-cliente.mjs [--dry]

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import * as E from '../lib/estilo-pestana.mjs'
import { COL, FIN, INICIO, filaCliente, formulaClientes } from '../lib/cobranzas-por-cliente.mjs'
import { escribirPreservando } from '../lib/preservar-anotaciones.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const PESTAÑA = 'Cobranzas'
const DRY = process.argv.includes('--dry')

// Dónde vive el cuadro. La primera columna es AC (índice 28).
const C0 = 28
const F_TITULO = 62, F_CAB = 64, F_0 = 65
/** Cuántos clientes entran antes de que haya que agrandar el cuadro. Hoy son 7. */
const CAPACIDAD = 25
const F_TOTAL = F_0 + CAPACIDAD

const L = (j) => { let s = ''; for (let n = j; n >= 0; n = Math.floor(n / 26) - 1) s = String.fromCharCode(65 + (n % 26)) + s; return s }
const COLS = { cliente: L(C0), canonico: L(C0 + 1), facturas: L(C0 + 2), facturado: L(C0 + 3), cobrado: L(C0 + 4), pendiente: L(C0 + 5), porc: L(C0 + 6), dias: L(C0 + 7) }
const r = (col) => `$${col}$${INICIO}:$${col}$${FIN}`

/**
 * NÚCLEO PURO: los días promedio entre la emisión y el cobro, de los cobros REALMENTE cobrados.
 * Antes se calculaba sobre "los que tienen fecha de cobro", que incluye las proyecciones: mezclaba
 * un plazo real con uno deseado.
 */
export function formulaDias(celdaCliente) {
  const cond = celdaCliente
    ? `(${r(COL.cliente.slice(1))}=${celdaCliente})*`
    : ''
  const est = `(${r(COL.estado.slice(1))}="Cobrado")`
  const num = `SUMPRODUCT(${cond}${est}*ISNUMBER($Q$${INICIO}:$Q$${FIN})*ISNUMBER($C$${INICIO}:$C$${FIN})*($Q$${INICIO}:$Q$${FIN}-$C$${INICIO}:$C$${FIN}))`
  const den = `SUMPRODUCT(${cond}${est}*ISNUMBER($Q$${INICIO}:$Q$${FIN})*ISNUMBER($C$${INICIO}:$C$${FIN}))`
  return `=IFERROR(ROUND(${num}/${den};0);"")`
}

/** NÚCLEO PURO: la grilla completa del cuadro, lista para escribir. */
export function grilla() {
  const filas = []
  filas.push(['COBRANZAS POR CLIENTE — todo fórmula sobre las filas de arriba, no una copia'])
  filas.push([`La lista de clientes sale sola de la columna "Obra / Cliente": un cliente nuevo aparece acá sin tocar nada. Se lee hasta la fila ${FIN}. "Cobrado" es lo que dice la columna Estado —no que tenga fecha—, así que PENDIENTE es deuda de verdad.`])
  filas.push(['Cliente', 'Nombre canónico', 'Facturas', 'Facturado', 'Cobrado', 'PENDIENTE', '% del total', 'Días prom. de cobro'])

  for (let i = 0; i < CAPACIDAD; i++) {
    const f = F_0 + i
    const cel = `$${COLS.cliente}${f}`
    const vacio = `IF(${cel}="";"";`
    if (i === 0) {
      // La lista entera derrama desde la primera celda. Las demás filas quedan vacías a propósito:
      // escribir algo abajo cortaría el derrame con un #REF! de "hay datos en el camino".
      filas.push([formulaClientes()])
    } else {
      filas.push([''])
    }
    const c = filaCliente(cel, `$${COLS.facturado}$${F_TOTAL}`, { facturado: `$${COLS.facturado}`, cobrado: `$${COLS.cobrado}` }, f)
    const fila = filas[filas.length - 1]
    fila[1] = `=${vacio}${cel})`
    fila[2] = `=${vacio}${c.facturas.slice(1)})`
    fila[3] = `=${vacio}${c.facturado.slice(1)})`
    fila[4] = `=${vacio}${c.cobrado.slice(1)})`
    fila[5] = `=${vacio}${c.pendiente.slice(1)})`
    fila[6] = `=${vacio}${c.porcentaje.slice(1)})`
    fila[7] = `=${vacio}${formulaDias(cel).slice(1)})`
  }

  filas.push(['TOTAL', '',
    `=SUM(${COLS.facturas}${F_0}:${COLS.facturas}${F_TOTAL - 1})`,
    `=SUM(${COLS.facturado}${F_0}:${COLS.facturado}${F_TOTAL - 1})`,
    `=SUM(${COLS.cobrado}${F_0}:${COLS.cobrado}${F_TOTAL - 1})`,
    `=SUM(${COLS.pendiente}${F_0}:${COLS.pendiente}${F_TOTAL - 1})`,
    '', formulaDias(null)])

  // EL CONTROL: la suma del cuadro tiene que ser la suma de la pestaña. Si el rango vuelve a
  // quedarse corto —o alguien carga un cliente con el nombre en blanco— este número deja de ser $0.
  filas.push([])
  filas.push(['⇒ Control: ¿el cuadro ve TODA la pestaña?', '', '',
    `=SUM(${r(COL.total.slice(1))})-${COLS.facturado}${F_TOTAL}`, '', '', '',
    'Tiene que ser $0. Distinto de cero = hay cobros cargados que este cuadro no está mirando.'])
  return filas
}

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  const hojas = await google.getSheetMeta(ID)
  const hoja = hojas.find((h) => h.title === PESTAÑA)
  if (!hoja) throw new Error(`no encontré la pestaña ${PESTAÑA}`)

  const filas = grilla()
  const ancho = filas.reduce((m, f) => Math.max(m, f.length), 0)
  if (ancho > 8) throw new Error(`la grilla salió de ${ancho} columnas y el cuadro tiene 8: NO escribo`)
  console.log(`cuadro por cliente: ${CAPACIDAD} filas de capacidad, total en la ${F_TOTAL}, lee Cobranzas hasta la ${FIN}`)
  if (DRY) return console.log('--dry: no escribí nada.')

  // Se limpia SÓLO el bloque del cuadro, nunca las columnas de carga del dueño (A:AA).
  const desde = `${L(C0)}${F_TITULO}`, hasta = `${L(C0 + 7)}${F_TOTAL + 3}`
  // TÍTULO en F_TITULO, nota debajo, encabezado en F_CAB y los datos desde F_0. Las filas van
  // consecutivas: una fila en blanco de más acá desplaza TODO el cuadro y las fórmulas —que
  // referencian F_0 por número— quedan apuntando a la fila de arriba. Pasó, y el cuadro mostró la
  // deuda de cada cliente corrida un renglón.
  if (F_CAB - F_TITULO !== 2 || F_0 - F_CAB !== 1) throw new Error('las filas del cuadro no son consecutivas: revisar F_TITULO/F_CAB/F_0')
  // Se FUSIONA el bloque en vez de limpiarlo: nada escrito por una persona se borra.
  const cp = await escribirPreservando(google, ID, PESTAÑA, [filas[0], filas[1], filas[2], ...filas.slice(3)], { fila0: F_TITULO, col0: C0 })
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
  const control = v[2]?.[3]
  console.log(`Control (tiene que ser $0): ${control}`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
}
