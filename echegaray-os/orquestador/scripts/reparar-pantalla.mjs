#!/usr/bin/env node
// DEVUELVE SU FORMATO A LAS CELDAS QUE QUEDARON CON EL DE LA COLUMNA.
//
// POR QUÉ (21/07). El auditor de pantalla encontró el mismo defecto en siete pestañas distintas, y
// siempre por la misma causa: el script pinta un RECTÁNGULO entero con formato de moneda —porque la
// mayoría de esa zona son importes— y después no le devuelve el suyo a las celdas que no lo son. Así
// quedaron "ARS", "Total retenido", "Cantidad", "Alícuota medida" y treinta y siete notas mostradas
// como si fueran plata.
//
// ═══ POR QUÉ SE REPARA POR CONTENIDO Y NO POR POSICIÓN ═══
//
// La tentación era arreglar cada script agregándole un `fmt(fila 25, columna D…)`. Ya sé cómo
// termina eso: el 21/07 el control de Cobranzas decidía el formato con una regex sobre el texto del
// rótulo, y al mejorar dos redacciones los conteos pasaron a mostrarse como "$4". Un formato atado a
// una coordenada o a una palabra se desincroniza la próxima vez que el bloque crece una fila.
//
// Acá el criterio es el CONTENIDO de la celda, que es un hecho: si adentro hay una frase, no es un
// importe, y no puede serlo por más que el bloque se mueva.
//
// ═══ QUÉ NO REPARA, Y POR QUÉ ═══
//
// · fecha_cero → la causa es una fórmula (un MINIFS que devuelve 0). Pisarle el formato taparía el
//   problema dejando la fórmula rota. Se arregla en el script que la escribe.
// · cuit_sin_formato → hay que reescribir el valor, no el formato.
// · hueco → es un colchón de derrame mal dimensionado; se corrige donde se decide el tamaño.
//
// Esos tres se informan y no se tocan. Reparar lo que se puede y callar lo que no sería peor que no
// reparar nada.
//
//   node orquestador/scripts/reparar-pantalla.mjs [--dry] [pestaña]

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { detectar, resumen } from '../lib/defectos-pantalla.mjs'
import { PESTANAS } from './formato-pestanas.mjs'
import * as E from '../lib/estilo-pestana.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const DRY = process.argv.includes('--dry')
const SOLO = process.argv.slice(2).find((a) => !a.startsWith('--'))

/** A partir de cuántos caracteres una celda de texto es una NOTA y no un rótulo. */
const LARGO_NOTA = 45

/**
 * NÚCLEO PURO: qué formato le corresponde a una celda que quedó con el de la columna.
 *
 * Tres casos, decididos por lo que la celda TIENE adentro:
 *   · una frase larga  → es una nota al costado: chica, gris, itálica
 *   · varias en la misma fila → es la fila de ENCABEZADO de una tabla
 *   · una palabra suelta → es un rótulo o una unidad ("ARS", "U$S 581,39"): texto a secas
 */
export function formatoQueVa(valor, esFilaDeEncabezado) {
  if (esFilaDeEncabezado) return E.encabezado()
  if (String(valor ?? '').length >= LARGO_NOTA) return E.nota()
  return E.celda('texto')
}

/**
 * NÚCLEO PURO: ¿qué filas son de encabezado?
 * Una fila con TRES O MÁS celdas de texto donde debería haber números es un encabezado de tabla, no
 * tres errores sueltos. Distinguirlo importa: un encabezado va con el fondo del estándar, y una nota
 * suelta no.
 */
export function filasDeEncabezado(defectos = []) {
  const porFila = new Map()
  for (const d of defectos.filter((x) => x.tipo === 'texto_en_numero')) {
    porFila.set(d.fila, (porFila.get(d.fila) ?? 0) + 1)
  }
  return new Set([...porFila.entries()].filter(([, n]) => n >= 3).map(([f]) => f))
}

const col0 = (letra) => { let n = 0; for (const c of letra) n = n * 26 + (c.charCodeAt(0) - 64); return n - 1 }
function colLetra(n) { let s = ''; for (let i = n - 1; i >= 0; i = Math.floor(i / 26) - 1) s = String.fromCharCode(65 + (i % 26)) + s; return s }

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  const meta = await google.getSheetMeta(ID)
  // Las pestañas de CARGA son del dueño: se auditan, no se reformatean. Cambiarle el formato a una
  // planilla donde alguien carga a mano todos los días es cambiarle el escritorio sin preguntarle.
  const lista = (SOLO ? PESTANAS.filter((p) => p.titulo.toLowerCase().includes(SOLO.toLowerCase())) : PESTANAS)
    .filter((p) => !p.carga)
  let reparadas = 0, sinReparar = 0

  for (const p of lista) {
    const hoja = meta.find((h) => h.title === p.titulo)
    if (!hoja) continue
    const f = await google.readSheetFormats(ID, `${p.titulo}!A1:${colLetra(p.cols)}${p.hastaFila}`).catch(() => null)
    if (!f) { console.log(`  ${p.titulo.padEnd(26)} no pude leerla`); continue }

    const d = detectar(f)
    const arreglables = d.filter((x) => x.tipo === 'texto_en_numero')
    // texto_apretado: la celda YA está en WRAP y su contenido es correcto —sólo la fila es más baja
    // que las líneas que necesita, así que se ve la primera y el resto queda cortado abajo—. Subir el
    // alto de la fila al que el propio detector calculó (altoNecesario) borra el defecto sin tocar ni
    // el contenido ni el formato. Es seguro y universal, así se deja de acortar la misma clase de nota
    // pestaña por pestaña. NO se toca texto_cortado: ese sí exige decidir (ensanchar, envolver o
    // acortar) y se resuelve en el script que lo escribe.
    const apretados = d.filter((x) => x.tipo === 'texto_apretado')
    const otros = d.filter((x) => x.tipo !== 'texto_en_numero' && x.tipo !== 'texto_apretado')
    if (!d.length) { console.log(`  ${p.titulo.padEnd(26)} ✓`); continue }

    const cabeceras = filasDeEncabezado(d)
    const reqs = arreglables.map((x) => ({
      repeatCell: {
        range: { sheetId: hoja.sheetId, startRowIndex: x.fila - 1, endRowIndex: x.fila, startColumnIndex: col0(x.col), endColumnIndex: col0(x.col) + 1 },
        cell: { userEnteredFormat: formatoQueVa(x.valor, cabeceras.has(x.fila)) },
        fields: 'userEnteredFormat',
      },
    }))
    // Una fila puede tener varias celdas apretadas: se le pone el alto MÁXIMO que pida cualquiera.
    const altoPorFila = new Map()
    for (const x of apretados) altoPorFila.set(x.fila, Math.max(altoPorFila.get(x.fila) ?? 0, x.altoNecesario ?? 0))
    for (const [fila, alto] of altoPorFila) {
      if (!alto) continue
      reqs.push({ updateDimensionProperties: { range: { sheetId: hoja.sheetId, dimension: 'ROWS', startIndex: fila - 1, endIndex: fila }, properties: { pixelSize: alto }, fields: 'pixelSize' } })
    }

    console.log(`  ${p.titulo.padEnd(26)} ${arreglables.length + altoPorFila.size} reparable(s)${otros.length ? ` · ${otros.length} que NO se tocan` : ''}`)
    for (const r of resumen(otros)) console.log(`     ✗ ${String(r.n).padStart(2)}× ${r.tipo} (ej. ${r.ejemplo.col}${r.ejemplo.fila}) — se arregla en el script que lo escribe`)
    sinReparar += otros.length
    if (DRY || !reqs.length) continue
    for (let i = 0; i < reqs.length; i += 300) await google.spreadsheetBatchUpdate(ID, reqs.slice(i, i + 300))
    reparadas += reqs.length
  }

  if (DRY) { console.log('\n(--dry) no escribí nada'); return }

  // VERIFICACIÓN: releer y contar lo que quedó.
  let quedan = 0
  for (const p of lista) {
    const f = await google.readSheetFormats(ID, `${p.titulo}!A1:${colLetra(p.cols)}${p.hastaFila}`).catch(() => null)
    if (f) quedan += detectar(f).filter((x) => x.tipo === 'texto_en_numero' || x.tipo === 'texto_apretado').length
  }
  console.log(`\n✓ ${reparadas} celda(s)/fila(s) reparadas · quedan ${quedan} de formato/alto${sinReparar ? ` y ${sinReparar} que necesitan tocar el script` : ''}`)
  if (quedan) process.exitCode = 1
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
}
