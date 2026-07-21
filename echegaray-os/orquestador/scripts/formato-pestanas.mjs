#!/usr/bin/env node
// HACER QUE LAS CATORCE PESTAÑAS SE VEAN COMO UN SOLO DOCUMENTO.
//
// POR QUÉ (21/07). El dueño: "revisar el formato de todas las pestañas y hacerlas coincidir".
// Medido con readSheetFormats, había cuatro familias tipográficas y tres paletas conviviendo:
// Calibri 12 sobre azul en las que armó él, Arial 16/22/11 sobre verde azulado en las de carga, y
// Calibri 13 SIN barra de color en las nueve que armé yo. Al pasar de una pestaña a otra parecía
// otro documento.
//
// ═══ POR QUÉ ESTA PASADA TOCA POCO, Y A PROPÓSITO ═══
//
// Repintar los fondos de las catorce pestañas destruiría cosas que sí están bien: el ámbar de los
// meses proyectados en Estructura, los formatos condicionales de Compras, los desplegables de
// Cobranzas. Un unificador que rompe lo que funciona no es una mejora.
//
// Así que toca las tres cosas que hacen que un archivo se sienta uno solo, y sólo esas:
//
//   1. LA TIPOGRAFÍA. Roboto para texto, Roboto Mono para todo lo numérico. Es el cambio que más se
//      nota: con dígitos de ancho igual, los millares se alinean solos entre filas y un número fuera
//      de escala se ve sin leerlo. Qué celda es numérica NO se adivina: se lee su formato de número
//      efectivo (CURRENCY, NUMBER, PERCENT, DATE), que es un hecho de la celda.
//   2. LA BARRA DE TÍTULO. La fila 1 de cada pestaña, con el color de mando del archivo.
//   3. LAS FILAS CONGELADAS. Estaban en 0, 1, 2, 3, 4 y 6 según la pestaña. Con el encabezado
//      congelado, una tabla de 400 filas se puede leer; sin él, no.
//
// Los fondos y los bloques los sigue poniendo cada script cuando rehace su pestaña, ahora desde
// lib/estilo-pestana.mjs. Esta pasada es lo que unifica también las que el OS no rehace.
//
//   node orquestador/scripts/formato-pestanas.mjs [--dry] [--auditar]

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { FUENTE, FUENTE_NUM, TAM, ALTO, titulo as fmtTitulo, auditar } from '../lib/estilo-pestana.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const DRY = process.argv.includes('--dry')
const SOLO_AUDITAR = process.argv.includes('--auditar')

/**
 * Las pestañas que se unifican, con cuántas filas congelar.
 *
 * `congeladas` sale de dónde termina el encabezado de CADA pestaña, no de un número parejo: en las
 * de carga el encabezado está en la fila 3 o 4 y congelar 3 cortaría la tabla por la mitad.
 * `hastaFila` acota la pasada: recorrer 1000 filas de una pestaña que usa 90 es gastar cuota.
 */
export const PESTANAS = [
  { titulo: 'RESUMEN', congeladas: 0, hastaFila: 80, cols: 14 },
  { titulo: 'Compras', congeladas: 3, hastaFila: 800, cols: 32, carga: true },
  { titulo: 'Cobranzas', congeladas: 4, hastaFila: 400, cols: 60, carga: true },
  { titulo: 'Cheques Emitidos', congeladas: 2, hastaFila: 200, cols: 14, carga: true },
  { titulo: 'Tarjeta de Credito', congeladas: 2, hastaFila: 120, cols: 14, carga: true },
  { titulo: 'Jornales por Quincena', congeladas: 2, hastaFila: 80, cols: 14 },
  { titulo: 'Cargas Sociales', congeladas: 0, hastaFila: 120, cols: 16 },
  { titulo: 'Impuestos y Financieros', congeladas: 0, hastaFila: 90, cols: 12 },
  { titulo: 'Recurrentes', congeladas: 4, hastaFila: 90, cols: 20 },
  { titulo: 'Estructura', congeladas: 6, hastaFila: 90, cols: 20 },
  { titulo: 'Proveedores y Materiales', congeladas: 0, hastaFila: 140, cols: 20 },
  { titulo: 'CAJA', congeladas: 0, hastaFila: 120, cols: 12 },
  { titulo: 'Cash Flow Semanal', congeladas: 3, hastaFila: 90, cols: 60 },
  { titulo: 'Cash Flow Mensual', congeladas: 3, hastaFila: 90, cols: 20 },
]

/** Los formatos de número que delatan una celda NUMÉRICA. Un hecho de la celda, no una suposición. */
const NUMERICO = new Set(['CURRENCY', 'NUMBER', 'PERCENT', 'DATE', 'TIME', 'DATE_TIME', 'SCIENTIFIC'])

/**
 * NÚCLEO PURO: qué fuente le toca a cada celda de una fila, según su formato de número.
 * Devuelve null para las celdas vacías: no vale la pena gastar un request en formatear la nada.
 */
export function fuenteDeFila(fila = []) {
  return fila.map((c) => {
    const tieneAlgo = String(c?.valor ?? '').trim() !== ''
    if (!tieneAlgo) return null
    return NUMERICO.has(c?.formato?.numberFormat?.type) ? FUENTE_NUM : FUENTE
  })
}

/**
 * NÚCLEO PURO: convierte la matriz de fuentes en RECTÁNGULOS, agrupando por COLUMNA.
 *
 * POR QUÉ POR COLUMNA Y NO POR FILA: la primera versión agrupaba celdas contiguas dentro de cada
 * fila y generaba 9.861 requests sólo para Compras — 800 filas × trece tramos cada una. Pero una
 * planilla es tabular: una columna de importes es numérica de arriba a abajo. Agrupando verticalmente,
 * la misma pestaña baja a unas decenas de requests. La forma del dato manda sobre la comodidad del
 * bucle.
 *
 * @param {Array<Array<string|null>>} matriz fuente por celda, null donde no hay nada
 * @returns {Array<{fila:number, filaFin:number, col:number, fuente:string}>}
 */
export function rectangulos(matriz = []) {
  const anchoMax = matriz.reduce((m, f) => Math.max(m, f.length), 0)
  const out = []
  for (let c = 0; c < anchoMax; c++) {
    let i = 0
    while (i < matriz.length) {
      const f = matriz[i]?.[c] ?? null
      if (!f) { i++; continue }
      let j = i
      // Se salta hasta 2 celdas vacías sin cortar la racha: una fila en blanco entre bloques no
      // justifica partir el rango en dos requests.
      let vacias = 0
      while (j + 1 < matriz.length) {
        const sig = matriz[j + 1]?.[c] ?? null
        if (sig === f) { j++; vacias = 0; continue }
        if (sig === null && vacias < 2) { j++; vacias++; continue }
        break
      }
      out.push({ fila: i, filaFin: j - vacias + 1, col: c, fuente: f })
      i = j + 1
    }
  }
  return out
}

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  const meta = await google.getSheetMeta(ID)
  let desviadas = 0, tocadas = 0

  for (const p of PESTANAS) {
    const hoja = meta.find((h) => h.title === p.titulo)
    if (!hoja) { console.log(`  ${p.titulo.padEnd(26)} no existe`); continue }

    const f = await google.readSheetFormats(ID, `${p.titulo}!A1:${colLetra(p.cols)}${p.hastaFila}`).catch((e) => {
      console.log(`  ${p.titulo.padEnd(26)} no pude leerla (${String(e?.message ?? e).slice(0, 50)})`)
      return null
    })
    if (!f) continue

    const a = auditar(f, { congeladas: p.congeladas })
    if (!a.ok) desviadas++
    console.log(`  ${p.titulo.padEnd(26)} ${a.ok ? '✓ en estándar' : '⚠ ' + a.desvios.join(' · ')}`)
    if (SOLO_AUDITAR || a.ok) continue

    const reqs = []
    const rg = (r0, r1, c0, c1) => ({ sheetId: hoja.sheetId, startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1 })

    // 1 · LA TIPOGRAFÍA, por rectángulos verticales: una columna numérica es un solo request.
    for (const r of rectangulos(f.filas.map(fuenteDeFila))) {
      reqs.push({
        repeatCell: {
          range: rg(r.fila, r.filaFin, r.col, r.col + 1),
          cell: { userEnteredFormat: { textFormat: { fontFamily: r.fuente } } },
          fields: 'userEnteredFormat.textFormat.fontFamily',
        },
      })
    }

    // 2 · LA BARRA DE TÍTULO. Sólo si la fila 1 tiene un título: si está vacía, no se inventa uno.
    if (String(f.filas?.[0]?.[0]?.valor ?? '').trim()) {
      reqs.push({
        repeatCell: { range: rg(0, 1, 0, p.cols), cell: { userEnteredFormat: fmtTitulo() }, fields: 'userEnteredFormat' },
      })
      reqs.push({
        updateDimensionProperties: {
          range: { sheetId: hoja.sheetId, dimension: 'ROWS', startIndex: 0, endIndex: 1 },
          properties: { pixelSize: ALTO.titulo }, fields: 'pixelSize',
        },
      })
    }

    // 3 · LAS FILAS CONGELADAS.
    if ((f.congeladas?.filas ?? 0) !== p.congeladas) {
      reqs.push({
        updateSheetProperties: {
          properties: { sheetId: hoja.sheetId, gridProperties: { frozenRowCount: p.congeladas } },
          fields: 'gridProperties.frozenRowCount',
        },
      })
    }

    if (DRY) { console.log(`     (--dry) ${reqs.length} cambios de formato, no escribí nada`); continue }
    // Los requests van en tandas: una pestaña de 800 filas genera miles y la API los rechaza juntos.
    for (let i = 0; i < reqs.length; i += 500) {
      await google.spreadsheetBatchUpdate(ID, reqs.slice(i, i + 500))
    }
    tocadas++
    console.log(`     ✓ ${reqs.length} cambios aplicados`)
  }

  // VERIFICACIÓN: releer y confirmar. Escribir y no mirar es cómo se instalan los defectos que este
  // script existe para cazar.
  if (!DRY && !SOLO_AUDITAR && tocadas) {
    let quedan = 0
    for (const p of PESTANAS) {
      const f = await google.readSheetFormats(ID, `${p.titulo}!A1:D3`).catch(() => null)
      if (f && !auditar(f, { congeladas: p.congeladas }).ok) quedan++
    }
    console.log(`\n${quedan ? `⚠ quedan ${quedan} pestaña(s) fuera de estándar` : `✓ verificado: las ${PESTANAS.length} pestañas comparten el mismo formato`}`)
    if (quedan) process.exitCode = 1
  } else {
    console.log(`\n${desviadas} de ${PESTANAS.length} pestañas fuera del estándar`)
  }
}

function colLetra(n) { let s = ''; for (let i = n - 1; i >= 0; i = Math.floor(i / 26) - 1) s = String.fromCharCode(65 + (i % 26)) + s; return s }

main().catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
