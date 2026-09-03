#!/usr/bin/env node
// AVISA CUÁNDO ALGUIEN PEGÓ UN VALOR SOBRE UNA COLUMNA CALCULADA. NO LO DESHACE.
//
// ═══ POR QUÉ EXISTE (21/07) ═══
//
// El dueño: "los IDs de Cobranzas no son únicos, ¿los renumeramos?" — sí. Pero al ir a hacerlo
// apareció que la columna nunca tuvo IDs a mano: es `=IF(C51="";"";ROW()-4)`, que por construcción no
// puede repetirse. Lo que había era un pegado de valores sobre dos celdas, las filas 50 y 54, que son
// justamente el par duplicado de San Francisco. Renumerar habría sido el arreglo equivocado.
//
// ═══ POR QUÉ YA NO ESCRIBE (03/09) ═══
//
// Hasta hoy DEVOLVÍA la fórmula: `google.updateSheetValues` crudo, celda por celda, con la Regla 0
// apagada a propósito ("este script existe justamente para DESHACER una edición a mano"). Eso quedó
// prohibido por una orden explícita del dueño: *"lo único que requiero siempre es que mis ediciones en
// el archivo sean las que manden y siempre se respeten"*, y después: *"todo lo que escribo, borro,
// modifico, agrego, saco, edito de diseño, cambio de lugar, copio y pego"*.
//
// Un valor pegado sobre una columna calculada ES una de esas ediciones. Puede ser un error —y por eso
// se sigue informando, fuerte y con la fórmula que iría— pero **quién decide si se deshace es él**, no
// un timer que corre cada dos horas. El argumento viejo ("la Regla de Oro prohíbe números sueltos") no
// sobrevive al choque: la regla gobierna lo que ESCRIBE EL OS, no lo que escribe el dueño.
//
// Lo que sí gana: cada pegado queda REGISTRADO en `sheet_reconciliacion_celda` con accion='informada',
// así el aviso no se pierde con el scrollback de una corrida.
//
//   node orquestador/scripts/columnas-calculadas.mjs [--dry]
//
// `--dry` ya no cambia nada —este script nunca escribe— y se acepta para no romper a quien lo llame.

import { makeGoogleClient, READONLY_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { detectar, resumen } from '../lib/columna-formula.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'

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

/**
 * Mira las columnas vigiladas y devuelve los pegados. NO escribe una sola celda: el cliente que se le
 * pasa sólo necesita `readSheetGrid`. Impura del lado Sheets; el registro en la base es aparte.
 */
export async function detectarPegados(google, vigiladas = VIGILADAS, log = console.log) {
  const pegados = []
  let ambiguas = 0
  for (const v of vigiladas) {
    const grid = await google.readSheetGrid(ID, `${v.pestana}!${v.col}${v.desde}:${v.col}${v.hasta}`).catch((e) => {
      log(`  ${v.pestana}!${v.col}: no pude leerla (${String(e?.message ?? e).slice(0, 70)})`)
      return null
    })
    if (!grid) continue
    const d = detectar(grid.filas.map((f, i) => ({ fila: v.desde + i, formula: f?.[0]?.formula ?? null, valor: f?.[0]?.valor ?? '' })))
    log(`  ${resumen(d, `${v.pestana}!${v.col} · ${v.que}`)}`)
    // QUÉ NO HACE: no opina sobre una columna donde convivan dos fórmulas distintas. Puede ser
    // legítimo y elegir la más frecuente sería inventar cuál es la buena.
    if (d.ambigua) { ambiguas++; continue }
    for (const p of d.pisadas) pegados.push({ pestana: v.pestana, celda: `${v.col}${p.fila}`, valor: p.valor, formula: p.deberia })
  }
  return { pegados, ambiguas }
}

/** El aviso, que es todo el producto de este script. */
export function avisar(pegados = [], log = console.log) {
  for (const p of pegados) {
    log(`▲ valor pegado sobre fórmula en ${p.pestana}!${p.celda}: «${p.valor}» (la fórmula sería ${p.formula})`)
  }
  return pegados.length
}

async function main() {
  // READONLY, no WRITE: la incapacidad de escribir es del TOKEN, no de una rama del código. Un
  // "no escribe" que depende de un `if` se vuelve a romper la próxima vez que alguien agregue una rama.
  const google = makeGoogleClient({ config: loadConfig(), scopes: READONLY_SCOPES })
  const { pegados, ambiguas } = await detectarPegados(google)

  if (!pegados.length) {
    console.log(`\n✓ ninguna celda calculada pisada${ambiguas ? ` (${ambiguas} columna(s) ambigua(s) para mirar a mano)` : ''}`)
    return
  }
  console.log('')
  avisar(pegados)
  console.log(`\n${pegados.length} celda(s) con un valor pegado sobre la fórmula. NO las toco: son tus ediciones.`)
  console.log('   Si querés devolverles la fórmula, decímelo y lo hago celda por celda con vos mirando.')

  try {
    const { registrarCelda } = await import('../lib/reconciliacion-firma.mjs')
    for (const p of pegados) {
      await registrarCelda({}, ID, p.pestana, p.celda, {
        valorDueno: String(p.valor), valorOs: String(p.formula),
        causa: 'valor pegado sobre una columna calculada', accion: 'informada', estado: 'registrada',
      })
    }
  } catch (e) {
    console.log(`· no pude registrar los avisos en la base (${String(e.message).slice(0, 70)}) — quedan en este log`)
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
}
