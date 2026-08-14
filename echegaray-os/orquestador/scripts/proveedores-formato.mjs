#!/usr/bin/env node
// EL FORMATO DE TODOS LOS CUADROS DE Proveedores — reparado por cómo se VEN los vecinos.
//
// ═══ EL PEDIDO (04/08), TEXTUAL ═══
//
// "revisa todo el formato de todos los cuadro de toda la pestaña proveedores y arreglalos, son un
// desastre"
//
// El criterio de qué está mal y con qué patrón se repara vive en `lib/formato-por-vecinos.mjs`, con
// sus tests: acá sólo está el recorrido de la pestaña y la escritura. Ese reparto importa — la
// primera versión de este script decidía por `userEnteredFormat` y estuvo a un paso de convertir 25
// FECHAS en pesos, porque la API no devuelve el formato de una celda que lo hereda. El detector se
// arregló donde se puede probar sin tocar el Sheet.
//
// ═══ LO QUE NO TOCA ═══
//
// Ningún VALOR: sólo `numberFormat` y `horizontalAlignment`. Ninguna celda de texto — los CUIT de la
// columna B de la sección 2 son texto y se quedan así: un CUIT con formato de número perdería el
// guión y los ceros a la izquierda.
//
//   node orquestador/scripts/proveedores-formato.mjs            → lista los defectos
//   node orquestador/scripts/proveedores-formato.mjs --aplicar  → repara y vuelve a auditar

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { reparacionesDeColumna, residuosEnTotales } from '../lib/formato-por-vecinos.mjs'
import { ALERTA, ALERTA_HEREDADA } from '../lib/glifos.mjs'

/** Un título de cuadro puede abrir con la alerta. Las DOS: la pestaña tiene publicada la vieja. */
const ABRE_CON_ALERTA = new RegExp(`^[${ALERTA}${ALERTA_HEREDADA}]\\s`)

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const PESTAÑA = 'Proveedores'
const APLICAR = process.argv.includes('--aplicar')
const FILAS = 220
const COLS = 14

const letra = (i) => { let s = ''; for (let n = i; n >= 0; n = Math.floor(n / 26) - 1) s = String.fromCharCode(65 + (n % 26)) + s; return s }

/**
 * LOS CUADROS SE UBICAN POR SUS TÍTULOS, NO POR NÚMERO DE FILA. Los títulos ("1 · …", "⚠ …") los
 * escribió el dueño y son lo único estable de la pestaña: si mañana inserta filas arriba, un tramo
 * cableado repararía el cuadro equivocado. Y el tramo importa — la clase de cada columna se vota
 * dentro de SU cuadro, porque la columna C es "Comprobantes" en la sección 2 y "Fecha" en la 3.
 *
 * @returns {Array<{titulo:string, desde:number, hasta:number}>} filas 1-based, `hasta` exclusivo
 */
export function cuadrosPorTitulo(valores = []) {
  const marcas = []
  for (let r = 0; r < valores.length; r++) {
    const t = String(valores[r]?.[0] ?? '').trim()
    if (/^\d+\s*[·.\-]\s*\S/.test(t) || ABRE_CON_ALERTA.test(t)) marcas.push({ titulo: t.slice(0, 55), desde: r + 1 })
  }
  if (!marcas.length) throw new Error('no encontré ningún título de cuadro: la pestaña cambió de forma')
  return marcas.map((m, k) => ({ ...m, hasta: marcas[k + 1]?.desde ?? valores.length + 1 }))
}

/** Todas las reparaciones de la pestaña, cuadro por cuadro y columna por columna. */
export function auditar(valores, vistos) {
  const pedidos = []
  for (const cuadro of cuadrosPorTitulo(valores)) {
    for (let c = 0; c < COLS; c++) {
      const tramo = []
      for (let f = cuadro.desde; f < cuadro.hasta; f++) {
        tramo.push({ fila: f, valor: valores[f - 1]?.[c], visto: vistos[f - 1]?.[c] })
      }
      for (const r of reparacionesDeColumna(tramo)) {
        pedidos.push({ ...r, col: c, dir: `${letra(c)}${r.fila}`, cuadro: cuadro.titulo })
      }
    }
  }
  return pedidos
}

/** Una petición por celda: sólo formato, nunca el valor. Los números van a la derecha (es donde la
 *  coma se alinea y las magnitudes se comparan de un vistazo); las fechas también. */
function pedidoDeCelda(sheetId, r) {
  return { repeatCell: {
    range: { sheetId, startRowIndex: r.fila - 1, endRowIndex: r.fila, startColumnIndex: r.col, endColumnIndex: r.col + 1 },
    cell: { userEnteredFormat: { numberFormat: { type: r.clase === 'fecha' ? 'DATE' : 'NUMBER', pattern: r.patron }, horizontalAlignment: 'RIGHT' } },
    fields: 'userEnteredFormat.numberFormat,userEnteredFormat.horizontalAlignment' } }
}

/** Las filas de total de la pestaña, con lo necesario para distinguir un total de un residuo. */
export function residuos(valores, formulas) {
  const filas = valores.map((fila, r) => ({
    fila: r + 1,
    rotulo: fila?.[0],
    celdas: Array.from({ length: COLS }, (_, c) => ({ col: c, valor: fila?.[c], formula: formulas[r]?.[c] })),
  }))
  return residuosEnTotales(filas).map((x) => ({ ...x, dir: `${letra(x.col)}${x.fila}` }))
}

/** Borrar SÓLO el valor: el formato de la fila de total (negrita, bordes) se queda como está. */
const borrarValor = (sheetId, r) => ({ updateCells: {
  range: { sheetId, startRowIndex: r.fila - 1, endRowIndex: r.fila, startColumnIndex: r.col, endColumnIndex: r.col + 1 },
  rows: [{ values: [{ userEnteredValue: null }] }], fields: 'userEnteredValue' } })

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  const rango = `${PESTAÑA}!A1:${letra(COLS - 1)}${FILAS}`
  const leer = async () => ({
    valores: await google.readSheetValues(ID, rango, { render: 'UNFORMATTED_VALUE' }),
    vistos: await google.readSheetValues(ID, rango),
    formulas: await google.readSheetValues(ID, rango, { render: 'FORMULA' }),
  })
  const hoy = await leer()

  const pedidos = auditar(hoy.valores, hoy.vistos)
  const basura = residuos(hoy.valores, hoy.formulas)
  console.log(`${pedidos.length} celda(s) se ven crudas, en ${new Set(pedidos.map((p) => p.cuadro)).size} cuadro(s)`)
  for (const p of pedidos) console.log(`  ${p.dir.padEnd(6)} se ve "${p.visto}" → ${p.clase}   [${p.cuadro}]`)
  console.log(`${basura.length} residuo(s) en filas de total`)
  for (const b of basura) console.log(`  ${b.dir.padEnd(6)} "${b.valor}" en una fila de total — un total no afirma eso`)
  if (!pedidos.length && !basura.length) { console.log('✓ ningún cuadro tiene el formato saltado ni residuos'); return }
  if (!APLICAR) { console.log('\n(sin --aplicar: no se escribió nada)'); return }

  const meta = await google.getSheetMeta(ID)
  const sheetId = meta.find((s) => s.title === PESTAÑA)?.sheetId
  if (!Number.isInteger(sheetId)) throw new Error(`no encontré el sheetId de ${PESTAÑA}`)
  await google.spreadsheetBatchUpdate(ID,
    [...pedidos.map((p) => pedidoDeCelda(sheetId, p)), ...basura.map((b) => borrarValor(sheetId, b))], { espejo: true })

  // La evidencia es el archivo releído, no la respuesta de la API.
  const luego = await leer()
  const quedan = auditar(luego.valores, luego.vistos)
  const quedaBasura = residuos(luego.valores, luego.formulas)
  console.log(`\nRELEÍDO DEL ARCHIVO: ${quedan.length} celda(s) crudas · ${quedaBasura.length} residuo(s)`)
  for (const q of [...quedan, ...quedaBasura]) console.log(`  ⚠ ${q.dir}`)
  if (quedan.length || quedaBasura.length) process.exitCode = 1
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(e); process.exit(1) })
}
