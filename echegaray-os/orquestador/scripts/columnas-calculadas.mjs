#!/usr/bin/env node
// DEVUELVE LA FÓRMULA A LAS CELDAS DONDE ALGUIEN PEGÓ UN VALOR ENCIMA.
//
// POR QUÉ (21/07). El dueño: "los IDs de Cobranzas no son únicos, ¿los renumeramos?" — sí. Pero al
// ir a hacerlo apareció que la columna nunca tuvo IDs a mano: es `=IF(C51="";"";ROW()-4)`, que por
// construcción no puede repetirse. Lo que había era un pegado de valores sobre dos celdas, las filas
// 50 y 54, que son justamente el par duplicado de San Francisco.
//
// Renumerar habría sido el arreglo equivocado: 54 números escritos a mano donde había una fórmula
// que se mantiene sola, y el próximo pegado rompiéndola otra vez sin que nadie se entere. Esto
// devuelve la fórmula y deja el control corriendo cada dos horas.
//
// LA REGLA DE ORO QUE APLICA: "en el Sheet NUNCA números sueltos calculados por código; fórmulas o
// celdas con origen trazable". Un valor pegado sobre una columna calculada es exactamente el número
// suelto que la regla prohíbe — sólo que lo pegó una persona, no el código.
//
// QUÉ NO HACE: no toca una columna donde convivan dos fórmulas distintas. Puede ser legítimo y
// elegir la más frecuente pisaría la otra. Esas se informan y las mira un humano.
//
//   node orquestador/scripts/columnas-calculadas.mjs [--dry]

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { detectar, resumen } from '../lib/columna-formula.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const DRY = process.argv.includes('--dry')

/**
 * Las columnas CALCULADAS que el OS vigila. Una columna entra acá cuando su contenido se deriva de
 * otras celdas: si alguien pega un valor encima, deja de derivarse y nadie se entera.
 *
 * No están todas las del archivo a propósito: se agregan a medida que se verifica que son calculadas
 * de punta a punta. Una columna mixta metida acá generaría ruido y el control dejaría de mirarse.
 */
export const VIGILADAS = [
  { pestana: 'Cobranzas', col: 'A', desde: 5, hasta: 400, que: 'ID (autonumerado por ROW)' },
  { pestana: 'Cobranzas', col: 'R', desde: 5, hasta: 400, que: 'Mes de cobro (derivado de la fecha)' },
]

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })

  const leer = async (v) => {
    const grid = await google.readSheetGrid(ID, `${v.pestana}!${v.col}${v.desde}:${v.col}${v.hasta}`).catch((e) => {
      console.log(`  ${v.pestana}!${v.col}: no pude leerla (${String(e?.message ?? e).slice(0, 70)})`)
      return null
    })
    if (!grid) return null
    return detectar(grid.filas.map((f, i) => ({ fila: v.desde + i, formula: f?.[0]?.formula ?? null, valor: f?.[0]?.valor ?? '' })))
  }

  const reparar = []
  let ambiguas = 0
  for (const v of VIGILADAS) {
    const d = await leer(v)
    if (!d) continue
    console.log(`  ${resumen(d, `${v.pestana}!${v.col} · ${v.que}`)}`)
    if (d.ambigua) { ambiguas++; continue }
    for (const p of d.pisadas) {
      console.log(`     fila ${p.fila}: tenía "${p.valor}" pegado a mano → ${p.deberia}`)
      reparar.push({ v, p })
    }
  }

  if (!reparar.length) {
    console.log(`\n✓ ninguna celda calculada pisada${ambiguas ? ` (${ambiguas} columna(s) ambigua(s) para mirar a mano)` : ''}`)
    return
  }
  if (DRY) { console.log(`\n(--dry) ${reparar.length} celda(s) a reparar, no escribí nada`); return }

  // Se escribe celda por celda con USER_ENTERED, que es quien localiza la fórmula a es-AR
  // (separador `;`). Son poquísimas celdas: no hace falta un batch.
  for (const { v, p } of reparar) {
    await google.updateSheetValues(ID, `${v.pestana}!${v.col}${p.fila}`, [[p.deberia]])
  }
  console.log(`\n✓ ${reparar.length} celda(s) devueltas a su fórmula`)

  // VERIFICACIÓN: releer y confirmar. Escribir y no mirar es cómo se instalan los defectos
  // silenciosos que este script existe para cazar.
  let quedan = 0
  for (const v of VIGILADAS) {
    const d = await leer(v)
    if (d && !d.ambigua) quedan += d.pisadas.length
  }
  console.log(quedan ? `⚠ quedan ${quedan} sin reparar` : '✓ verificado: no queda ninguna celda pisada')
  if (quedan) process.exitCode = 1
}

main().catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
