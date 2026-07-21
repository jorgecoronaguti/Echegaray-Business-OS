#!/usr/bin/env node
// QUE TODO TEXTO SE PUEDA LEER ENTERO.
//
// POR QUÉ EXISTE (21/07). El dueño, cuatro veces sobre distintas pestañas: "no se entiende una
// mierda", "todo es un desastre". Los totales estaban bien y no había defectos de formato. Lo que
// pasaba es más simple y más grave: los rótulos, los encabezados y las notas eran más largos que su
// columna y se cortaban a mitad de palabra. Medido en las seis pestañas que el dueño iba a revisar:
// 118 textos que no entraban.
//
// Ningún control que suma ve esto, y el detector de formatos tampoco: hay que MEDIR el texto contra
// el ancho de su columna, que es lo único que decide si algo se puede leer.
//
// ═══ LAS DOS REPARACIONES, Y CUÁNDO VA CADA UNA ═══
//
// 1. ENSANCHAR la columna, cuando el texto es corto y la columna es mezquina. Un encabezado como
//    "Unidad de Negocio" en 100px se arregla con 20px más, no con ingeniería.
// 2. ETIQUETA + NOTA, cuando el texto es un párrafo. Ensanchar una columna a 900px para que entre
//    una explicación de 90 caracteres rompe la tabla entera; el texto completo va a la nota de la
//    celda, donde no se corta y no ocupa pantalla (lib/nota-celda.mjs).
//
// Lo que NO se hace es acortar el texto tirando información: la explicación de por qué un número es
// lo que es vale tanto como el número.
//
//   node orquestador/scripts/reparar-textos.mjs [pestaña] [--dry]

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { detectar } from '../lib/defectos-pantalla.mjs'
import { entranEn } from '../lib/nota-celda.mjs'
import { PESTANAS } from './formato-pestanas.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const SOLO = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : null
const DRY = process.argv.includes('--dry')

/** Hasta acá se puede ensanchar una columna sin romper la tabla. Más que esto, va a nota. */
const ANCHO_MAX = 300
/** Un texto más largo que esto es un párrafo: no se arregla con ancho. */
const ES_PARRAFO = 64

const colIndex = (letras) => [...letras].reduce((a, c) => a * 26 + (c.charCodeAt(0) - 64), 0) - 1

/**
 * NÚCLEO PURO: decide qué hacer con cada texto que no entra.
 * @returns {{ensanchar: Map<number, number>, aNota: Array<{fila:number, col:number, texto:string}>}}
 */
export function planDeReparacion(defectos, anchos = [], filas = []) {
  const ensanchar = new Map()
  const aNota = []
  for (const d of defectos) {
    if (d.tipo !== 'texto_cortado') continue
    const j = colIndex(d.col)
    const texto = String(filas[d.fila - 1]?.[j]?.valor ?? d.valor)
    const tam = filas[d.fila - 1]?.[j]?.formato?.textFormat?.fontSize ?? 10
    const necesita = Math.ceil(texto.length * tam * 0.57) + 16
    // Un párrafo no se arregla ensanchando: rompería la tabla y seguiría sin entrar.
    if (texto.length > ES_PARRAFO || necesita > ANCHO_MAX) { aNota.push({ fila: d.fila, col: j, texto }); continue }
    ensanchar.set(j, Math.max(ensanchar.get(j) ?? anchos[j] ?? 0, necesita))
  }
  return { ensanchar, aNota }
}

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  const meta = await google.getSheetMeta(ID)
  const lista = SOLO ? PESTANAS.filter((p) => p.titulo.toLowerCase().includes(SOLO.toLowerCase())) : PESTANAS
  let total = 0

  for (const p of lista) {
    const hoja = meta.find((h) => h.title === p.titulo)
    if (!hoja) continue
    const alto = Math.min(hoja.rows ?? p.hastaFila, 400)
    const f = await google.readSheetFormats(ID, `${p.titulo}!A1:${col(p.cols)}${alto}`).catch(() => null)
    if (!f) { console.log(`  ${p.titulo.padEnd(26)} no pude leerla`); continue }

    const defectos = detectar(f, { desdeFila: 1 }).filter((d) => d.tipo === 'texto_cortado')
    if (!defectos.length) { console.log(`  ${p.titulo.padEnd(26)} ✓`); continue }

    const { ensanchar, aNota } = planDeReparacion(defectos, f.anchos, f.filas)
    console.log(`  ${p.titulo.padEnd(26)} ${defectos.length} cortado(s) · ${ensanchar.size} columna(s) a ensanchar · ${aNota.length} a nota`)
    total += defectos.length
    if (DRY) continue

    const reqs = []
    for (const [j, px] of ensanchar) {
      reqs.push({ updateDimensionProperties: { range: { sheetId: hoja.sheetId, dimension: 'COLUMNS', startIndex: j, endIndex: j + 1 }, properties: { pixelSize: Math.min(px, ANCHO_MAX) }, fields: 'pixelSize' } })
    }
    // ═══ EL TEXTO LARGO VA A LA NOTA, Y LA CELDA NO SE TOCA ═══
    //
    // La tentación es escribir una etiqueta corta en la celda y mandar el texto completo a la nota.
    // NO SE HACE: muchas de esas celdas son FÓRMULAS, y su texto largo es el RESULTADO. Reemplazarlo
    // por un literal sería cambiar una fórmula por un número pegado — exactamente lo que la regla de
    // oro prohíbe, y encima en nombre de la prolijidad.
    //
    // Así que este reparador es ADITIVO: ensancha lo que se puede ensanchar y agrega la nota con el
    // texto entero. La nota no pisa nada, no se corta, y está a un click. Acortar el rótulo cuando
    // corresponde es trabajo del script dueño de la pestaña, que sabe si puede.
    for (const n of aNota) {
      reqs.push({
        updateCells: {
          range: { sheetId: hoja.sheetId, startRowIndex: n.fila - 1, endRowIndex: n.fila, startColumnIndex: n.col, endColumnIndex: n.col + 1 },
          rows: [{ values: [{ note: n.texto }] }],
          fields: 'note',
        },
      })
    }
    for (let i = 0; i < reqs.length; i += 200) await google.spreadsheetBatchUpdate(ID, reqs.slice(i, i + 200))
  }
  console.log(`\n${total ? `${total} texto(s) que no entraban` : '✓ todo el texto entra en su celda'}`)
}

function col(n) { let s = ''; for (let i = n - 1; i >= 0; i = Math.floor(i / 26) - 1) s = String.fromCharCode(65 + (i % 26)) + s; return s }

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
}
